-- =============================================================================
-- EG-4 — devops-sync-timelog envia só o que mudou (diff por balde)
--
-- ── O problema medido (21 a 27/09/2026, edge_logs, dia BRT) ──────────────────
-- A cada 15 min (96×/dia) a edge regravava a base INTEIRA na Fase A: ~8,6 mil
-- lançamentos em lotes de 500, cada linha com o `raw` completo.
--
--   upload    POST devops_time_logs: 483 MB/dia (1.722 requests)
--   efeito    trg_time_log_revision cancela o UPDATE sem mudança, então a
--             tabela não muda — mas o ON CONFLICT trava a tupla antes do
--             trigger e escreve WAL do mesmo jeito (ver a análise de Disk IO
--             de 26/08/2026).
--   mudança   1 a 61 lançamentos novos por dia; 0 a 2 regravados por rodada.
--
-- Depois do EG-3 (órfãos no banco) a edge ainda subia os ~8,6 mil ids a cada
-- rodada só para reconciliar órfãos: +334 KB × 96 = ~31 MB/dia.
--
-- ── A correção: duas rodadas pequenas em vez de reenviar tudo ───────────────
-- Impressão de um lançamento = sha256(ext_entry_id || '|' || raw::text).
-- O TS calcula a mesma coisa em supabase/functions/_shared/timelogImpressao.ts
-- (jsonbTexto reproduz o raw::text). Em 28/09/2026: 8.625 de 8.625 impressões
-- iguais entre o TS e o Postgres, mais fixtures com escape, acento, emoji,
-- aninhamento e número negativo/decimal.
--
--   rodada 1  a edge manda, por balde (2 primeiros caracteres do id: até 256),
--             a quantidade e a soma dos 60 primeiros bits das impressões
--             (~8 KB). O banco faz a mesma conta sobre a base ATIVA (sem os
--             órfãos) e devolve os baldes que divergem.
--   rodada 2  só para os baldes divergentes, a edge manda id + 64 bits da
--             impressão de cada lançamento (~2 KB por balde). O banco devolve
--             os ids que precisam ser gravados e reconcilia os órfãos.
--
-- Sem mudança: 1 chamada de ~8 KB. Com lançamento novo: +1 chamada de ~2 KB e
-- o upsert só dessas linhas. Estimativa: ~1 MB/dia de upload no lugar de ~514.
--
-- ── Por que não o etag ──────────────────────────────────────────────────────
-- Em 28/09/2026 os 8.625 lançamentos tinham __etag = 1: a extensão não
-- incrementa na edição, então comparar etag deixaria passar lançamento editado.
--
-- ── Semântica preservada ────────────────────────────────────────────────────
-- Gravar: o critério é o do trg_time_log_revision, que só deixa passar UPDATE
-- quando alguma coluna muda. As colunas derivadas saem do `raw` no
-- normalizeEntry, então raw igual ⇒ UPDATE cancelado. A impressão cobre o raw.
-- Mudou a normalização da edge? Rode o sync com {"modo":"completo"}, que regrava
-- tudo como antes (o trigger continua cancelando o que não mudou).
--
-- Órfãos: o resultado é o MESMO do EG-3 (rpc_timelog_reconciliar_orfaos):
--   • Balde que não diverge tem, no payload, exatamente as linhas ativas da
--     base (quantidade e soma iguais). Nada a marcar nem desmarcar ali: órfão
--     que voltasse mudaria a soma do balde e o faria divergir.
--   • Balde que diverge recebe os ids do payload e passa pela regra do EG-3:
--     na base e fora do payload → órfão novo (quem já é órfão não é tocado);
--     órfão que voltou → sai da tabela.
--   • O id não muda de balde (o balde é o prefixo do próprio id), então não há
--     lançamento "mudando de balde" para confundir a conta.
--   • Guarda igual à do EG-3: payload vazio, ou presentes < 50% da base, não
--     marca órfão. presentes = linhas ativas dos baldes que não divergem + linhas
--     da base cujo id veio na rodada 2.
--
-- Colisão: duas somas de 60 bits (mais a quantidade) coincidirem com conjuntos
-- diferentes tem probabilidade ~2^-60 por balde; na rodada 2 a comparação é
-- linha a linha com 64 bits.
--
-- Retorno escalar (jsonb) de propósito: o PostgREST deste projeto corta SETOF
-- em max_rows = 1000 sem avisar.
--
-- rpc_timelog_reconciliar_orfaos (EG-3) FICA: é o caminho da edge quando estas
-- funções falham (ex.: edge publicada antes desta migration) e do rollback.
-- =============================================================================


-- ── 1. Impressão de um lançamento ────────────────────────────────────────────
-- Tem de bater byte a byte com impressaoLancamento() do TS. STABLE porque o
-- convert_to é STABLE.

CREATE OR REPLACE FUNCTION public.timelog_impressao(p_ext_entry_id text, p_raw jsonb)
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT encode(sha256(convert_to(p_ext_entry_id || '|' || p_raw::text, 'UTF8')), 'hex');
$fn$;

COMMENT ON FUNCTION public.timelog_impressao(text, jsonb) IS
  'sha256 hex de ext_entry_id || ''|'' || raw::text. Espelha impressaoLancamento() de '
  'supabase/functions/_shared/timelogImpressao.ts — mudar um exige mudar o outro.';

REVOKE EXECUTE ON FUNCTION public.timelog_impressao(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.timelog_impressao(text, jsonb) TO service_role;


-- ── 2. Rodada 1: quais baldes divergem ───────────────────────────────────────
-- Entrada: três arrays alinhados (balde, quantidade, soma em decimal — a soma
-- passa de 2^63 e vai como texto para numeric). Balde que só existe de um lado
-- também diverge: sem payload (tudo excluído na origem, ou coleta vazia) ou sem
-- base (lançamentos novos).

CREATE OR REPLACE FUNCTION public.rpc_timelog_baldes_divergentes(
  p_baldes text[],
  p_qtds   integer[],
  p_somas  text[]
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  WITH payload AS (
    SELECT u.balde, u.qtd, u.soma::numeric AS soma
    FROM unnest(p_baldes, p_qtds, p_somas) AS u(balde, qtd, soma)
    WHERE u.balde IS NOT NULL
  ),
  ativos AS (
    SELECT t.ext_entry_id, t.raw
    FROM public.devops_time_logs t
    WHERE t.ext_entry_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.devops_time_log_orphans o
                       WHERE o.ext_entry_id = t.ext_entry_id)
  ),
  banco AS (
    SELECT left(a.ext_entry_id, 2) AS balde,
           count(*)::integer AS qtd,
           sum(('x' || left(public.timelog_impressao(a.ext_entry_id, a.raw), 15))::bit(60)::bigint::numeric) AS soma
    FROM ativos a
    GROUP BY 1
  ),
  divergentes AS (
    SELECT coalesce(p.balde, b.balde) AS balde
    FROM payload p
    FULL JOIN banco b ON b.balde = p.balde
    WHERE p.balde IS NULL OR b.balde IS NULL
       OR p.qtd IS DISTINCT FROM b.qtd
       OR p.soma IS DISTINCT FROM b.soma
  )
  SELECT jsonb_build_object(
    'divergentes',  coalesce((SELECT jsonb_agg(d.balde ORDER BY d.balde) FROM divergentes d), '[]'::jsonb),
    'base',         (SELECT count(*) FROM public.devops_time_logs WHERE ext_entry_id IS NOT NULL),
    'ativos',       (SELECT count(*) FROM ativos),
    'orfaos_total', (SELECT count(*) FROM public.devops_time_log_orphans)
  );
$fn$;

COMMENT ON FUNCTION public.rpc_timelog_baldes_divergentes(text[], integer[], text[]) IS
  'Rodada 1 do diff do devops-sync-timelog: compara quantidade e soma das impressões por '
  'balde (2 primeiros caracteres do ext_entry_id) com a base ativa (sem órfãos) e devolve '
  '{divergentes, base, ativos, orfaos_total}. Não escreve.';

REVOKE EXECUTE ON FUNCTION public.rpc_timelog_baldes_divergentes(text[], integer[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_timelog_baldes_divergentes(text[], integer[], text[]) TO service_role;


-- ── 3. Rodada 2: o que gravar e os órfãos, só nos baldes divergentes ─────────
-- p_ids/p_impressoes: os lançamentos do payload que caem nos baldes
-- divergentes, com o prefixo hex da impressão (a edge manda 16 caracteres; a
-- comparação usa o tamanho recebido). p_total_payload: ids distintos do payload
-- INTEIRO, para a guarda.

CREATE OR REPLACE FUNCTION public.rpc_timelog_sincronizar_baldes(
  p_baldes            text[],
  p_ids               text[],
  p_impressoes        text[],
  p_total_payload     integer,
  p_cobertura_minima  numeric DEFAULT 0.5
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_enviados   integer;
  v_alterados  text[];
  v_base       integer;
  v_presentes  integer;
  v_guarda     boolean;
  v_novos      integer := 0;
  v_voltaram   integer := 0;
BEGIN
  -- ── 1. O que gravar ───────────────────────────────────────────────────────
  -- Sem linha na base (novo) ou com impressão diferente (raw mudou). Órfão que
  -- voltou sem mudança NÃO entra: basta desmarcá-lo (passo 4).
  WITH payload AS (
    SELECT DISTINCT ON (u.id) u.id, u.h
    FROM unnest(p_ids, p_impressoes) AS u(id, h)
    WHERE u.id IS NOT NULL
    ORDER BY u.id
  )
  SELECT count(*),
         coalesce(array_agg(p.id ORDER BY p.id) FILTER (
           WHERE t.ext_entry_id IS NULL
              OR p.h IS NULL
              OR left(public.timelog_impressao(t.ext_entry_id, t.raw), length(p.h)) IS DISTINCT FROM p.h
         ), '{}')
    INTO v_enviados, v_alterados
    FROM payload p
    LEFT JOIN public.devops_time_logs t ON t.ext_entry_id = p.id;

  -- ── 2. Guarda (a do EG-3) ─────────────────────────────────────────────────
  -- presente = veio na rodada 2, OU está ativo num balde que não divergiu (lá o
  -- payload tem exatamente as linhas ativas).
  WITH payload AS (
    SELECT DISTINCT u.id FROM unnest(p_ids) AS u(id) WHERE u.id IS NOT NULL
  ),
  divergentes AS (
    SELECT DISTINCT b.balde FROM unnest(p_baldes) AS b(balde) WHERE b.balde IS NOT NULL
  )
  SELECT count(*),
         count(*) FILTER (WHERE p.id IS NOT NULL OR (d.balde IS NULL AND o.ext_entry_id IS NULL))
    INTO v_base, v_presentes
    FROM public.devops_time_logs t
    LEFT JOIN payload p ON p.id = t.ext_entry_id
    LEFT JOIN divergentes d ON d.balde = left(t.ext_entry_id, 2)
    LEFT JOIN public.devops_time_log_orphans o ON o.ext_entry_id = t.ext_entry_id
   WHERE t.ext_entry_id IS NOT NULL;

  v_guarda := coalesce(p_total_payload, 0) = 0
           OR v_presentes < v_base * coalesce(p_cobertura_minima, 0.5);

  -- ── 3. Órfãos novos, só nos baldes divergentes e com payload confiável ────
  IF NOT v_guarda THEN
    WITH payload AS (
      SELECT DISTINCT u.id FROM unnest(p_ids) AS u(id) WHERE u.id IS NOT NULL
    )
    INSERT INTO public.devops_time_log_orphans
           (ext_entry_id, work_item_id, log_date, user_name, time_minutes)
    SELECT t.ext_entry_id, t.work_item_id, t.log_date, t.user_name, t.time_minutes
      FROM public.devops_time_logs t
     WHERE t.ext_entry_id IS NOT NULL
       AND left(t.ext_entry_id, 2) = ANY (p_baldes)
       AND NOT EXISTS (SELECT 1 FROM payload p WHERE p.id = t.ext_entry_id)
       AND NOT EXISTS (SELECT 1 FROM public.devops_time_log_orphans o
                        WHERE o.ext_entry_id = t.ext_entry_id)
    ON CONFLICT (ext_entry_id) DO NOTHING;
    GET DIAGNOSTICS v_novos = ROW_COUNT;
  END IF;

  -- ── 4. Quem voltou deixa de ser órfão (sempre) ────────────────────────────
  -- Órfão fora dos baldes divergentes não pode ter voltado: mudaria a soma.
  WITH payload AS (
    SELECT DISTINCT u.id FROM unnest(p_ids) AS u(id) WHERE u.id IS NOT NULL
  )
  DELETE FROM public.devops_time_log_orphans o
   USING payload p
   WHERE o.ext_entry_id = p.id;
  GET DIAGNOSTICS v_voltaram = ROW_COUNT;

  RETURN jsonb_build_object(
    'alterados',    to_jsonb(v_alterados),     -- ids para o upsert da edge
    'baldes',       coalesce(cardinality(p_baldes), 0),
    'enviados',     v_enviados,                -- ids recebidos nesta rodada
    'payload',      coalesce(p_total_payload, 0),
    'base',         v_base,
    'presentes',    v_presentes,
    'ausentes',     v_base - v_presentes,
    'guarda',       v_guarda,
    'orfaos_novos', v_novos,
    'voltaram',     v_voltaram,
    'orfaos_total', (SELECT count(*) FROM public.devops_time_log_orphans)
  );
END;
$fn$;

COMMENT ON FUNCTION public.rpc_timelog_sincronizar_baldes(text[], text[], text[], integer, numeric) IS
  'Rodada 2 do diff do devops-sync-timelog: para os baldes divergentes, devolve em '
  '`alterados` os ids novos ou com impressão diferente e reconcilia devops_time_log_orphans '
  'com a regra do EG-3 (guarda de 50% da base inclusa). Chamada pela edge a cada execução '
  'em que a rodada 1 acusar divergência.';

-- SECURITY INVOKER: a edge chama como service_role, que já tem as permissões nas
-- tabelas e ignora RLS. O REVOKE nomeia anon e authenticated porque o default
-- privilege do Supabase concede EXECUTE a eles em toda função nova de public.
REVOKE EXECUTE ON FUNCTION public.rpc_timelog_sincronizar_baldes(text[], text[], text[], integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_timelog_sincronizar_baldes(text[], text[], text[], integer, numeric) TO service_role;
