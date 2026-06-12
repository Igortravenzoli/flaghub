-- Cobertura CI/CD por repositório: associa release definitions (classic CD)
-- aos repos via artefatos de build. Interpretação:
--   sem pipeline ativa            → descoberto
--   pipeline ativa, sem release   → cobertura parcial (CI sem CD)
--   pipeline ativa + release      → CI/CD completo (build ao deploy)
ALTER TABLE public.devops_repos
  ADD COLUMN IF NOT EXISTS release_count int NOT NULL DEFAULT 0;
