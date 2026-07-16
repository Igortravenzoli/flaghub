-- ============================================================================
-- Migration: 20260715140000_qualidade_versoes_campos_ambientes.sql
-- Expande o "Controle de versão · sistemas" (Visão Executiva de Qualidade)
-- conforme pedido do setor Qualidade (15/07/2026):
--
--   * versao_anterior     — versão anterior (histórico)
--   * versao_atual        — (já existe) versão atual "em evidência"
--   * versao_nova         — próxima versão / versão nova a subir
--   * data_nova_versao    — data prevista/realizada da versão nova
--   * ambientes           — tags de ambiente onde a versão atual está aplicada
--                           (Brk Prod, Brk PA, SX, S1, S4, S6, Froneri, Nespresso)
--
-- Aditivo: apenas ADD COLUMN IF NOT EXISTS. RLS/trigger/seed já existentes
-- (20260623160000_qualidade_visao_executiva.sql) continuam válidos e cobrem
-- as novas colunas (política FOR ALL / trigger de updated_at).
-- ============================================================================

ALTER TABLE public.qualidade_sistema_versions
  ADD COLUMN IF NOT EXISTS versao_anterior  text,
  ADD COLUMN IF NOT EXISTS versao_nova       text,
  ADD COLUMN IF NOT EXISTS data_nova_versao  date,
  ADD COLUMN IF NOT EXISTS ambientes         text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.qualidade_sistema_versions.versao_anterior IS
  'Versão imediatamente anterior à atual (histórico).';
COMMENT ON COLUMN public.qualidade_sistema_versions.versao_atual IS
  'Versão atual em evidência (produção corrente).';
COMMENT ON COLUMN public.qualidade_sistema_versions.versao_nova IS
  'Próxima versão / versão nova a ser liberada.';
COMMENT ON COLUMN public.qualidade_sistema_versions.data_nova_versao IS
  'Data prevista ou realizada da versão nova.';
COMMENT ON COLUMN public.qualidade_sistema_versions.ambientes IS
  'Ambientes onde a versão atual está aplicada (Brk Prod, Brk PA, SX, S1, S4, S6, Froneri, Nespresso).';
