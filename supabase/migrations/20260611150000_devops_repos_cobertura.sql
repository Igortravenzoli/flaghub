-- DevOps Infra — inventário de projetos/repositórios e cobertura de pipelines
-- Etapa 1: validar repositórios e quantificar automações.
-- Classificação manual no front: aplicavel = true | false (legado) | null (pendente).

-- 1. Projetos da organização (FlagIW)
CREATE TABLE IF NOT EXISTS public.devops_projects (
  id text PRIMARY KEY,                -- GUID do projeto no Azure DevOps
  name text NOT NULL,
  description text,
  state text,
  visibility text,
  web_url text,
  last_update_time timestamptz,
  repo_count int NOT NULL DEFAULT 0,
  pipeline_count int NOT NULL DEFAULT 0,
  release_definition_count int NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Repositórios Git por projeto
CREATE TABLE IF NOT EXISTS public.devops_repos (
  id text PRIMARY KEY,                -- GUID do repositório no Azure DevOps
  project_id text NOT NULL REFERENCES public.devops_projects(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  name text NOT NULL,
  default_branch text,
  size_bytes bigint,
  web_url text,
  is_disabled boolean NOT NULL DEFAULT false,
  last_commit_date timestamptz,       -- validação de atividade (repos legados)
  pipeline_count int NOT NULL DEFAULT 0,
  active_pipeline_count int NOT NULL DEFAULT 0,  -- definitions com queueStatus = enabled
  pipelines jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id, name, path, queueStatus, createdDate, webUrl}]
  -- Classificação manual (gestão de cobertura)
  aplicavel boolean,                  -- null = não classificado; false = legado/não se justifica
  classificacao_obs text,
  classificado_por uuid,
  classificado_em timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devops_repos_project ON public.devops_repos(project_id);
CREATE INDEX IF NOT EXISTS idx_devops_repos_aplicavel ON public.devops_repos(aplicavel);

-- 3. RLS: leitura para autenticados; mutação direta apenas admin (sync usa service role)
ALTER TABLE public.devops_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devops_projects_select" ON public.devops_projects FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "devops_projects_admin_mut" ON public.devops_projects FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

ALTER TABLE public.devops_repos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devops_repos_select" ON public.devops_repos FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "devops_repos_admin_mut" ON public.devops_repos FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

-- 4. RPC de classificação: usuários autenticados só alteram os campos de classificação
CREATE OR REPLACE FUNCTION public.rpc_devops_repo_classificar(
  p_repo_id text,
  p_aplicavel boolean,        -- null limpa a classificação
  p_obs text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;

  UPDATE public.devops_repos SET
    aplicavel = p_aplicavel,
    classificacao_obs = p_obs,
    classificado_por = auth.uid(),
    classificado_em = now()
  WHERE id = p_repo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repositório % não encontrado', p_repo_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_devops_repo_classificar(text, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_devops_repo_classificar(text, boolean, text) TO authenticated;
