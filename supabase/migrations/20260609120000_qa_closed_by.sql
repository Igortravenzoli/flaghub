-- ============================================================================
-- Migration: 20260609120000_qa_closed_by.sql
-- DASH QA — Conceito de "concluído" por Closed By
--
-- Para o DASH QA, um item só é "concluído" quando o Closed By for um dos
-- usuários autorizados do QA (não basta estar em Done). Esta migration:
--
--   1. Adiciona closed_by / closed_by_email / closed_date em devops_work_items
--      (preenchidos pelo sync a partir de Microsoft.VSTS.Common.ClosedBy).
--      As RPCs de QA leem o Closed By daqui via join (fonte única; cobre Bugs,
--      que não passam pelo recompute de lifecycle).
--   2. Cria a tabela de referência qa_authorized_closers (allowlist editável
--      por admin) + seed dos 6 usuários do QA.
--   3. Faz backfill inicial a partir do state_history existente (cobertura
--      parcial ~16% — completa após re-sync com o campo nativo ClosedBy).
-- ============================================================================

-- ── 1. Colunas em devops_work_items ──────────────────────────────────────────
ALTER TABLE public.devops_work_items
  ADD COLUMN IF NOT EXISTS closed_by       text,
  ADD COLUMN IF NOT EXISTS closed_by_email text,
  ADD COLUMN IF NOT EXISTS closed_date     timestamptz;

CREATE INDEX IF NOT EXISTS idx_dwi_closed_by_email
  ON public.devops_work_items (lower(closed_by_email));
CREATE INDEX IF NOT EXISTS idx_dwi_closed_by
  ON public.devops_work_items (lower(closed_by));

-- ── 2. Tabela de referência: usuários autorizados a "encerrar" no QA ─────────
CREATE TABLE IF NOT EXISTS public.qa_authorized_closers (
  email        text PRIMARY KEY,        -- uniqueName do DevOps (lowercase)
  display_name text NOT NULL,           -- displayName do DevOps
  canonical    text,                    -- apelido conhecido (Thales, Marquin...)
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.qa_authorized_closers IS
  'Allowlist de usuários do QA cujo Closed By marca um item como "concluído" no DASH QA. '
  'Matching por email (lower) OU display_name (lower). Editável por admin.';

INSERT INTO public.qa_authorized_closers (email, display_name, canonical) VALUES
  ('thales@flag.com.br',            'Thales Jose Saraiva Pereira', 'Thales'),
  ('marco@flag.com.br',             'Marco Aurélio Pimenta',       'Marco'),
  ('rodrigues@flag.com.br',         'Carlos R. Alves',             'Rodrigues'),
  ('thiago.araujo@flag.com.br',     'Thiago S. Araujo',            'Thiago'),
  ('alessandro@flag.com.br',        'Alessandro Sales da Silva',   'Alessandro'),
  ('mauricio.monteiro@flag.com.br', 'Mauricio Monteiro',           'Mauricio')
ON CONFLICT (email) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      canonical    = EXCLUDED.canonical,
      is_active    = true,
      updated_at   = now();

-- ── 3. RLS (espelha devops_lead_mapping) ─────────────────────────────────────
ALTER TABLE public.qa_authorized_closers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qa_closers_select"    ON public.qa_authorized_closers;
DROP POLICY IF EXISTS "qa_closers_admin_all" ON public.qa_authorized_closers;

CREATE POLICY "qa_closers_select" ON public.qa_authorized_closers
  FOR SELECT TO authenticated
  USING (public.hub_is_approved());

CREATE POLICY "qa_closers_admin_all" ON public.qa_authorized_closers
  FOR ALL TO authenticated
  USING (public.hub_is_admin())
  WITH CHECK (public.hub_is_admin());

-- updated_at trigger (set_updated_at() já existe — criado no módulo de retorno QA)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_qa_closers_updated_at'
      AND tgrelid = 'public.qa_authorized_closers'::regclass
  ) THEN
    CREATE TRIGGER trg_qa_closers_updated_at
      BEFORE UPDATE ON public.qa_authorized_closers
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 4. Backfill inicial a partir do state_history ────────────────────────────
-- O campo nativo ClosedBy ainda não foi coletado; enquanto isso derivamos quem
-- fechou (revisedBy da última transição para done/closed/resolved). Só há
-- displayName no histórico — o email vem completo após o re-sync.
WITH closers AS (
  SELECT
    w.id,
    (SELECT e->>'revisedBy'
       FROM jsonb_array_elements(w.state_history) e
      WHERE lower(trim(e->>'newValue')) IN ('done','closed','resolved')
      ORDER BY e->>'revisedDate' DESC
      LIMIT 1) AS cb,
    (SELECT NULLIF(e->>'revisedDate','')::timestamptz
       FROM jsonb_array_elements(w.state_history) e
      WHERE lower(trim(e->>'newValue')) IN ('done','closed','resolved')
      ORDER BY e->>'revisedDate' DESC
      LIMIT 1) AS cd
  FROM public.devops_work_items w
  WHERE w.state_history IS NOT NULL
)
UPDATE public.devops_work_items w
   SET closed_by   = c.cb,
       closed_date = COALESCE(w.closed_date, c.cd)
  FROM closers c
 WHERE w.id = c.id
   AND c.cb IS NOT NULL
   AND w.closed_by IS NULL;
