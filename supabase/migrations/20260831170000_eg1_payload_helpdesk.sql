-- =============================================================================
-- EG-1 — Corta o payload das telas de ticket
--
-- A Supabase avisou em 31/08/2026 que a organização estourou a cota de egress
-- do plano (5 GB), com Fair Use Policy a partir de 01/10/2026. O PR anterior
-- alinhou a FREQUÊNCIA das recargas à cadência dos crons; esta migration ataca
-- o TAMANHO, que é o que fecha a conta.
--
-- Medido em 31/08/2026, por aba aberta:
--
--   useDashboardSummary   62 kB por recarga, dos quais 97,7% é `vdesk_payload`
--   useTickets           199 kB por recarga (traz `raw_payload` E `vdesk_payload`)
--
-- Duas mudanças, nenhuma delas alterando o que a tela mostra.
-- =============================================================================


-- ── 1. Resumo calculado no banco ─────────────────────────────────────────────
--
-- `useDashboardSummary` baixava até 1.000 linhas de `tickets` — incluindo o
-- blob `vdesk_payload` — para contar cinco números no navegador. Agora o banco
-- devolve os cinco números: ~62 kB viram ~100 bytes.
--
-- BÔNUS: some um bug latente. O `.limit(1000)` do cliente era silencioso — com
-- mais de mil tickets ativos numa rede, o resumo passaria a contar só os mil
-- primeiros, sem erro nem aviso. Contando no banco não há teto.
--
-- A regra de "tem OS vinculada" replica `hasLinkedOS` do frontend
-- (src/hooks/useSupabaseData.ts e src/hooks/useTicketAnalysisDB.ts) — inclusive
-- a semântica de verdade do JavaScript para `Boolean(item.os)`, que NÃO é a do
-- SQL: string vazia é falso mas "0" é VERDADEIRO; o número 0 é falso; objeto e
-- array vazios são verdadeiros. Aproximar isso com `(e->>'os') <> ''` mudaria a
-- contagem de tickets sem OS, que é KPI de tela.

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_network_id bigint DEFAULT NULL::bigint
)
RETURNS TABLE(
  network_id bigint,
  total_tickets bigint,
  tickets_ok bigint,
  tickets_criticos bigint,
  tickets_atencao bigint,
  tickets_sem_os bigint,
  last_updated timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_network_id bigint;
  v_can_access boolean := false;
BEGIN
  -- Mesma resolução e mesmo gate de acesso do `get_tickets`: quem não pode ver
  -- a lista não pode ver a contagem dela.
  v_network_id := COALESCE(
    p_network_id,
    public.auth_network_id(),
    public.hub_resolve_area_network_id('tickets_os')
  );

  IF v_network_id IS NULL THEN
    RETURN;
  END IF;

  v_can_access := public.is_admin()
    OR v_network_id = public.auth_network_id()
    OR public.hub_has_area_network_role('tickets_os', v_network_id, ARRAY['leitura','operacional','owner']);

  IF NOT v_can_access THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.severity,
      t.updated_at,
      (
        COALESCE(t.os_found_in_vdesk, false)
        OR COALESCE(btrim(t.os_number), '') <> ''
        OR COALESCE(t.has_os, false)
        OR (
          jsonb_typeof(t.vdesk_payload) = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(t.vdesk_payload) AS e
            WHERE CASE jsonb_typeof(e -> 'os')
                    WHEN 'string'  THEN (e ->> 'os') <> ''
                    WHEN 'number'  THEN (e ->> 'os')::numeric <> 0
                    WHEN 'boolean' THEN (e ->> 'os')::boolean
                    WHEN 'object'  THEN true
                    WHEN 'array'   THEN true
                    ELSE false
                  END
          )
        )
      ) AS tem_os
    FROM public.tickets t
    WHERE t.network_id = v_network_id
      AND t.is_active = true
  )
  SELECT
    v_network_id,
    count(*),
    count(*) FILTER (WHERE base.severity = 'info' OR base.tem_os),
    count(*) FILTER (WHERE base.severity = 'critico' AND NOT base.tem_os),
    count(*) FILTER (WHERE base.severity = 'atencao'),
    count(*) FILTER (WHERE NOT base.tem_os),
    max(base.updated_at)
  FROM base
  HAVING count(*) > 0;   -- o cliente devolvia null quando não havia linha
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_summary(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(bigint) TO authenticated;


-- ── 2. `get_tickets` para de trafegar o registro inteiro do ServiceNow ───────
--
-- `raw_payload` é o registro cru do ServiceNow. A UI lê NOVE chaves dele, e
-- só. O resto viajava a cada recarga, em toda linha, sem ninguém abrir.
--
-- As nove, com quem as lê (src/hooks/useTicketAnalysisDB.ts):
--
--     short_description   linhas 68 e 169      os_cliente      linha 119
--     caller_id           linha 69             os_sistema      linha 126
--     due_date            linha 70             os_componente   linha 127
--     priority            linha 71
--     category            linha 73
--     assignment_group    linha 74
--
-- ATENÇÃO PARA QUEM MEXER NA TELA DEPOIS: ler uma chave nova de `raw_payload`
-- no frontend exige acrescentá-la aqui. Se faltar, o campo chega `undefined` e
-- vira string vazia pelo `|| ''` do hook — some sem erro, sem log, sem quebrar
-- nada. É o preço de projetar no banco, e é deliberado: o alternativo era
-- continuar mandando o registro completo.
--
-- `vdesk_payload` NÃO é projetado de propósito: o hook consome praticamente
-- todos os seus campos (cliente, bandeira, programador, os, ticketNestle,
-- sequencia, dataRegistro, sistema, componente, descricao, descricaoOS,
-- previsao, dataHistorico, previsaoMinutos, tipoChamado, criticidade, retorno),
-- então projetar não compraria bytes e só criaria acoplamento.
--
-- `jsonb_strip_nulls` remove a chave ausente em vez de mandar `"campo": null` —
-- o hook trata os dois casos igual (`|| ''`), e sem a chave são menos bytes.
--
-- Assinatura e colunas de retorno idênticas às de 20260330151104: só muda o
-- CONTEÚDO de `raw_payload`, então `CREATE OR REPLACE` basta e nenhum chamador
-- precisa mudar de forma.

CREATE OR REPLACE FUNCTION public.get_tickets(
  p_network_id bigint DEFAULT NULL::bigint,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_internal_status internal_status DEFAULT NULL::internal_status,
  p_severity ticket_severity DEFAULT NULL::ticket_severity,
  p_has_os boolean DEFAULT NULL::boolean,
  p_search_text text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id bigint,
  network_id bigint,
  ticket_external_id text,
  ticket_type text,
  opened_at timestamp with time zone,
  external_status text,
  internal_status internal_status,
  assigned_to text,
  os_number text,
  has_os boolean,
  os_found_in_vdesk boolean,
  inconsistency_code text,
  severity ticket_severity,
  raw_payload jsonb,
  vdesk_payload jsonb,
  last_os_event_at timestamp with time zone,
  last_os_event_desc text,
  last_import_id bigint,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_network_id bigint;
  v_can_access boolean := false;
BEGIN
  v_network_id := COALESCE(
    p_network_id,
    public.auth_network_id(),
    public.hub_resolve_area_network_id('tickets_os')
  );

  IF v_network_id IS NULL THEN
    RETURN;
  END IF;

  v_can_access := public.is_admin()
    OR v_network_id = public.auth_network_id()
    OR public.hub_has_area_network_role('tickets_os', v_network_id, ARRAY['leitura','operacional','owner']);

  IF NOT v_can_access THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.network_id,
    t.ticket_external_id,
    t.ticket_type,
    t.opened_at,
    t.external_status,
    t.internal_status,
    t.assigned_to,
    t.os_number,
    t.has_os,
    t.os_found_in_vdesk,
    t.inconsistency_code,
    t.severity,
    jsonb_strip_nulls(jsonb_build_object(
      'short_description', t.raw_payload -> 'short_description',
      'caller_id',         t.raw_payload -> 'caller_id',
      'due_date',          t.raw_payload -> 'due_date',
      'priority',          t.raw_payload -> 'priority',
      'category',          t.raw_payload -> 'category',
      'assignment_group',  t.raw_payload -> 'assignment_group',
      'os_cliente',        t.raw_payload -> 'os_cliente',
      'os_sistema',        t.raw_payload -> 'os_sistema',
      'os_componente',     t.raw_payload -> 'os_componente'
    )) AS raw_payload,
    t.vdesk_payload,
    t.last_os_event_at,
    t.last_os_event_desc,
    t.last_import_id,
    t.created_at,
    t.updated_at
  FROM public.tickets t
  WHERE t.network_id = v_network_id
    AND t.is_active = true
    AND (p_date_from IS NULL OR t.opened_at >= p_date_from)
    AND (p_date_to IS NULL OR t.opened_at <= p_date_to)
    AND (p_internal_status IS NULL OR t.internal_status = p_internal_status)
    AND (p_severity IS NULL OR t.severity = p_severity)
    AND (p_has_os IS NULL OR t.has_os = p_has_os)
    AND (
      p_search_text IS NULL
      OR t.ticket_external_id ILIKE '%' || p_search_text || '%'
      OR t.assigned_to ILIKE '%' || p_search_text || '%'
    )
  ORDER BY
    CASE t.severity
      WHEN 'critico' THEN 1
      WHEN 'atencao' THEN 2
      ELSE 3
    END,
    t.opened_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;
