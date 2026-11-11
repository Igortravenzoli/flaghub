-- GC-1 — Commits e pull requests do Azure DevOps, por autor e data.
--
-- Para quê: o relatório de horas do período mostra, por colaborador, o que foi
-- para o repositório ao lado das horas lançadas. Até aqui o portal só guardava
-- o inventário de repositórios (devops_repos) com a data do último commit.
--
-- Quem grava: a edge `devops-sync-git`, com service role. Ela percorre os
-- repositórios `aplicavel = true` e busca por janela de datas.
--
-- O que NÃO está aqui de propósito:
--   * diff e arquivos alterados — só a contagem (adds/edits/deletes);
--   * mensagem inteira — o Azure já a entrega truncada na listagem;
--   * vínculo com pessoa — fica por e-mail do autor, resolvido na leitura
--     contra devops_collaborator_map.devops_email, para que corrigir o
--     cadastro conserte o passado sem recoletar nada.

-- 1. Commits (branch padrão de cada repositório) ------------------------------
CREATE TABLE IF NOT EXISTS public.devops_git_commits (
  repo_id text NOT NULL REFERENCES public.devops_repos(id) ON DELETE CASCADE,
  commit_id text NOT NULL,              -- SHA-1
  project_name text NOT NULL,
  repo_name text NOT NULL,
  author_name text,
  author_email text,
  author_date timestamptz NOT NULL,     -- quando o autor escreveu o commit
  committer_date timestamptz,           -- quando entrou na branch (merge/rebase)
  comment text,
  adds int NOT NULL DEFAULT 0,
  edits int NOT NULL DEFAULT 0,
  deletes int NOT NULL DEFAULT 0,
  work_item_ids int[] NOT NULL DEFAULT '{}',
  web_url text,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, commit_id)
);

CREATE INDEX IF NOT EXISTS idx_devops_git_commits_author_date
  ON public.devops_git_commits (author_date);

-- 2. Pull requests ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devops_git_pull_requests (
  repo_id text NOT NULL REFERENCES public.devops_repos(id) ON DELETE CASCADE,
  pr_id int NOT NULL,
  project_name text NOT NULL,
  repo_name text NOT NULL,
  title text,
  status text,                          -- active | completed | abandoned
  is_draft boolean NOT NULL DEFAULT false,
  created_by_name text,
  created_by_email text,                -- uniqueName do Azure (é o e-mail)
  creation_date timestamptz NOT NULL,
  closed_date timestamptz,
  source_branch text,
  target_branch text,
  merge_status text,
  work_item_ids int[] NOT NULL DEFAULT '{}',
  web_url text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repo_id, pr_id)
);

CREATE INDEX IF NOT EXISTS idx_devops_git_prs_creation_date
  ON public.devops_git_pull_requests (creation_date);
CREATE INDEX IF NOT EXISTS idx_devops_git_prs_closed_date
  ON public.devops_git_pull_requests (closed_date);

-- 3. RLS ----------------------------------------------------------------------
-- Mesma régua de devops_time_logs: é atividade individual, então lê quem é
-- admin ou membro ativo das áreas técnicas. Escrita só por service role (a
-- edge) ou admin.
ALTER TABLE public.devops_git_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devops_git_pull_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devops_git_commits_select_restricted" ON public.devops_git_commits;
CREATE POLICY "devops_git_commits_select_restricted" ON public.devops_git_commits
  FOR SELECT TO authenticated
  USING (
    public.hub_is_admin() OR EXISTS (
      SELECT 1
      FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = ANY (ARRAY['fabrica', 'qualidade', 'programacao', 'devops', 'infraestrutura', 'produtos'])
    )
  );

DROP POLICY IF EXISTS "devops_git_commits_admin_mut" ON public.devops_git_commits;
CREATE POLICY "devops_git_commits_admin_mut" ON public.devops_git_commits
  FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

DROP POLICY IF EXISTS "devops_git_prs_select_restricted" ON public.devops_git_pull_requests;
CREATE POLICY "devops_git_prs_select_restricted" ON public.devops_git_pull_requests
  FOR SELECT TO authenticated
  USING (
    public.hub_is_admin() OR EXISTS (
      SELECT 1
      FROM public.hub_area_members m
      JOIN public.hub_areas a ON a.id = m.area_id
      WHERE m.user_id = (SELECT auth.uid())
        AND m.is_active = true
        AND a.key = ANY (ARRAY['fabrica', 'qualidade', 'programacao', 'devops', 'infraestrutura', 'produtos'])
    )
  );

DROP POLICY IF EXISTS "devops_git_prs_admin_mut" ON public.devops_git_pull_requests;
CREATE POLICY "devops_git_prs_admin_mut" ON public.devops_git_pull_requests
  FOR ALL TO authenticated
  USING (public.hub_is_admin()) WITH CHECK (public.hub_is_admin());

REVOKE ALL ON public.devops_git_commits, public.devops_git_pull_requests FROM anon;
GRANT SELECT ON public.devops_git_commits, public.devops_git_pull_requests TO authenticated;

-- 4. Agenda -------------------------------------------------------------------
-- Uma vez por dia, de madrugada, em DUAS fatias: ~76 repositórios × 3 chamadas
-- cabem numa execução, mas a folga contra o teto de 150 s da edge é pequena, e
-- uma fatia que estoura perde só a metade dela. Janela de 3 dias: cobre fim de
-- semana e commit que só entra na branch padrão depois do merge.
--
-- O header Authorization é derivado de um cron que já funciona (mesma técnica
-- de 20260715120000): o vault deste projeto não tem SUPABASE_ANON_KEY.
DO $$
DECLARE
  v_auth text;
  v_url  text := 'https://nxmgppfyltwsqryfxkbm.supabase.co/functions/v1/devops-sync-git';
  v_fatia int;
  v_job  text;
BEGIN
  SELECT substring(j.command from 'Bearer [A-Za-z0-9._-]+')
  INTO v_auth
  FROM cron.job j
  WHERE j.command LIKE '%Authorization%'
    AND j.command LIKE '%/functions/v1/%'
    AND j.jobname NOT LIKE 'sync-devops-git-%'
  ORDER BY j.jobname
  LIMIT 1;

  IF v_auth IS NULL THEN
    SELECT 'Bearer ' || ds.decrypted_secret INTO v_auth
    FROM vault.decrypted_secrets ds
    WHERE ds.name = 'SUPABASE_ANON_KEY'
    LIMIT 1;
  END IF;

  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Não foi possível derivar o header Authorization. Crons sync-devops-git-* NÃO agendados.';
  END IF;

  FOR v_fatia IN 0..1 LOOP
    v_job := 'sync-devops-git-' || v_fatia;

    PERFORM cron.unschedule(v_job)
    WHERE EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = v_job);

    -- 06:22 e 06:33 UTC = 03:22 e 03:33 de Brasília, fora dos minutos dos
    -- outros syncs do DevOps (0, 5, 7 e múltiplos de 10/15).
    PERFORM cron.schedule(
      v_job,
      format('%s 6 * * *', 22 + v_fatia * 11),
      format($cmd$
SELECT net.http_post(
  url := %L,
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', %L,
    'x-cron-secret', public.get_cron_secret()
  ),
  body := %L::jsonb
) AS request_id;
$cmd$, v_url, v_auth, format('{"dias": 3, "fatia": %s, "fatias": 2}', v_fatia))
    );
  END LOOP;
END;
$$;
