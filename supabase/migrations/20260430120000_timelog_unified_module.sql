-- =============================================================================
-- 20260430120000_timelog_unified_module.sql
-- Módulo de TimeLog Unificado (VDESK ↔ Azure DevOps)
--
-- Objetivos:
--   1) Espelhar apontamentos VDESK (Tb_Avd + HISTORICOOS + ATENDIMENTO) com
--      idempotência determinística → vdesk_time_logs
--   2) Criar fila controlada de POSTs para o DevOps TimeLog (TechsBCN) para
--      rollout incremental → timelog_post_queue
--   3) Auditar runs de sincronização → timelog_sync_runs
--   4) Expor visão única `v_timelog_unified` (match / only_vdesk / only_devops
--      / divergent) para o gerencial do FlagHub
--
-- Migrations relacionadas:
--   - devops_time_logs (já existia, populado por devops-sync-timelog)
--   - devops_collaborator_map (já existia; agora também recebe email DevOps)
-- =============================================================================

-- ── 0) Hardening em devops_collaborator_map ──────────────────────────────────
-- Permite mapear usuário VDESK (Funrpsos_) → usuário Azure DevOps (e-mail).
-- Necessário no momento de postar com a identidade correta.
ALTER TABLE public.devops_collaborator_map
    ADD COLUMN IF NOT EXISTS vdesk_user_name text,
    ADD COLUMN IF NOT EXISTS devops_unique_name text,
    ADD COLUMN IF NOT EXISTS devops_email text,
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_devops_collaborator_map_vdesk
    ON public.devops_collaborator_map (lower(vdesk_user_name))
    WHERE vdesk_user_name IS NOT NULL;

-- ── 1) vdesk_time_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vdesk_time_logs (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Correlação Azure DevOps
    task_devops         integer     NOT NULL,

    -- Origem VDESK
    num_os              text        NOT NULL,
    os_origem           text,
    usuario_vdesk       text        NOT NULL,           -- HISTORICOOS.Funrpsos_
    log_date            date        NOT NULL,
    start_time          text,                            -- HH:mm:ss
    tempo_segundos      integer     NOT NULL CHECK (tempo_segundos >= 0),
    horas               integer     NOT NULL CHECK (horas >= 0),
    minutos             integer     NOT NULL CHECK (minutos BETWEEN 0 AND 59),
    data_historico      timestamptz NOT NULL,            -- HISTORICOOS.Dathorhtros_

    -- Idempotência: chave natural composta populada por trigger
    -- Reflete a granularidade do agregado VDESK (Data, Usuário, OS, Histórico)
    -- Não usamos GENERATED porque to_char em timestamptz depende de TZ/locale
    -- (gera erro "generation expression is not immutable").
    vdesk_ext_key       text        NOT NULL DEFAULT '',

    -- Auditoria
    raw                 jsonb,
    synced_at           timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Trigger que mantém vdesk_ext_key sincronizada com os campos-chave.
-- Usa o epoch em microssegundos para o timestamptz → 100% imutável e único.
CREATE OR REPLACE FUNCTION public.fn_set_vdesk_ext_key()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.vdesk_ext_key := NEW.task_devops::text || ':' ||
                         NEW.num_os || ':' ||
                         NEW.usuario_vdesk || ':' ||
                         NEW.log_date::text || ':' ||
                         (extract(epoch from NEW.data_historico) * 1000000)::bigint::text;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vdesk_time_logs_ext_key ON public.vdesk_time_logs;
CREATE TRIGGER trg_vdesk_time_logs_ext_key
    BEFORE INSERT OR UPDATE OF task_devops, num_os, usuario_vdesk, log_date, data_historico
    ON public.vdesk_time_logs
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_vdesk_ext_key();

CREATE UNIQUE INDEX IF NOT EXISTS uq_vdesk_time_logs_ext_key
    ON public.vdesk_time_logs (vdesk_ext_key);

CREATE INDEX IF NOT EXISTS idx_vdesk_time_logs_task_date
    ON public.vdesk_time_logs (task_devops, log_date);

CREATE INDEX IF NOT EXISTS idx_vdesk_time_logs_user_date
    ON public.vdesk_time_logs (lower(usuario_vdesk), log_date);

CREATE INDEX IF NOT EXISTS idx_vdesk_time_logs_log_date
    ON public.vdesk_time_logs (log_date DESC);

-- ── 2) timelog_post_queue ────────────────────────────────────────────────────
-- Fila controlada de POSTs para o TimeLog do DevOps. Cada linha = uma intenção
-- de lançamento. Estado evolui via RPCs (queue / approve / mark_posted / fail).
CREATE TABLE IF NOT EXISTS public.timelog_post_queue (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    vdesk_log_id        uuid        NOT NULL REFERENCES public.vdesk_time_logs(id) ON DELETE CASCADE,

    -- Cópia desnormalizada para auditoria (sobrevive a delete cascade abaixo)
    task_devops         integer     NOT NULL,
    log_date            date        NOT NULL,
    time_minutes        integer     NOT NULL CHECK (time_minutes > 0),

    -- Identidade alvo no DevOps
    target_user_email   text,                            -- preferido pelo TechsBCN
    target_user_display text,                            -- fallback / exibição
    vdesk_user_name     text        NOT NULL,            -- origem (auditoria)

    -- Notas a serem enviadas. Padrão: "VDESK OS <num_os> — <usuario_vdesk> — Lançamento automatizado FlagHub"
    notes               text,

    -- Estado da fila
    status              text        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','posting','posted','duplicated','error','skipped','rejected')),

    -- Quem aprovou / processou
    selected_by         uuid        REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    selected_at         timestamptz,
    approved_by         uuid        REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    approved_at         timestamptz,

    -- Resultado do POST
    posted_at           timestamptz,
    devops_entry_id     text,                            -- id retornado pela API
    error_code          text,
    error_message       text,
    attempt_count       integer     NOT NULL DEFAULT 0,
    last_attempt_at     timestamptz,

    -- Modo de execução
    dry_run             boolean     NOT NULL DEFAULT true,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Apenas uma intenção viva por vdesk_log_id (linhas em estado terminal podem ser
-- recriadas para retry — UNIQUE parcial).
CREATE UNIQUE INDEX IF NOT EXISTS uq_timelog_post_queue_active_log
    ON public.timelog_post_queue (vdesk_log_id)
    WHERE status IN ('pending','approved','posting');

CREATE INDEX IF NOT EXISTS idx_timelog_post_queue_status
    ON public.timelog_post_queue (status);

CREATE INDEX IF NOT EXISTS idx_timelog_post_queue_task_date
    ON public.timelog_post_queue (task_devops, log_date);

-- ── 3) timelog_sync_runs ─────────────────────────────────────────────────────
-- Auditoria por execução do sync (VDESK→Supabase via Gateway).
CREATE TABLE IF NOT EXISTS public.timelog_sync_runs (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at          timestamptz NOT NULL DEFAULT now(),
    finished_at         timestamptz,
    duration_ms         integer,

    from_date           date        NOT NULL,
    to_date             date        NOT NULL,

    rows_fetched        integer     NOT NULL DEFAULT 0,
    rows_inserted       integer     NOT NULL DEFAULT 0,
    rows_updated        integer     NOT NULL DEFAULT 0,
    rows_skipped        integer     NOT NULL DEFAULT 0,
    pages_fetched       integer     NOT NULL DEFAULT 0,

    status              text        NOT NULL DEFAULT 'running'
        CHECK (status IN ('running','ok','error','partial')),
    error_code          text,
    error_message       text,

    triggered_by        text        NOT NULL DEFAULT 'cron', -- 'cron' | 'manual' | 'admin:<uuid>'
    gateway_url         text,                                 -- p/ debug (sem secret)

    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timelog_sync_runs_started
    ON public.timelog_sync_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_timelog_sync_runs_status
    ON public.timelog_sync_runs (status);

-- ── 4) Trigger de updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vdesk_time_logs_updated_at ON public.vdesk_time_logs;
CREATE TRIGGER trg_vdesk_time_logs_updated_at
    BEFORE UPDATE ON public.vdesk_time_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_timelog_post_queue_updated_at ON public.timelog_post_queue;
CREATE TRIGGER trg_timelog_post_queue_updated_at
    BEFORE UPDATE ON public.timelog_post_queue
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5) View unificada VDESK ↔ DevOps ─────────────────────────────────────────
-- Granularidade: (task_devops, log_date, user_canonical).
-- - VDESK: somatório de tempo_segundos por (task, dia, usuário)
-- - DevOps: somatório de time_minutes por (work_item_id, log_date, user_canonical)
-- - canonical_name vem de devops_collaborator_map (aceita match por vdesk_user_name)
CREATE OR REPLACE VIEW public.v_timelog_unified AS
WITH
vdesk_agg AS (
    SELECT
        v.task_devops                                                         AS task_id,
        v.log_date,
        coalesce(cm.canonical_name, v.usuario_vdesk)                          AS user_canonical,
        v.usuario_vdesk                                                        AS vdesk_user_name,
        sum(v.tempo_segundos)                                                  AS seconds_vdesk,
        round(sum(v.tempo_segundos) / 60.0)::int                               AS minutes_vdesk,
        count(*)                                                               AS rows_vdesk,
        array_agg(v.id)                                                        AS vdesk_log_ids,
        max(v.num_os)                                                          AS num_os_sample
    FROM public.vdesk_time_logs v
    LEFT JOIN public.devops_collaborator_map cm
        ON lower(cm.vdesk_user_name) = lower(v.usuario_vdesk)
       AND coalesce(cm.is_active, true)
    GROUP BY v.task_devops, v.log_date, coalesce(cm.canonical_name, v.usuario_vdesk), v.usuario_vdesk
),
devops_agg AS (
    SELECT
        d.work_item_id                                                         AS task_id,
        d.log_date,
        coalesce(cm.canonical_name, d.user_name)                               AS user_canonical,
        sum(d.time_minutes)                                                    AS minutes_devops,
        count(*)                                                               AS rows_devops
    FROM public.devops_time_logs d
    LEFT JOIN public.devops_collaborator_map cm
        ON lower(cm.timelog_name) = lower(d.user_name)
       AND coalesce(cm.is_active, true)
    WHERE d.work_item_id IS NOT NULL
    GROUP BY d.work_item_id, d.log_date, coalesce(cm.canonical_name, d.user_name)
)
SELECT
    coalesce(v.task_id, d.task_id)                                AS task_id,
    coalesce(v.log_date, d.log_date)                              AS log_date,
    coalesce(v.user_canonical, d.user_canonical)                  AS user_canonical,
    v.vdesk_user_name,
    coalesce(v.minutes_vdesk, 0)                                  AS minutes_vdesk,
    coalesce(d.minutes_devops, 0)                                 AS minutes_devops,
    coalesce(v.minutes_vdesk, 0) - coalesce(d.minutes_devops, 0)  AS gap_minutes,
    v.rows_vdesk,
    d.rows_devops,
    v.vdesk_log_ids,
    v.num_os_sample,
    wi.title                                                      AS work_item_title,
    wi.state                                                      AS work_item_state,
    wi.assigned_to_display                                        AS work_item_assigned_to,
    wi.web_url                                                    AS work_item_url,
    CASE
        WHEN v.task_id IS NULL THEN 'only_devops'
        WHEN d.task_id IS NULL THEN 'only_vdesk'
        WHEN coalesce(v.minutes_vdesk, 0) = coalesce(d.minutes_devops, 0) THEN 'match'
        ELSE 'divergent'
    END                                                            AS status
FROM vdesk_agg v
FULL OUTER JOIN devops_agg d
    ON  d.task_id        = v.task_id
   AND d.log_date        = v.log_date
   AND d.user_canonical  = v.user_canonical
LEFT JOIN public.devops_work_items wi
    ON wi.id = coalesce(v.task_id, d.task_id);

COMMENT ON VIEW public.v_timelog_unified IS
'Visão única (VDESK ↔ DevOps) por (task, dia, usuário). Status: match / only_vdesk / only_devops / divergent.';

-- ── 6) Helper RPC: enfileirar lançamento (uma vdesk_log → 1 fila) ────────────
CREATE OR REPLACE FUNCTION public.rpc_timelog_queue_post(
    p_vdesk_log_id      uuid,
    p_target_user_email text DEFAULT NULL,
    p_dry_run           boolean DEFAULT true,
    p_notes_override    text DEFAULT NULL
)
RETURNS public.timelog_post_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_log    public.vdesk_time_logs%ROWTYPE;
    v_map    public.devops_collaborator_map%ROWTYPE;
    v_minutes integer;
    v_email   text;
    v_display text;
    v_notes   text;
    v_caller  uuid := auth.uid();
    v_row     public.timelog_post_queue%ROWTYPE;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_log FROM public.vdesk_time_logs WHERE id = p_vdesk_log_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'vdesk_time_logs id=% não encontrado.', p_vdesk_log_id USING ERRCODE = 'P0002';
    END IF;

    -- Resolução do destinatário
    SELECT * INTO v_map
      FROM public.devops_collaborator_map
     WHERE lower(vdesk_user_name) = lower(v_log.usuario_vdesk)
       AND coalesce(is_active, true)
     LIMIT 1;

    v_email   := coalesce(p_target_user_email, v_map.devops_email);
    v_display := coalesce(v_map.canonical_name, v_log.usuario_vdesk);

    v_minutes := round(v_log.tempo_segundos / 60.0)::int;
    IF v_minutes <= 0 THEN
        RAISE EXCEPTION 'Apontamento com tempo zerado (%s).', v_log.tempo_segundos USING ERRCODE = '22023';
    END IF;

    v_notes := coalesce(
        p_notes_override,
        format('VDESK OS %s — %s — Lançamento automatizado FlagHub',
               v_log.num_os, coalesce(v_log.usuario_vdesk, '?'))
    );

    -- Idempotência: se já existir intenção viva, retorna a existente (sem duplicar).
    SELECT * INTO v_row
      FROM public.timelog_post_queue
     WHERE vdesk_log_id = p_vdesk_log_id
       AND status IN ('pending','approved','posting');
    IF FOUND THEN
        RETURN v_row;
    END IF;

    INSERT INTO public.timelog_post_queue (
        vdesk_log_id, task_devops, log_date, time_minutes,
        target_user_email, target_user_display, vdesk_user_name,
        notes, dry_run, status, selected_by, selected_at
    )
    VALUES (
        v_log.id, v_log.task_devops, v_log.log_date, v_minutes,
        v_email, v_display, v_log.usuario_vdesk,
        v_notes, p_dry_run, 'pending', v_caller, now()
    )
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_timelog_queue_post(uuid, text, boolean, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_timelog_queue_post(uuid, text, boolean, text) TO authenticated;

-- ── 7) RPC: aprovar / rejeitar (admin) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_timelog_set_status(
    p_queue_id  uuid,
    p_action    text,           -- 'approve' | 'reject' | 'reset'
    p_reason    text DEFAULT NULL
)
RETURNS public.timelog_post_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_caller uuid := auth.uid();
    v_is_admin boolean;
    v_row public.timelog_post_queue%ROWTYPE;
    v_new_status text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Autenticação obrigatória.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.hub_user_global_roles
         WHERE user_id = v_caller AND role = 'admin'
        UNION ALL
        SELECT 1 FROM public.user_roles
         WHERE user_id = v_caller AND role = 'admin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Apenas admins podem aprovar/rejeitar lançamentos.' USING ERRCODE = '42501';
    END IF;

    v_new_status := CASE p_action
        WHEN 'approve' THEN 'approved'
        WHEN 'reject'  THEN 'rejected'
        WHEN 'reset'   THEN 'pending'
        ELSE NULL
    END;

    IF v_new_status IS NULL THEN
        RAISE EXCEPTION 'Ação inválida: %.', p_action USING ERRCODE = '22023';
    END IF;

    UPDATE public.timelog_post_queue
       SET status         = v_new_status,
           approved_by    = CASE WHEN v_new_status = 'approved' THEN v_caller ELSE approved_by END,
           approved_at    = CASE WHEN v_new_status = 'approved' THEN now()    ELSE approved_at END,
           error_message  = coalesce(p_reason, error_message)
     WHERE id = p_queue_id
     RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item de fila não encontrado: %.', p_queue_id USING ERRCODE = 'P0002';
    END IF;

    RETURN v_row;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_timelog_set_status(uuid, text, text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_timelog_set_status(uuid, text, text) TO authenticated;

-- ── 8) RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.vdesk_time_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timelog_post_queue    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timelog_sync_runs     ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado vê os logs (gerencial).
DROP POLICY IF EXISTS "vdesk_time_logs_select" ON public.vdesk_time_logs;
CREATE POLICY "vdesk_time_logs_select" ON public.vdesk_time_logs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "timelog_post_queue_select" ON public.timelog_post_queue;
CREATE POLICY "timelog_post_queue_select" ON public.timelog_post_queue
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "timelog_sync_runs_select" ON public.timelog_sync_runs;
CREATE POLICY "timelog_sync_runs_select" ON public.timelog_sync_runs
    FOR SELECT TO authenticated USING (true);

-- Escrita direta NÃO permitida via PostgREST. Apenas:
--   - service_role (Edge functions com SUPABASE_SERVICE_ROLE_KEY)
--   - RPCs SECURITY DEFINER (funções acima)
-- Nenhuma policy INSERT/UPDATE/DELETE para `authenticated`.

-- ── 9) Grants básicos ────────────────────────────────────────────────────────
GRANT SELECT ON public.vdesk_time_logs    TO authenticated;
GRANT SELECT ON public.timelog_post_queue TO authenticated;
GRANT SELECT ON public.timelog_sync_runs  TO authenticated;
GRANT SELECT ON public.v_timelog_unified  TO authenticated;

COMMENT ON TABLE public.vdesk_time_logs    IS 'Espelho idempotente dos apontamentos VDESK (Tb_Avd) com Task DevOps preenchida.';
COMMENT ON TABLE public.timelog_post_queue IS 'Fila controlada de POSTs para o TimeLog DevOps (TechsBCN). Aprovação obrigatória.';
COMMENT ON TABLE public.timelog_sync_runs  IS 'Auditoria de execuções da edge vdesk-sync-timelog.';
