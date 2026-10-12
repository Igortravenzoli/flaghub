-- =============================================================================
-- EG-6 (PR-8) — vdesk-sync-base-clientes, devops-qa-alert e devops-sync-qualidade
--               param de baixar linhas só para compará-las e jogá-las fora
--
-- ── O problema medido (edge_logs de 10–11/10/2026, 24h; bytes crus estimados
--    pelo JSON das mesmas linhas no PROD em 11/10/2026) ───────────────────────
--
--   vdesk-sync-base-clientes  96 rodadas/dia (cron `sync-vdesk-clientes`, */15)  ~16 MB/dia
--     3 páginas de (id, nome, source_hash, status) dos 2.064 clientes, ~170 kB
--     por rodada, para comparar `source_hash`. Nas 95 rodadas ok do dia:
--     ZERO linhas gravadas e zero inativadas.
--
--   devops-sync-qualidade     143 rodadas/dia (cron `sync-devops-qualidade`)      ~7,7 MB/dia
--     a fila inteira da Qualidade (119 itens) com `custom_fields` embutido,
--     ~54 kB por rodada, para descobrir quem mudou desde o último carimbo
--     `qa_retorno_synced_at`. Em 11/10/2026: zero candidatos.
--
--   devops-qa-alert           144 rodadas/dia (chamada pelo devops-sync-all)      ~9,5 MB/dia
--     · os 33 itens "Em desenvolvimento" com `state_history`, ~31 kB, para achar
--       evidência de retorno de QA. Em 11/10/2026: NENHUM tinha evidência sem
--       evento já aberto (o último alerta é de 08/10/2026).
--     · os ~156 filhos desses itens, ~35 kB, pré-carregados para enfeitar um
--       cartão de Teams que quase nunca é montado.
--     · 1 + 2 por evento aberto (6 hoje): ~1.900 requisições/dia de 0–1 linha
--       (`devops_qa_return_events?select=id`, `devops_work_items?select=state`).
--
-- Somando, ~33 MB/dia de ~0 informação útil.
--
-- ── A correção ─────────────────────────────────────────────────────────────
-- Mesma receita da EG-2 (20260921120000_eg2_sync_all_rpcs): a comparação vai
-- para dentro do banco e a edge recebe só o resultado. Retorno ESCALAR
-- (jsonb) de propósito: o PostgREST deste projeto roda com `max_rows = 1000` e
-- corta em silêncio função SETOF/TABLE; um jsonb é um valor só.
--
-- Onde a regra da edge usa semântica de JavaScript que o SQL não reproduz de
-- graça (toLowerCase/toUpperCase de Unicode, `new Date()` de texto livre), a
-- função NÃO tenta imitar: devolve um SUPERCONJUNTO garantido e a edge aplica a
-- regra original em cima dele. Superconjunto + regra original = resultado
-- original. O comentário de cada função prova o "garantido".
--
-- Nenhuma função escreve. Não há SECURITY DEFINER: só as edges chamam, com
-- service_role, que já lê essas tabelas direto.
-- =============================================================================


-- ── 1. Diff de vdesk_clients (vdesk-sync-base-clientes) ──────────────────────
--
-- A edge manda, na ordem da carga normalizada, (nome, source_hash, status) de
-- cada cliente vindo do gateway; volta:
--
--   gravar     posições (0-based) da carga que precisam de upsert. Regra da edge:
--                  !atual || atual.source_hash !== c.source_hash || atual.status !== c.status
--              com `atual` achado por nome. `IS DISTINCT FROM` é o `!==` com
--              NULL: hash/status nulos no banco contra texto da carga = mudou.
--   inativar   ids, em ordem de id, de quem está na base, NÃO veio na carga e não
--              está 'Inativo' — a reconciliação. Calculado ANTES do upsert, como
--              a edge fazia com a leitura `existentes`. A edge continua dona de
--              QUANDO aplicar (carga não vazia e nenhum chunk com erro).
--   na_base    total de linhas, só para o log.
--
-- Nome que não é texto no JavaScript chega aqui como NULL: `NULL = nome` nunca
-- casa, então ele cai em "cliente novo" e não protege ninguém da inativação —
-- exatamente o que `Map.get`/`Set.has` com número faziam. Status que não é
-- texto a edge força como "mudou" do lado dela (no JS `!==` entre texto e não
-- texto é sempre verdadeiro), sem depender desta função.
--
-- Comparação de nome é `=` de texto com collation determinística: igual só se
-- os bytes são iguais, como a chave do Map.

CREATE OR REPLACE FUNCTION public.rpc_vdesk_clientes_diff(
  p_nomes  text[],
  p_hashes text[],
  p_status text[]
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  WITH carga AS (
    SELECT c.nome, c.hash, c.status, c.ord
    FROM unnest(p_nomes, p_hashes, p_status) WITH ORDINALITY AS c(nome, hash, status, ord)
  )
  SELECT jsonb_build_object(
    'gravar', coalesce((
      SELECT jsonb_agg(c.ord - 1 ORDER BY c.ord)
      FROM carga c
      LEFT JOIN public.vdesk_clients v ON v.nome = c.nome
      WHERE v.id IS NULL
         OR v.source_hash IS DISTINCT FROM c.hash
         OR v.status      IS DISTINCT FROM c.status
    ), '[]'::jsonb),
    'inativar', coalesce((
      SELECT jsonb_agg(v.id ORDER BY v.id)
      FROM public.vdesk_clients v
      WHERE v.status IS DISTINCT FROM 'Inativo'
        AND NOT EXISTS (SELECT 1 FROM carga c WHERE c.nome = v.nome)
    ), '[]'::jsonb),
    'na_base', (SELECT count(*) FROM public.vdesk_clients)
  );
$fn$;

COMMENT ON FUNCTION public.rpc_vdesk_clientes_diff(text[], text[], text[]) IS
  'Diff da carga do gateway contra vdesk_clients: posições (0-based) a gravar (novo, hash ou '
  'status diferente), ids a inativar (fora da carga e não Inativo) e o total na base. Espelha o '
  'filtro e a reconciliação da edge vdesk-sync-base-clientes. Retorno escalar: não sofre o max_rows.';

REVOKE EXECUTE ON FUNCTION public.rpc_vdesk_clientes_diff(text[], text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_vdesk_clientes_diff(text[], text[], text[]) TO service_role;


-- ── 2. Candidatos a alerta de retorno de QA (devops-qa-alert, passo 1) ──────
--
-- Itens em `p_estado` ("Em desenvolvimento") SEM evento aberto e com POSSÍVEL
-- evidência de retorno de QA, com as mesmas colunas que a edge lia. A edge
-- reaplica `findQaReturnTransitions`/`hasQaReturnTag` e o dedupe por item.
--
-- Por que "sem evento aberto" é exato: na edge, item com evento aberto dá
-- `continue` antes de qualquer efeito. Tirá-lo aqui só não o baixa.
--
-- Por que a evidência é SUPERCONJUNTO garantido. A edge exige, case-insensitive
-- via `toLowerCase()`, 'retorno qa' numa tag OU uma transição cujo oldValue
-- contém 'em teste' e newValue contém 'em desenvolvimento'. Aqui o rebaixamento
-- é `translate` só de A–Z (independe de locale). O único jeito de o
-- `toLowerCase()` produzir letra ASCII a partir de não-ASCII é 'K' (Kelvin,
-- vira 'k', que não aparece nos padrões) e 'İ' (vira 'i' + U+0307: o 'i'
-- só casaria como ÚLTIMA letra do padrão, e nenhum dos três termina em 'i').
-- Logo, todo texto que casa no JavaScript casa aqui. O contrário não precisa
-- valer: excesso é filtrado na edge.
--
-- Válvulas de escape (devolve a linha para a edge decidir, e a edge faz o que
-- sempre fez — inclusive quebrar): `state_history` que não é array nem nulo
-- (`.filter` de objeto lança), elemento nulo (`null.oldValue` lança), e
-- oldValue/newValue que não são texto (`toLowerCase` de número lança). Em
-- 11/10/2026 não havia nenhum desses casos na tabela inteira.
--
-- Ordem por id: o `.select()` da edge não tinha ORDER BY (ordem do heap). A
-- ordem só decide a sequência dos alertas da mesma rodada.

CREATE OR REPLACE FUNCTION public.rpc_qa_retorno_candidatos(p_estado text)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id,
           'title', w.title,
           'work_item_type', w.work_item_type,
           'area_path', w.area_path,
           'iteration_path', w.iteration_path,
           'assigned_to_display', w.assigned_to_display,
           'assigned_to_unique', w.assigned_to_unique,
           'state', w.state,
           'tags', w.tags,
           'web_url', w.web_url,
           'state_history', w.state_history
         ) ORDER BY w.id), '[]'::jsonb)
  FROM public.devops_work_items w
  WHERE w.state = p_estado
    AND NOT EXISTS (
      SELECT 1 FROM public.devops_qa_return_events e
      WHERE e.work_item_id = w.id AND e.is_open = true
    )
    AND (
      strpos(translate(coalesce(w.tags, ''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'retorno qa') > 0
      OR (w.state_history IS NOT NULL AND jsonb_typeof(w.state_history) NOT IN ('array', 'null'))
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(w.state_history) = 'array' THEN w.state_history ELSE '[]'::jsonb END
        ) h(ch)
        WHERE jsonb_typeof(h.ch) = 'null'
           OR (jsonb_typeof(h.ch) = 'object' AND (
                coalesce(jsonb_typeof(h.ch->'oldValue'), 'null') NOT IN ('string', 'null')
             OR coalesce(jsonb_typeof(h.ch->'newValue'), 'null') NOT IN ('string', 'null')
             OR (strpos(translate(h.ch->>'oldValue', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'em teste') > 0
                 AND strpos(translate(h.ch->>'newValue', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'em desenvolvimento') > 0)
           ))
      )
    );
$fn$;

COMMENT ON FUNCTION public.rpc_qa_retorno_candidatos(text) IS
  'Itens no estado p_estado sem evento de retorno de QA aberto e com possível evidência (tag '
  '"retorno qa" ou transição em teste → em desenvolvimento), superconjunto garantido do filtro da '
  'edge devops-qa-alert, que reaplica a regra original. Retorno escalar: não sofre o max_rows.';

REVOKE EXECUTE ON FUNCTION public.rpc_qa_retorno_candidatos(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_qa_retorno_candidatos(text) TO service_role;


-- ── 3. Eventos abertos com o estado atual do item (devops-qa-alert, passo 2) ─
--
-- Troca 1 + N leituras (a lista de abertos e um `select state` por evento) por
-- uma. Aqui NÃO há regra: a função só junta o estado, e a edge decide com o
-- mesmo `wi?.state?.toLowerCase().includes('em desenvolvimento')`. `existe`
-- distingue "item sumiu" (a edge fechava) de "estado nulo" (também fechava,
-- mas é bom o log saber).
--
-- Ordem por id: o `.select()` da edge não tinha ORDER BY.

CREATE OR REPLACE FUNCTION public.rpc_qa_eventos_abertos()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'work_item_id', e.work_item_id,
           'existe', w.id IS NOT NULL,
           'state', w.state
         ) ORDER BY e.id), '[]'::jsonb)
  FROM public.devops_qa_return_events e
  LEFT JOIN public.devops_work_items w ON w.id = e.work_item_id
  WHERE e.is_open = true;
$fn$;

COMMENT ON FUNCTION public.rpc_qa_eventos_abertos() IS
  'Eventos de retorno de QA abertos com o estado atual do work item (existe=false se sumiu). '
  'A edge devops-qa-alert decide quem fechar. Retorno escalar: não sofre o max_rows.';

REVOKE EXECUTE ON FUNCTION public.rpc_qa_eventos_abertos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_qa_eventos_abertos() TO service_role;


-- ── 4. Fila da Qualidade (devops-sync-qualidade) ─────────────────────────────
--
-- A edge lia a fila inteira (`devops_query_items_current` ⨝ `devops_work_items`,
-- com `custom_fields`) só para:
--
--   fila        quantos itens da fila estão em `p_estados`        → contado aqui
--   avioes      quantos têm 'AVIAO' nas tags (toUpperCase)         → tags suspeitas
--   candidatos  quem `precisaRevisitar` (ou todos, com force)     → superconjunto
--
-- `tags_suspeitas` — tags dos itens da fila cujo texto, com A–z subido por
-- `translate`, contém 'AVIAO', MAIS as de qualquer item com caractere não-ASCII
-- nas tags. A edge conta com o `toUpperCase()` dela. Garantia: texto só-ASCII
-- sobe igual nos dois lados; texto com não-ASCII (onde o JavaScript tem
-- expansões como 'ı' → 'I', 'ﬁ' → 'FI') vai inteiro para a edge decidir.
--
-- `candidatos` — linhas completas (id, state, custom_fields, tags,
-- iteration_path, changed_date), com `force` = todas da fila. Sem `force`, só
-- fica DE FORA o item cujo carimbo `custom_fields.qa_retorno_synced_at` é
-- texto no formato exato do `toISOString()` (YYYY-MM-DDTHH:MM:SS.mmmZ), que o
-- Postgres aceita como timestamptz, e cujo `changed_date` é nulo ou não passa
-- de carimbo − 1 ms. Para esse item a edge diria "não revisita":
--   · `!syncedAt` é falso (texto não vazio);
--   · `new Date()` desse formato dá o mesmo instante que o cast — e o formato é
--     o único que a própria edge grava (11/10/2026: 119 de 119 carimbos);
--   · `changed_date` nulo → `return false`;
--   · o `Date` do JavaScript trunca o `changed_date` em ms; se
--     changed ≤ carimbo − 1 ms, então trunc_ms(changed) ≤ carimbo, e
--     `mudou > sincronizou` é falso.
-- Qualquer outra coisa (carimbo ausente, nulo, número, texto em outro formato,
-- data que o Postgres recusa) volta para a edge, que reaplica `precisaRevisitar`.
--
-- O `!inner` do PostgREST vira o JOIN: item da fila sem linha em
-- `devops_work_items` não conta, como antes.

CREATE OR REPLACE FUNCTION public.rpc_qualidade_fila(
  p_query_id uuid,
  p_estados  text[],
  p_force    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  WITH fila AS (
    SELECT w.id, w.state, w.custom_fields, w.tags, w.iteration_path, w.changed_date,
           w.custom_fields->'qa_retorno_synced_at' AS carimbo
    FROM public.devops_query_items_current q
    JOIN public.devops_work_items w ON w.id = q.work_item_id
    WHERE q.query_id = p_query_id
      AND w.state = ANY (p_estados)
  ),
  avaliada AS (
    SELECT f.*,
           CASE
             WHEN jsonb_typeof(f.carimbo) = 'string'
              AND (f.carimbo #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
              AND pg_input_is_valid(f.carimbo #>> '{}', 'timestamptz')
             THEN (f.carimbo #>> '{}')::timestamptz
           END AS carimbo_ts
    FROM fila f
  )
  SELECT jsonb_build_object(
    'fila', (SELECT count(*) FROM avaliada),
    'tags_suspeitas', coalesce((
      SELECT jsonb_agg(a.tags ORDER BY a.id)
      FROM avaliada a
      WHERE strpos(translate(coalesce(a.tags, ''), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'AVIAO') > 0
         OR coalesce(a.tags, '') ~ '[^\x01-\x7F]'
    ), '[]'::jsonb),
    'candidatos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id,
               'state', a.state,
               'custom_fields', a.custom_fields,
               'tags', a.tags,
               'iteration_path', a.iteration_path,
               'changed_date', a.changed_date
             ) ORDER BY a.id)
      FROM avaliada a
      WHERE p_force
         OR a.carimbo_ts IS NULL
         OR (a.changed_date IS NOT NULL AND a.changed_date > a.carimbo_ts - interval '1 millisecond')
    ), '[]'::jsonb)
  );
$fn$;

COMMENT ON FUNCTION public.rpc_qualidade_fila(uuid, text[], boolean) IS
  'Fila da Qualidade resumida: total em p_estados, tags que podem conter AVIAO e as linhas que '
  'podem precisar de revisita (superconjunto garantido de precisaRevisitar; todas com p_force). '
  'A edge devops-sync-qualidade reaplica as regras originais. Retorno escalar: não sofre o max_rows.';

REVOKE EXECUTE ON FUNCTION public.rpc_qualidade_fila(uuid, text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_qualidade_fila(uuid, text[], boolean) TO service_role;
