-- ============================================================
-- DIAGNÓSTICO S10-2026: Retorno QA Gerencial vs Aba Retorno QA
--
-- Gerencial  → COUNT(DISTINCT work_item_id) de devops_qa_return_events
--              onde sprint_code = 'S10-2026'  (conta TODOS os eventos,
--              inclusive detection_method = 'tag')
--
-- Aba Retorno → usa rpc_qa_return_summary → total_events = COUNT(*)
--               (conta eventos, não itens únicos; pode diferir)
--
-- Raiz do divergente suspeito:
--   detection_method = 'tag'  → item entrou no Gerencial porque tem
--   a tag "Retorno QA", mas NÃO tem a transição real
--   "Em Teste" → "Em desenvolvimento" no state_history.
-- ============================================================


-- ── 1. RESUMO GERAL S10-2026 por detection_method ────────────────────────────
-- Mostra quantos eventos/itens existem para cada método de detecção.
-- Se detection_method = 'tag' > 0, esses são os falsos positivos no Gerencial.

SELECT
  COALESCE(detection_method, 'NULL/desconhecido') AS metodo_deteccao,
  COUNT(*)                                         AS total_eventos,
  COUNT(DISTINCT work_item_id)                     AS itens_unicos,
  COUNT(*) FILTER (WHERE is_open = true)           AS eventos_abertos
FROM public.devops_qa_return_events
WHERE sprint_code = 'S10-2026'
GROUP BY detection_method
ORDER BY total_eventos DESC;


-- ── 2. ITENS CONCRETOS detectados APENAS por tag (sem transição real) ─────────
-- detection_method = 'tag'  →  foram registrados no Gerencial
-- mas o state_history NÃO tem "Em Teste" → "Em desenvolvimento".
-- Estes inflam o número do Gerencial sem ter retorno QA real.

SELECT
  qe.id                    AS evento_id,
  qe.work_item_id,
  qe.work_item_title       AS titulo,
  qe.work_item_type        AS tipo,
  qe.assigned_to_display   AS responsavel,
  qe.detected_tags         AS tags_no_momento,
  qe.is_open,
  qe.detected_at,
  qe.detection_method,

  -- Verificação cruzada: tem transição real no state_history atual?
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      COALESCE(wi.state_history, '[]'::jsonb)
    ) AS h
    WHERE lower(h->>'oldValue') IN ('em teste', 'in test', 'testing')
      AND lower(h->>'newValue') IN (
        'em desenvolvimento', 'in progress', 'in development',
        'to do', 'new', 'committed', 'prioritized', 'active', 'approved'
      )
  ) AS tem_transicao_real_agora

FROM public.devops_qa_return_events qe
JOIN public.devops_work_items wi ON wi.id = qe.work_item_id

WHERE qe.sprint_code     = 'S10-2026'
  AND qe.detection_method = 'tag'   -- detectado SOMENTE pela tag

ORDER BY qe.assigned_to_display, qe.work_item_id;


-- ── 3. COMPARAÇÃO: o que Gerencial conta vs o que Aba Retorno mostra ─────────
-- Gerencial  = todos os eventos distintos por work_item em S10-2026
-- Aba Retorno = total_events (COUNT(*)) e distinct_items_open de
--               rpc_qa_return_summary('S10-2026')
-- Esta query replica ambos lado a lado para confirmar a diferença.

SELECT
  COUNT(*)                                         AS gerencial_total_eventos,
  COUNT(DISTINCT work_item_id)                     AS gerencial_itens_unicos,
  COUNT(*) FILTER (WHERE detection_method = 'tag')           AS eventos_so_tag,
  COUNT(*) FILTER (WHERE detection_method = 'history')       AS eventos_so_history,
  COUNT(*) FILTER (WHERE detection_method = 'tag+history')   AS eventos_tag_e_history,
  COUNT(DISTINCT work_item_id) FILTER (WHERE is_open = true) AS aba_retorno_itens_abertos,
  COUNT(*) FILTER (WHERE is_open = true)                     AS aba_retorno_total_eventos_abertos
FROM public.devops_qa_return_events
WHERE sprint_code = 'S10-2026';
