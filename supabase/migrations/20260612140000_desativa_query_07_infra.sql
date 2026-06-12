-- Desativa a query 07-Infraestrutura no rotativo do cron (sync-devops-all).
-- O WIQL salvo (e6af59bf) é inválido/sem acesso no DevOps e falhava silencioso
-- a cada ciclo. O consumo dos itens de infra passou a ser pela query
-- 02-Devops Base Geral: a vw_infraestrutura_kpis identifica os itens pelo
-- marcador de título '[INFRA]%' + filhos do Epic/PBI 2700
-- (migration 20260612130000).

UPDATE public.devops_queries
SET is_active = false,
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
      'obs', 'Desativada em 2026-06-12: WIQL inválido no DevOps (falha silenciosa no cron). Consumo de infra passou a ser via query 02-Base Geral + marcador [INFRA]/Epic 2700 na vw_infraestrutura_kpis.'
    )
WHERE wiql_id = 'e6af59bf-64c5-4bf5-b926-d5039e9222f2';
