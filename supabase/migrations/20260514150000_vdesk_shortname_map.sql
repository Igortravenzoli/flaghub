-- =============================================================================
-- 20260514150000_vdesk_shortname_map.sql
-- Mapeia os 8 logins curtos do VDESK → devops_collaborator_map.
--
-- Contexto:
--   O sync vdesk-sync-timelog identificou 8 logins activos em vdesk_time_logs:
--   Alessandro, Anderson, Carlos, Elder, Emerson Luis, Klelbio, Thales, Thiago.
--
--   A migration anterior (20260514140000) inseriu os nomes completos. Este ficheiro:
--   1) Insere variantes com timelog_name = login curto (para o DevOps também
--      poder usar o nome curto nos seus registos de timelog).
--   2) Corrige vdesk_user_name nos registos de nome completo de Thales e Thiago
--      (estavam NULL na migration anterior).
--   3) Adiciona Elder (não estava na lista de 52 colaboradores).
-- =============================================================================

-- ── 1) Upsert variantes de nome curto ────────────────────────────────────────
INSERT INTO public.devops_collaborator_map
    (timelog_name, canonical_name, devops_email, vdesk_user_name, is_active)
VALUES
    ('Alessandro',  'Alessandro Sales da Silva',    'alessandro@flag.com.br',    'Alessandro',   true),
    ('Anderson',    'Anderson S. dos Santos',       'anderson@flag.com.br',      'Anderson',     true),
    ('Carlos',      'Carlos Nunes',                 'carlos@flag.com.br',        'Carlos',       true),
    ('Elder',       'Elder',                        NULL,                        'Elder',        true),
    ('Emerson Luis','Emerson L. Baldana',           'emerson@flag.com.br',       'Emerson Luis', true),
    ('Klelbio',     'Klélbio B. Miranda',           'klelbio@flag.com.br',       'Klelbio',      true),
    ('Thales',      'Thales Jose Saraiva Pereira',  'thales@flag.com.br',        'Thales',       true),
    ('Thiago',      'Thiago S. Araujo',             'thiago.araujo@flag.com.br', 'Thiago',       true)
ON CONFLICT (timelog_name) DO UPDATE SET
    canonical_name  = EXCLUDED.canonical_name,
    devops_email    = COALESCE(EXCLUDED.devops_email, devops_collaborator_map.devops_email),
    vdesk_user_name = EXCLUDED.vdesk_user_name,
    is_active       = EXCLUDED.is_active;

-- ── 2) Preenche vdesk_user_name nos registos de nome completo ───────────────
UPDATE public.devops_collaborator_map
   SET vdesk_user_name = 'Thales'
 WHERE timelog_name = 'Thales Jose Saraiva Pereira'
   AND vdesk_user_name IS NULL;

UPDATE public.devops_collaborator_map
   SET vdesk_user_name = 'Thiago'
 WHERE timelog_name = 'Thiago S. Araujo'
   AND vdesk_user_name IS NULL;

-- ── Nota sobre Elder ─────────────────────────────────────────────────────────
-- Colaborador Elder não constava na lista de emails fornecida.
-- Actualizar o email e canonical_name quando disponíveis:
--   UPDATE public.devops_collaborator_map
--      SET devops_email = 'elder@flag.com.br',
--          canonical_name = 'Elder [Sobrenome]'
--    WHERE timelog_name = 'Elder';
