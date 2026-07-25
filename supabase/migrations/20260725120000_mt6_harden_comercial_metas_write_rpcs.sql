-- =============================================================================
-- MT-6 — Endurecer escrita de metas comerciais (brecha de segurança em PROD)
--
-- Contexto (análise 24-25/07/2026): insert_meta_comercial e update_meta_comercial
-- (SECURITY DEFINER) não checam permissão nenhuma e têm GRANT para `anon` —
-- qualquer pessoa com a anon key pública consegue criar/alterar metas
-- comerciais. Só o delete_meta_comercial foi endurecido (20260702150000).
--
-- ATENÇÃO às assinaturas: as versões VIGENTES são as de
-- 20260609120000_add_meta_valor_total.sql — insert com 11 parâmetros
-- (RETURNS uuid) e update com 12 (RETURNS void); as versões originais de
-- 20260521170000 (8/9 params, RETURNS TABLE) foram DROPadas lá. O GRANT anon
-- vigente também é o de 20260609120000:103-104. Endurecer overloads antigos
-- criaria funções mortas (e ambiguidade PGRST203) sem fechar a brecha.
--
-- Correção (mesmo padrão do delete já endurecido em 20260702150000):
--   1. Checagem interna: hub_is_admin() OU owner/operacional da área comercial
--      (RAISE EXCEPTION caso contrário) — defesa principal, vale mesmo que os
--      grants regridam. Corpos idênticos aos vigentes fora o gate.
--   2. REVOKE EXECUTE FROM anon e PUBLIC — fecha o acesso via anon key.
--   3. GRANT authenticated mantido (a checagem interna decide).
--
-- Nota: a leitura (SELECT em comercial_metas, policy para anon) NÃO muda —
-- o modo TV/kiosk depende dela.
-- =============================================================================

-- Higiene defensiva: garante que os overloads antigos (8/9/10/11 params das
-- migrations 20260521170000/20260524120000) não existem em nenhum ambiente —
-- são os mesmos DROPs de 20260609120000, idempotentes.
DROP FUNCTION IF EXISTS public.insert_meta_comercial(text, text, text, text, numeric, text, date, date);
DROP FUNCTION IF EXISTS public.insert_meta_comercial(text, text, text, text, numeric, text, date, date, integer, numeric);
DROP FUNCTION IF EXISTS public.update_meta_comercial(uuid, text, text, text, text, numeric, text, date, date);
DROP FUNCTION IF EXISTS public.update_meta_comercial(uuid, text, text, text, text, numeric, text, date, date, integer, numeric);

-- ── insert_meta_comercial (assinatura vigente: 11 params, RETURNS uuid) ──────
-- Corpo idêntico ao de 20260609120000 + gate de permissão.
CREATE OR REPLACE FUNCTION public.insert_meta_comercial(
  p_produto text,
  p_tipo text,
  p_status text,
  p_mes_referencia text,
  p_valor_meta numeric DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_data_inicio_meta date DEFAULT NULL,
  p_data_fim_meta date DEFAULT NULL,
  p_realizado_quantidade integer DEFAULT NULL,
  p_valor_unitario numeric DEFAULT NULL,
  p_meta_valor_total numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (
    public.hub_is_admin() OR EXISTS (
      SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
        AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: admin ou gestor comercial';
  END IF;

  INSERT INTO comercial_metas (
    produto, tipo, status, mes_referencia, valor_meta, observacao,
    data_inicio_meta, data_fim_meta, realizado_quantidade, valor_unitario,
    meta_valor_total
  )
  VALUES (
    p_produto, p_tipo, p_status, p_mes_referencia, p_valor_meta, p_observacao,
    p_data_inicio_meta, p_data_fim_meta, p_realizado_quantidade, p_valor_unitario,
    p_meta_valor_total
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── update_meta_comercial (assinatura vigente: 12 params, RETURNS void) ──────
-- Corpo idêntico ao de 20260609120000 + gate de permissão.
CREATE OR REPLACE FUNCTION public.update_meta_comercial(
  p_id uuid,
  p_produto text,
  p_tipo text,
  p_status text,
  p_mes_referencia text,
  p_valor_meta numeric DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_data_inicio_meta date DEFAULT NULL,
  p_data_fim_meta date DEFAULT NULL,
  p_realizado_quantidade integer DEFAULT NULL,
  p_valor_unitario numeric DEFAULT NULL,
  p_meta_valor_total numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.hub_is_admin() OR EXISTS (
      SELECT 1 FROM hub_area_members m JOIN hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid()) AND m.is_active = true
        AND a.key = 'comercial' AND m.area_role IN ('owner','operacional')
    )
  ) THEN
    RAISE EXCEPTION 'permission denied: admin ou gestor comercial';
  END IF;

  UPDATE comercial_metas SET
    produto = p_produto,
    tipo = p_tipo,
    status = p_status,
    mes_referencia = p_mes_referencia,
    valor_meta = p_valor_meta,
    observacao = p_observacao,
    data_inicio_meta = p_data_inicio_meta,
    data_fim_meta = p_data_fim_meta,
    realizado_quantidade = p_realizado_quantidade,
    valor_unitario = p_valor_unitario,
    meta_valor_total = p_meta_valor_total,
    updated_at = now()
  WHERE id = p_id;
END;
$$;

-- ── Grants: fecha anon/PUBLIC, mantém authenticated (o gate interno decide) ──
REVOKE EXECUTE ON FUNCTION public.insert_meta_comercial(text, text, text, text, numeric, text, date, date, integer, numeric, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_meta_comercial(uuid, text, text, text, text, numeric, text, date, date, integer, numeric, numeric) FROM anon, PUBLIC;
-- delete_meta_comercial já tem checagem interna desde 20260702150000, mas o
-- GRANT anon de 20260521170000 nunca foi revogado — revoga aqui também.
REVOKE EXECUTE ON FUNCTION public.delete_meta_comercial(uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_meta_comercial(text, text, text, text, numeric, text, date, date, integer, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_meta_comercial(uuid, text, text, text, text, numeric, text, date, date, integer, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_meta_comercial(uuid) TO authenticated;
