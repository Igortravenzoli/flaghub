-- ════════════════════════════════════════════════════════════════════════════
-- F4 (23/11/2026) — limpeza do formato anterior: K8 e FLEXX deixam de ser fábrica
--
-- As fotos de S14 a S23 já têm a fábrica do organograma (`fabricas_org`) e os
-- cards não leem mais a chave por Épico. K8 e FLEXX eram squads do organograma
-- anterior sem ninguém ativo (só 2 linhas inativas de K8 no cadastro).
--
--   1. cadastro: apaga as linhas INATIVAS de K8/FLEXX (recusa se houver ativa);
--   2. CHECK do cadastro sem K8/FLEXX;
--   3. `fn_fabrica_organograma()` sem K8/FLEXX (espelho de fabricaOrganograma.ts);
--      o Épico [K8]/[FLEXX] continua existindo no DevOps: o front marca a hora
--      lançada lá como "formato anterior", e no SQL ele não dá item a ninguém
--      (como já era — squad do formato anterior nunca recebeu item);
--   4. `rpc_fabrica_org_dos_itens`: a régua do item ao vivo para a aba Gerencial,
--      só para quem já pode ler os apontamentos.
-- A chave `fabricas` das fotos (histórico por Épico) não é tocada.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fabrica_squad_membership WHERE squad IN ('K8', 'FLEXX') AND ativo) THEN
    RAISE EXCEPTION 'há gente ATIVA em K8/FLEXX no cadastro: mover para a fábrica nova antes desta migration';
  END IF;
END $$;

DELETE FROM public.fabrica_squad_membership WHERE squad IN ('K8', 'FLEXX') AND NOT ativo;

ALTER TABLE public.fabrica_squad_membership DROP CONSTRAINT IF EXISTS fabrica_squad_membership_squad_check;
ALTER TABLE public.fabrica_squad_membership ADD CONSTRAINT fabrica_squad_membership_squad_check
  check (squad in ('GPS_GO', 'APP', 'PROMO_SUITE', 'ERP_SUST', 'ERP_EVOL', 'IR', 'LAB', 'STAGING', 'INFRA', 'QUALIDADE', 'DESIGN', 'PRODUTOS'));

-- Espelho de src/lib/fabricaOrganograma.ts (FABRICAS). O teste do front lê ESTA
-- função na migration mais recente que a define e exige igualdade com o TS.
-- A coluna `anterior` fica (assinatura estável) e hoje é falsa em todas.
CREATE OR REPLACE FUNCTION public.fn_fabrica_organograma()
RETURNS TABLE(codigo text, entrega boolean, anterior boolean, ordem integer, area_devops text, epicos_devops text[])
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT * FROM (VALUES
    ('GPS_GO',      true,  false,  0, NULL::text, ARRAY[]::text[]),
    ('APP',         true,  false,  1, NULL,       ARRAY['APP']),
    ('PROMO_SUITE', true,  false,  2, NULL,       ARRAY[]::text[]),
    ('ERP_SUST',    true,  false,  3, 'ERP',      ARRAY[]::text[]),
    ('ERP_EVOL',    true,  false,  4, 'ERP',      ARRAY[]::text[]),
    ('IR',          true,  false,  5, 'IR',       ARRAY[]::text[]),
    ('LAB',         true,  false,  6, 'LAB',      ARRAY['IA']),
    ('STAGING',     true,  false,  7, NULL,       ARRAY['STAGING']),
    ('INFRA',       false, false,  8, NULL,       ARRAY['INFRA']),
    ('QUALIDADE',   false, false,  9, NULL,       ARRAY[]::text[]),
    ('DESIGN',      false, false, 10, NULL,       ARRAY['DESIGN']),
    ('PRODUTOS',    false, false, 11, 'Produto',  ARRAY[]::text[])
  ) AS o(codigo, entrega, anterior, ordem, area_devops, epicos_devops);
$function$;

-- A régua do item AO VIVO para a aba Gerencial: a mesma da foto selada, com as
-- horas até `p_ate`. Devolve só id do item e código da fábrica (nenhum nome).
-- Liberada para quem já pode ler os apontamentos (mesma condição da política
-- `devops_time_logs_select_restricted`); a função de dentro segue fechada.
CREATE OR REPLACE FUNCTION public.rpc_fabrica_org_dos_itens(p_ids integer[], p_ate date DEFAULT CURRENT_DATE)
RETURNS TABLE(work_item_id integer, fabrica text)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.hub_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.hub_area_members m JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = auth.uid() AND m.is_active
        AND a.key = ANY (ARRAY['fabrica', 'qualidade', 'programacao', 'devops', 'infraestrutura', 'produtos'])
    )
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_ids, 1), 0) > 5000 THEN
    RAISE EXCEPTION 'no máximo 5000 itens por chamada';
  END IF;
  RETURN QUERY SELECT f.work_item_id, f.fabrica FROM public.fn_fabrica_org_dos_itens(p_ids, p_ate) f;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_fabrica_org_dos_itens(integer[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fabrica_org_dos_itens(integer[], date) TO authenticated;
