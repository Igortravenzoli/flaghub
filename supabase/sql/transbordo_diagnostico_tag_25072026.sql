-- ============================================================================
-- DIAGNÓSTICO TRANSBORDO — dimensionar o botão "Migrar PBI/Bugs" antes de codar
-- Data: 25/07/2026 · SOMENTE LEITURA (nenhum INSERT/UPDATE/DELETE)
--
-- Responde 3 perguntas do Igor:
--   Q1. Quantos PBI/Bug em status New ou Em Desenvolvimento JÁ TÊM a tag
--       TRANSBORDO? (= o lote que o botão migraria hoje)
--   Q2. Quantos estão nesses status SEM a tag? (= passíveis de transbordo que
--       alguém teria que marcar antes)
--   Q3. A tag é aplicada ANTES ou DEPOIS de o item já ter sido empurrado?
--       (proxy: itens tagueados que ainda NÃO têm migração de sprint no
--        histórico = pré-marcação; tagueados com migração = marcação
--        retrospectiva)
--
-- Definição de transbordo usada aqui = A TAG (decisão do Igor, 25/07):
--   segmento 'TRANSBORDO'/'TRANSBORDADO'/'TRANSBORDADA'  OU a forma composta
--   legada 'AVIAO ANTIGO'/'AVIAO TRANSBORDADO' — mesmas regexes de
--   fn_classifica_demanda (20260610100000) e do front (GerenciaTab).
--
-- Ajuste a sprint na linha do :sprint abaixo, se quiser outra.
-- ============================================================================

\set sprint 'S15-2026'

WITH escopo AS (
  SELECT
    w.id,
    w.work_item_type,
    w.state,
    COALESCE(w.tags, '')            AS tags,
    w.title,
    w.iteration_path,
    COALESCE(jsonb_array_length(w.iteration_history), 0) AS n_iteration_events,
    COALESCE(ls.sprint_migration_count, 0)               AS migracoes,
    COALESCE(ls.overflow_count, 0)                       AS overflow
  FROM public.pbi_lifecycle_summary ls
  JOIN public.devops_work_items w ON w.id = ls.work_item_id
  WHERE (ls.last_committed_sprint = :'sprint' OR ls.first_committed_sprint = :'sprint')
),
marcado AS (
  SELECT
    e.*,
    (e.tags ~* '(^|;)\s*transbord(o|ad[oa])\s*(;|$)'
     OR e.tags ~* '(^|;)\s*avi[aã]o\s+(antigo|transbordad[oa])\s*(;|$)') AS tem_tag_transbordo,
    lower(trim(e.state)) IN ('new', 'em desenvolvimento')                AS elegivel_status
  FROM escopo e
)

-- ── Q1 + Q2: o lote de hoje vs o que ficaria de fora ───────────────────────
SELECT
  '1. RESUMO' AS bloco,
  work_item_type                                        AS tipo,
  count(*) FILTER (WHERE elegivel_status AND tem_tag_transbordo)        AS "com tag (migraria)",
  count(*) FILTER (WHERE elegivel_status AND NOT tem_tag_transbordo)    AS "sem tag (ficaria)",
  count(*) FILTER (WHERE elegivel_status)                               AS "total elegivel por status",
  count(*) FILTER (WHERE tem_tag_transbordo AND NOT elegivel_status)    AS "com tag fora do status",
  count(*)                                                             AS "escopo total da sprint"
FROM marcado
GROUP BY ROLLUP (work_item_type)
ORDER BY work_item_type NULLS LAST;

-- ── Q3: a tag é pré-marcação ou rótulo retrospectivo? ──────────────────────
-- migracoes = 0  → item ainda está na sprint original: tag foi aplicada ANTES
--                  de empurrar (pré-marcação → filtrar por tag funciona)
-- migracoes > 0  → item já foi empurrado: tag é rótulo posterior
--                  (filtrar por tag devolveria lote quase vazio)
SELECT
  '2. MOMENTO DA TAG' AS bloco,
  CASE WHEN migracoes = 0 THEN 'tagueado SEM migracao (pre-marcacao)'
       ELSE 'tagueado JA com migracao (retrospectivo)' END AS interpretacao,
  count(*) AS itens,
  round(avg(migracoes), 2) AS media_migracoes
FROM marcado
WHERE tem_tag_transbordo
GROUP BY 2
ORDER BY 2;

-- ── Amostra: o que exatamente o botão migraria hoje ────────────────────────
SELECT
  '3. LOTE DO BOTAO' AS bloco,
  id, work_item_type AS tipo, state AS status, migracoes,
  left(title, 70) AS titulo, tags
FROM marcado
WHERE elegivel_status AND tem_tag_transbordo
ORDER BY work_item_type, id;

-- ── Amostra: elegíveis por status que NÃO têm a tag (candidatos a marcar) ──
SELECT
  '4. SEM TAG (candidatos)' AS bloco,
  id, work_item_type AS tipo, state AS status, migracoes,
  left(title, 70) AS titulo, tags
FROM marcado
WHERE elegivel_status AND NOT tem_tag_transbordo
ORDER BY work_item_type, id
LIMIT 50;

-- ── Distribuição de status no escopo (confere se os nomes batem) ───────────
-- Se aparecerem grafias inesperadas ('Em Desenvolvimento ', 'Em desenvolvimento'),
-- o filtro elegivel_status precisa ser ajustado antes de codar o botão.
SELECT '5. STATUS NO ESCOPO' AS bloco, state, count(*) AS itens
FROM escopo GROUP BY state ORDER BY count(*) DESC;
