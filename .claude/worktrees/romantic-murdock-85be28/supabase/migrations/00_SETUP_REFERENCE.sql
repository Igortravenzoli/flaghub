-- =====================================================
-- Script de Setup Completo - FlagHubDB-Dev
-- =====================================================
-- 
-- INSTRUÇÕES:
-- Este arquivo serve como referência. NÃO execute ele diretamente.
-- Use uma das opções abaixo:
--
-- OPÇÃO 1 (Recomendada): Supabase CLI
--    supabase db push
--
-- OPÇÃO 2: Migrations individuais no SQL Editor
--    Execute cada arquivo .sql na ordem cronológica
--
-- OPÇÃO 3: Migration por Migration
--    Execute os comandos abaixo na ordem
--
-- =====================================================

-- MIGRATIONS (em ordem cronológica):
-- 
-- 1.  20260127193248_ef6fa2c3-8892-41b4-afb4-375df70e91eb.sql
--     → Backend completo (tabelas, enums, RLS)
--
-- 2.  20260127193308_45916c00-6326-4712-9563-803aef836bde.sql
--     → Fix RLS view dashboard
--
-- 3.  20260127200000_correlation_functions.sql
--     → Functions de correlação tickets ↔ OS
--
-- 4.  20260129000000_import_batches_and_improvements.sql
--     → Sistema de import em lote
--
-- 5.  20260129140000_allow_ticket_insert.sql
--     → Políticas RLS para insert
--
-- 6.  20260129201602_acc196bf-5b7b-4234-a4a0-b734c7193870.sql
--
-- 7.  20260130142343_ea593808-8fd3-4582-be3a-2de0b1641261.sql
--
-- 8.  20260130142646_0fbe0935-8d7b-4f18-9e49-351f96065bd7.sql
--
-- 9.  20260130143149_5f3fdd87-fe58-4058-aaf7-3d4976d23833.sql
--
-- 10. 20260130145511_6acb5ba9-9a0c-4ce4-86a6-33efb7c2deb0.sql
--
-- 11. 20260130151857_16c59020-08bf-4924-a618-43412057104b.sql
--
-- 12. 20260130203426_febc031a-98e8-4d4f-829e-89d32eb805f9.sql
--
-- 13. 20260202135804_a44c3243-f849-4dad-8e9f-fe6bedfddf3d.sql
--
-- 14. 20260202181618_81056749-f244-42af-a0a0-aa49760d1daa.sql
--
-- 15. 20260204132057_c4e7b025-bffd-472d-8953-7134114855e7.sql
--
-- 16. 20260204134410_ef05b969-7912-4337-959a-9a0465aac31a.sql
--
-- 17. 20260204135557_8e5bea7e-7efb-4585-b2c9-3ce9ef69c6e4.sql
--
-- 18. 20260204140830_4b6188b4-2da2-4eb7-bd4f-1c6674669b32.sql
--
-- 19. 20260204180056_77691335-d16f-4e35-8aa6-5a7bc16e10a3.sql
--
-- 20. 20260205185823_dd69b437-7b80-4247-9d6c-d1106030a481.sql
--
-- 21. 20260206141339_cf0d125e-a2fa-4eb8-908e-ff02d18ff229.sql
--
-- 22. 20260206141536_9a36458f-fde9-47ee-b421-ed84e1530a8c.sql
--
-- 23. 20260206171838_2e3d7792-cb71-42ec-91ed-bbbfffa62f93.sql
--
-- 24. 20260206172746_341cbbde-a678-4fbe-8b03-bccdfd0cc55f.sql
--
-- 25. 20260206172831_185d9acc-3bc4-4c40-9c39-a2af67f95c04.sql
--
-- 26. 20260206175827_7e91ef14-3874-4459-b10c-efa097c90c61.sql
--
-- 27. 20260206175907_3d5ea433-ee9e-4d50-a10a-385437544849.sql
--
-- 28. 20260206180500_d02331dd-22fe-4873-a042-6b32d28ea1e1.sql
--
-- 29. 20260206183130_ea97f389-72a0-452f-93f6-459b69863378.sql
--
-- ESPECIAL: FIX_RLS_SUPABASE.sql
--     → Políticas RLS adicionais (incluindo testes anônimos)
--     → ⚠️ ATENÇÃO: Contém políticas de teste, ajustar para produção
--
-- =====================================================

-- =====================================================
-- VALIDAÇÃO PÓS-MIGRATION
-- =====================================================

-- Verificar tabelas criadas
SELECT 
    schemaname, 
    tablename,
    tableowner 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verificar enums criados
SELECT 
    n.nspname AS schema,
    t.typname AS enum_name,
    e.enumlabel AS enum_value
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- Verificar functions criadas
SELECT 
    routine_schema,
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Verificar políticas RLS
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verificar RLS habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- =====================================================
-- ESTATÍSTICAS
-- =====================================================

-- Contar objetos por tipo
SELECT 
    'Tables' AS object_type,
    COUNT(*) AS count
FROM pg_tables 
WHERE schemaname = 'public'

UNION ALL

SELECT 
    'Views' AS object_type,
    COUNT(*) AS count
FROM pg_views 
WHERE schemaname = 'public'

UNION ALL

SELECT 
    'Functions' AS object_type,
    COUNT(*) AS count
FROM information_schema.routines 
WHERE routine_schema = 'public'

UNION ALL

SELECT 
    'Enums' AS object_type,
    COUNT(DISTINCT typname) AS count
FROM pg_type 
WHERE typtype = 'e'

UNION ALL

SELECT 
    'Policies' AS object_type,
    COUNT(*) AS count
FROM pg_policies 
WHERE schemaname = 'public';

-- =====================================================
-- SEED DATA (Opcional)
-- =====================================================

-- Criar network de teste
INSERT INTO public.networks (name) 
VALUES ('Network Teste Dev')
ON CONFLICT (name) DO NOTHING;

-- Criar status mapping básico
INSERT INTO public.status_mapping (network_id, external_status, internal_status)
SELECT 
    id,
    'Novo',
    'novo'::public.internal_status
FROM public.networks 
WHERE name = 'Network Teste Dev'
ON CONFLICT (network_id, external_status) DO NOTHING;

INSERT INTO public.status_mapping (network_id, external_status, internal_status)
SELECT 
    id,
    'Em Atendimento',
    'em_atendimento'::public.internal_status
FROM public.networks 
WHERE name = 'Network Teste Dev'
ON CONFLICT (network_id, external_status) DO NOTHING;

INSERT INTO public.status_mapping (network_id, external_status, internal_status)
SELECT 
    id,
    'Finalizado',
    'finalizado'::public.internal_status
FROM public.networks 
WHERE name = 'Network Teste Dev'
ON CONFLICT (network_id, external_status) DO NOTHING;

-- =====================================================
-- VERIFICAÇÃO FINAL
-- =====================================================

SELECT '✅ Setup completo! Database pronta para uso.' AS status;
