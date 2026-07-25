-- =============================================================================
-- TL-5 — Fan-out do devops_collaborator_map dobra minutos VDESK (bug real PROD)
--
-- Contexto (análise 24-25/07/2026): existem 2 linhas ATIVAS com
-- vdesk_user_name='Anderson' (timelog_name 'Anderson' e 'Anderson S. dos
-- Santos'). O LEFT JOIN da v_timelog_unified (vdesk_agg) casa cada apontamento
-- VDESK com as 2 linhas → soma dobrada: 22/07 mostra minutes_vdesk=382 (2×191)
-- vs minutes_devops=191 e o dia é marcado 'divergent' indevidamente.
--
-- Correção em 3 partes (genérica — vale para qualquer duplicata, não só Anderson):
--   1. Unificar canonical_name das duplicatas com o da linha "vencedora"
--      (é a mesma pessoa; o propósito da tabela é consolidar variantes).
--   2. Anular vdesk_user_name nas duplicatas. NÃO desativa a linha: o lado
--      DevOps da view casa por timelog_name e pode precisar das duas grafias
--      para canonicalizar apontamentos antigos.
--      Vencedora por ordem: tem devops_email → tem apontamento em
--      devops_time_logs com esse timelog_name → updated_at mais recente.
--   3. Índice ÚNICO parcial em lower(vdesk_user_name) p/ linhas ativas —
--      mesmo predicado do join da view — torna o fan-out impossível daqui
--      em diante (a view não precisa mudar).
--
-- Também elimina o não-determinismo do rpc_timelog_queue_post (SELECT ... LIMIT 1
-- sem ORDER BY sobre o mesmo filtro): com o índice único, há no máximo 1 linha.
-- =============================================================================

-- ── 1+2. Dedupe data-driven ──────────────────────────────────────────────────
WITH cand AS (
  SELECT
    m.timelog_name,
    m.vdesk_user_name,
    m.canonical_name,
    (m.devops_email IS NOT NULL) AS has_email,
    EXISTS (
      SELECT 1 FROM public.devops_time_logs d
      WHERE lower(d.user_name) = lower(m.timelog_name)
    ) AS has_devops_logs,
    m.updated_at
  FROM public.devops_collaborator_map m
  WHERE m.vdesk_user_name IS NOT NULL
    AND coalesce(m.is_active, true)
),
ranked AS (
  SELECT
    c.*,
    row_number() OVER (
      PARTITION BY lower(c.vdesk_user_name)
      ORDER BY c.has_email DESC, c.has_devops_logs DESC,
               c.updated_at DESC NULLS LAST, c.timelog_name
    ) AS rn,
    first_value(c.canonical_name) OVER (
      PARTITION BY lower(c.vdesk_user_name)
      ORDER BY c.has_email DESC, c.has_devops_logs DESC,
               c.updated_at DESC NULLS LAST, c.timelog_name
    ) AS canonical_vencedor
  FROM cand c
)
UPDATE public.devops_collaborator_map m
SET vdesk_user_name = NULL,
    canonical_name  = r.canonical_vencedor,
    notes           = trim(coalesce(m.notes || ' | ', '') ||
                      format('[dedup TL-5 2026-07-25] vdesk_user_name=%L removido (duplicava o mapeamento VDESK; fan-out na v_timelog_unified)', m.vdesk_user_name)),
    updated_at      = now()
FROM ranked r
WHERE m.timelog_name = r.timelog_name
  AND r.rn > 1;

-- ── 3. Blindagem: no máximo 1 linha ativa por usuário VDESK ─────────────────
-- Predicado espelha EXATAMENTE o join da view (lower + coalesce(is_active,true),
-- à prova de drift caso o NOT NULL de is_active caia um dia): duplicar de novo
-- vira erro de INSERT/UPDATE, nunca mais soma dobrada silenciosa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_devops_collaborator_map_vdesk_active
  ON public.devops_collaborator_map (lower(vdesk_user_name))
  WHERE vdesk_user_name IS NOT NULL AND coalesce(is_active, true);

COMMENT ON INDEX public.uq_devops_collaborator_map_vdesk_active IS
  'TL-5: garante 1 linha ativa por usuário VDESK. O join da v_timelog_unified '
  '(vdesk_agg) e o rpc_timelog_queue_post dependem desta unicidade para não '
  'duplicar minutos nem escolher destinatário aleatório.';
