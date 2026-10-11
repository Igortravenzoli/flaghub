-- =============================================================================
-- EG-7 (PR-10) — sharepoint-sync-sgsi grava só o que mudou (diff por item)
--
-- ── O problema medido (04 a 10/10/2026, edge_logs, dia BRT) ──────────────────
-- O cron sync-sharepoint-sgsi roda a cada 6 h. Em cada execução, para cada uma
-- das 7 listas, a edge APAGAVA a lista inteira em sgsi_items e reinseria todos
-- os itens, cada um com o `fields` completo (~1,9 KB/linha na 010).
--
--   upload    POST /rest/v1/sgsi_items: 24,9 / 28,8 / 27,6 / 27,9 / 29,1 /
--             30,1 / 30,6 MB por dia (83 a 100 requests; 21 a 28 DELETEs =
--             ~4 execuções × 7 listas). Cresce com a 010.
--   base      4.090 itens em 11/10/2026, 7,3 MB de `fields` (010: 3.081 itens).
--   mudança   ~33 itens com modified_sp nos últimos 7 dias (3 nas últimas 24 h).
--             Quase tudo que subia era a mesma linha de novo.
--
-- ── A correção: uma rodada pequena por lista ─────────────────────────────────
-- Impressão de um item = sha256 de
--   item_id | created_sp em ms | modified_sp em ms | fields::text
-- O TS calcula a mesma coisa em supabase/functions/sharepoint-sync-sgsi/
-- gravacao.ts, sobre a linha JÁ FILTRADA (sensivel.ts) que seria gravada, com o
-- jsonbTexto de _shared/timelogImpressao.ts (reproduz o jsonb::text, validado
-- no EG-4). Em 11/10/2026: 4.090 de 4.090 impressões iguais entre o TS e o
-- Postgres, sobre as linhas reais do PROD.
--
-- A edge manda, por lista, item_id + 64 bits da impressão (~24 bytes/item,
-- ~100 KB por execução). O banco APAGA os itens que sumiram da origem e devolve
-- os ids novos ou com impressão diferente; só esses sobem, por upsert.
-- Estimativa: ~0,4 MB/dia de ids + as linhas que mudaram (~2 KB cada) no lugar
-- de ~27 MB/dia.
--
-- Por que diff por item e não resumo por balde (EG-4): 4 mil itens × 4
-- execuções cabem em ~0,4 MB/dia numa chamada só por lista. O balde cortaria
-- isso para dezenas de KB à custa de uma segunda rodada; não compensa aqui.
--
-- ── Semântica preservada ────────────────────────────────────────────────────
-- Resultado final de sgsi_items depois do sync = o de antes (apagar e
-- reinserir), coluna a coluna, EXCETO `synced_at` dos itens que não mudaram,
-- que guarda a última gravação da linha. Nada lê sgsi_items.synced_at (o front
-- e o HubUptime usam sgsi_lists.synced_at, que continua avançando a cada
-- execução; a view v_colaborador_ausencias usa list_key, fields e modified_sp).
--   • Novo item na origem → não está na base → gravado.
--   • Item alterado (campo, nome de pessoa, link, datas) → impressão difere →
--     gravado inteiro (o upsert troca o `fields` todo, sem merge).
--   • Item que sumiu da origem → apagado aqui. Lista vazia na origem apaga a
--     lista inteira, como antes.
--   • Mudou a normalização da edge (inclusive o filtro de credenciais)? A
--     impressão é da linha final, então os itens afetados divergem e são
--     regravados na primeira execução — não precisa de modo "completo".
--   • Colisão: 64 bits por item; um item alterado passar como igual tem
--     probabilidade ~2^-64.
--
-- Retorno escalar (jsonb) de propósito: o PostgREST deste projeto corta SETOF
-- em max_rows = 1000 sem avisar.
--
-- Sem esta migration (edge publicada antes) a RPC dá PGRST202 e a edge volta ao
-- caminho antigo (apagar e reinserir), com aviso no retorno e no log.
-- =============================================================================


-- ── 1. Impressão de um item ──────────────────────────────────────────────────
-- Tem de bater byte a byte com impressaoItemSgsi() do TS. Datas em ms desde a
-- época (floor), não em texto: o texto do timestamptz depende do TimeZone da
-- sessão e o Graph manda ISO "…Z". STABLE porque o convert_to é STABLE.

CREATE OR REPLACE FUNCTION public.sgsi_impressao(
  p_item_id     integer,
  p_created_sp  timestamptz,
  p_modified_sp timestamptz,
  p_fields      jsonb
)
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT encode(sha256(convert_to(
           p_item_id::text
           || '|' || coalesce(floor(extract(epoch FROM p_created_sp) * 1000)::bigint::text, '')
           || '|' || coalesce(floor(extract(epoch FROM p_modified_sp) * 1000)::bigint::text, '')
           || '|' || coalesce(p_fields::text, 'null'),
         'UTF8')), 'hex');
$fn$;

COMMENT ON FUNCTION public.sgsi_impressao(integer, timestamptz, timestamptz, jsonb) IS
  'sha256 hex de item_id|created_sp ms|modified_sp ms|fields::text. Espelha impressaoItemSgsi() de '
  'supabase/functions/sharepoint-sync-sgsi/gravacao.ts — mudar um exige mudar o outro.';

REVOKE EXECUTE ON FUNCTION public.sgsi_impressao(integer, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgsi_impressao(integer, timestamptz, timestamptz, jsonb) TO service_role;


-- ── 2. Uma lista: apaga o que sumiu e devolve o que gravar ───────────────────
-- p_item_ids/p_impressoes: TODOS os itens da lista na origem, com o prefixo hex
-- da impressão (a edge manda 16 caracteres; a comparação usa o tamanho
-- recebido). Arrays vazios = lista vazia na origem (apaga tudo, como antes).

CREATE OR REPLACE FUNCTION public.rpc_sgsi_sincronizar_lista(
  p_list_key   text,
  p_item_ids   integer[],
  p_impressoes text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_enviados   integer;
  v_alterados  integer[];
  v_base       integer;
  v_removidos  integer := 0;
BEGIN
  IF p_list_key IS NULL THEN
    RAISE EXCEPTION 'rpc_sgsi_sincronizar_lista: p_list_key obrigatório';
  END IF;

  SELECT count(*) INTO v_base FROM public.sgsi_items WHERE list_key = p_list_key;

  -- ── 1. O que gravar: sem linha na base (novo) ou impressão diferente ──────
  WITH payload AS (
    SELECT DISTINCT ON (u.id) u.id, u.h
    FROM unnest(p_item_ids, p_impressoes) AS u(id, h)
    WHERE u.id IS NOT NULL
    ORDER BY u.id
  )
  SELECT count(*),
         coalesce(array_agg(p.id ORDER BY p.id) FILTER (
           WHERE i.item_id IS NULL
              OR p.h IS NULL
              OR left(public.sgsi_impressao(i.item_id, i.created_sp, i.modified_sp, i.fields), length(p.h))
                 IS DISTINCT FROM p.h
         ), '{}')
    INTO v_enviados, v_alterados
    FROM payload p
    LEFT JOIN public.sgsi_items i ON i.list_key = p_list_key AND i.item_id = p.id;

  -- ── 2. O que sumiu da origem sai da base ──────────────────────────────────
  DELETE FROM public.sgsi_items i
   WHERE i.list_key = p_list_key
     AND NOT EXISTS (SELECT 1 FROM unnest(p_item_ids) AS u(id) WHERE u.id = i.item_id);
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  RETURN jsonb_build_object(
    'alterados', to_jsonb(v_alterados),   -- item_ids para o upsert da edge
    'enviados',  v_enviados,              -- itens distintos recebidos
    'base',      v_base,                  -- itens da lista antes desta chamada
    'removidos', v_removidos
  );
END;
$fn$;

COMMENT ON FUNCTION public.rpc_sgsi_sincronizar_lista(text, integer[], text[]) IS
  'Diff do sharepoint-sync-sgsi (EG-7): recebe todos os item_id da lista na origem com o '
  'prefixo da impressão (sgsi_impressao), apaga de sgsi_items os que sumiram e devolve em '
  '`alterados` os ids novos ou com impressão diferente. Chamada pela edge uma vez por lista.';

-- SECURITY INVOKER: a edge chama como service_role, que já tem as permissões na
-- tabela e ignora RLS. O REVOKE nomeia anon e authenticated porque o default
-- privilege do Supabase concede EXECUTE a eles em toda função nova de public.
REVOKE EXECUTE ON FUNCTION public.rpc_sgsi_sincronizar_lista(text, integer[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_sgsi_sincronizar_lista(text, integer[], text[]) TO service_role;
