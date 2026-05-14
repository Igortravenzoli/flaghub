-- =============================================================================
-- 20260514140000_populate_collaborator_map.sql
-- Carga inicial dos 52 colaboradores FLAG no devops_collaborator_map.
--
-- Campos:
--   timelog_name   → PRIMARY KEY; nome exato tal como aparece nos DevOps TimeLogs
--                    (pode precisar de ajuste após verificar devops_time_logs.user_name)
--   canonical_name → nome de exibição nos dashboards
--   devops_email   → e-mail Azure AD (usado na Fase 2 para POST ao DevOps TimeLogs)
--   vdesk_user_name→ login VDESK (Funrpsos_); preenchido apenas para os 5 usuários
--                    identificados via sync; NULL para os restantes
--   is_active      → true por defeito; false para inactivar sem remover o registo
--
-- Estratégia ON CONFLICT:
--   Se o timelog_name já existir (entrada criada por sync anterior), APENAS
--   preenche os campos novos (email, vdesk_user_name) que estejam NULL.
--   canonical_name existente NÃO é sobrescrito.
-- =============================================================================

INSERT INTO public.devops_collaborator_map
    (timelog_name, canonical_name, devops_email, vdesk_user_name, is_active)
VALUES
    -- A
    ('Ailton A. da Silveira',       'Ailton A. da Silveira',       'ailton@flag.com.br',         NULL,           true),
    ('Alessander Lantim',           'Alessander Lantim',           'lantim@flag.com.br',          NULL,           true),
    ('Alessandro Monge',            'Alessandro Monge',            'monge@flag.com.br',           NULL,           true),
    ('Alessandro Sales da Silva',   'Alessandro Sales da Silva',   'alessandro@flag.com.br',      'Alessandro',   true),
    ('Alex Amaral',                 'Alex Amaral',                 'alex.amaral@flag.com.br',     NULL,           true),
    ('Alexandre Diniz',             'Alexandre Diniz',             'alexandre@flag.com.br',       NULL,           true),
    ('Ana Luiza J. Figueiredo',     'Ana Luiza J. Figueiredo',     'ana.luiza@flag.com.br',       NULL,           true),
    ('Anderson S. dos Santos',      'Anderson S. dos Santos',      'anderson@flag.com.br',        'Anderson',     true),
    ('Ari L. Pereira Junior',       'Ari L. Pereira Junior',       'ari@flag.com.br',             NULL,           true),
    ('Arthur Rodrigues Goncalves',  'Arthur Rodrigues Goncalves',  'arthur.rodrigues@flag.com.br',NULL,           true),
    -- B
    ('Bruna B. de Oliveira',        'Bruna B. de Oliveira',        'bruna@flag.com.br',           NULL,           true),
    -- C
    ('Carlos Nunes',                'Carlos Nunes',                'carlos@flag.com.br',          'Carlos',       true),
    ('Carlos R. Alves',             'Carlos R. Alves',             'rodrigues@flag.com.br',       NULL,           true),
    ('Cynara M. Caldeira',          'Cynara M. Caldeira',          'cynara@flag.com.br',          NULL,           true),
    -- D
    ('Douglas J. Soares',           'Douglas J. Soares',           'douglas@flag.com.br',         NULL,           true),
    -- E
    ('Edna Venturato',              'Edna Venturato',              'edna@flag.com.br',            NULL,           true),
    ('Emerson L. Baldana',          'Emerson L. Baldana',          'emerson@flag.com.br',         'Emerson Luis', true),
    -- F
    ('Fabiano Almeida',             'Fabiano Almeida',             'fabiano@flag.com.br',         NULL,           true),
    ('Fabio H. Pereira',            'Fabio H. Pereira',            'fabio@flag.com.br',           NULL,           true),
    -- G
    ('Gislayne Karine',             'Gislayne Karine',             'gislayne@flag.com.br',        NULL,           true),
    -- H
    ('Henrique G. Barbosa Parisi',  'Henrique G. Barbosa Parisi',  'henrique@flag.com.br',        NULL,           true),
    -- I
    ('Igor Cardoso Travenzoli',     'Igor Cardoso Travenzoli',     'igor.cardoso@flag.com.br',    NULL,           true),
    ('Italo G. Narciso',            'Italo G. Narciso',            'italo.geraldo@flag.com.br',   NULL,           true),
    -- J
    ('Jackson S. Marques',          'Jackson S. Marques',          'jackson@flag.com.br',         NULL,           true),
    ('Joaquim Guimaraes',           'Joaquim Guimarães',           'joaquim@flag.com.br',         NULL,           true),
    ('Johnny C. dos Santos',        'Johnny C. dos Santos',        'johnny@flag.com.br',          NULL,           true),
    ('Jose Zozimo',                 'José Zozimo',                 'jgeraldo@flag.com.br',        NULL,           true),
    ('Junior Carlos Schmitt',       'Junior Carlos Schmitt',       'junior.schmitt@flag.com.br',  NULL,           true),
    -- K
    ('Kallel Bentes',               'Kallel Bentes',               'kallel@flag.com.br',          NULL,           true),
    ('Klelbio B. Miranda',          'Klélbio B. Miranda',          'klelbio@flag.com.br',         'Klelbio',      true),
    -- L
    ('Leandro J. Vaz de Faria',     'Leandro J. Vaz de Faria',     'leandro@flag.com.br',         NULL,           true),
    ('Leonardo V. Lucas Santos',    'Leonardo V. Lucas Santos',    'leonardo@flag.com.br',        NULL,           true),
    -- M
    ('Marco Aurelio Pimenta',       'Marco Aurélio Pimenta',       'marco@flag.com.br',           NULL,           true),
    ('Michael T. Vieira',           'Michael T. Vieira',           'michael@flag.com.br',         NULL,           true),
    ('Miller Oliveira',             'Miller Oliveira',             'miller@flag.com.br',          NULL,           true),
    -- N
    ('Nadim E. Donato Neto',        'Nadim E. Donato Neto',        NULL,                          NULL,           true),
    -- P
    ('Patricia G. de Souza Andrade','Patrícia G. de Souza Andrade','patricia@flag.com.br',        NULL,           true),
    ('Paulo Eduardo Tozzi',         'Paulo Eduardo Tozzi',         'paulo.eduardo@flag.com.br',   NULL,           true),
    ('Paulo J. Brasil Teixeira',    'Paulo J. Brasil Teixeira',    'paulo.teixeira@flag.com.br',  NULL,           true),
    ('Pedro H. Gomes Andrade',      'Pedro H. Gomes Andrade',      'pedro@flag.com.br',           NULL,           true),
    -- R
    ('Ricardo Mendes',              'Ricardo Mendes',              'ricardo@flag.com.br',         NULL,           true),
    ('Richard Zozimo',              'Richard Zozimo',              'richard@flag.com.br',         NULL,           true),
    ('Rodolfo F. Almeida',          'Rodolfo F. Almeida',          'rodolfo@flag.com.br',         NULL,           true),
    ('Roger Lima',                  'Roger Lima',                  'roger@flag.com.br',           NULL,           true),
    ('Ronald E. Carvalho',          'Ronald E. Carvalho',          'ronald@flag.com.br',          NULL,           true),
    ('Ronaldo V. de Souza',         'Ronaldo V. de Souza',         'ronaldo@flag.com.br',         NULL,           true),
    -- T
    ('Thales Jose Saraiva Pereira', 'Thales Jose Saraiva Pereira', 'thales@flag.com.br',          NULL,           true),
    ('Thiago S. Araujo',            'Thiago S. Araujo',            'thiago.araujo@flag.com.br',   NULL,           true),
    ('Thyago Porto',                'Thyago Porto',                'thyago.porto@flag.com.br',    NULL,           true),
    -- V
    ('Vagner R. Quirino',           'Vagner R. Quirino',           'vagner@flag.com.br',          NULL,           true),
    -- W
    ('Washington J. Abreu de Paula','Washington J. Abreu de Paula',NULL,                          NULL,           true),
    ('Wilker H. de Morais',         'Wilker H. de Morais',         'wilker@flag.com.br',          NULL,           true)

ON CONFLICT (timelog_name) DO UPDATE SET
    -- Apenas preenche os novos campos se ainda estiverem NULL (não sobrescreve dados manuais)
    devops_email    = COALESCE(devops_collaborator_map.devops_email,    EXCLUDED.devops_email),
    vdesk_user_name = COALESCE(devops_collaborator_map.vdesk_user_name, EXCLUDED.vdesk_user_name),
    is_active       = EXCLUDED.is_active;

-- Nota: o timelog_name usa a grafia sem acentos para evitar problemas de collation
-- com o campo devops_time_logs.user_name (que pode vir do Azure DevOps sem acentos).
-- O canonical_name usa a grafia correcta para exibição nos dashboards.
-- Após o primeiro sync, verificar via:
--   SELECT DISTINCT user_name FROM public.devops_time_logs ORDER BY 1;
-- e ajustar os timelog_name que não coincidam.
