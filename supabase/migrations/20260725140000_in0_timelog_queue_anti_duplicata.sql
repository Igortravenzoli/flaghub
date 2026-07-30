-- =============================================================================
-- IN-0 — Blindagem anti-duplicata da fila de timelog (pré-requisito da automação)
--
-- PROBLEMA: a edge devops-post-timelog gera um UUID NOVO a cada envio
-- (crypto.randomUUID → POST de documento novo no TechsBCN) e NÃO faz nenhuma
-- verificação prévia. Não existe idempotência do lado do Azure DevOps: postar
-- duas vezes o mesmo apontamento cria duas entradas de hora, e desfazer exige
-- o modo 'cleanup' (DELETE por doc id).
--
-- A única trava hoje é o índice uq_timelog_post_queue_active_log, que é
-- PARCIAL — só cobre status IN ('pending','approved','posting'). Depois que a
-- linha vira 'posted', nada impede criar OUTRA linha para o mesmo vdesk_log_id
-- e postar de novo. Com aprovação manual isso é improvável (a UI só oferece
-- "Enfileirar" quando não há linha no escopo); num loop automático seria
-- sistemático — hora dobrada no DevOps de todo o time.
--
-- CORREÇÃO:
--   1. Auditoria: reporta (NOTICE) todo vdesk_log_id com mais de uma linha.
--   2. Dedupe SEGURO: remove apenas duplicatas SEM valor probatório. Uma linha
--      'posted' NUNCA é apagada — ela é a prova do que foi ao DevOps.
--   3. Índice único TOTAL em vdesk_log_id. Se restarem 2+ linhas 'posted' para
--      o mesmo apontamento, a criação FALHA de propósito: significa que já
--      houve lançamento duplicado real no DevOps e isso precisa de decisão
--      humana (limpar no DevOps antes), não de um índice escondendo o rastro.
--   4. rpc_timelog_queue_post passa a devolver a linha existente em QUALQUER
--      status (hoje só procura as "vivas" e tentaria INSERT — que agora
--      violaria o índice). Sem isso, reenfileirar um item já postado passaria
--      de "duplica silenciosamente" para "estoura erro na tela".
--
-- Todos os caminhos de retentativa usam UPDATE (rpc_timelog_set_status 'reset'
-- e o modo 'cleanup' da edge), nunca INSERT — logo, o índice total não quebra
-- nenhum fluxo existente.
-- =============================================================================

-- ── 1. Auditoria: o que está duplicado hoje ─────────────────────────────────
DO $$
DECLARE
  v_rec record;
  v_total int := 0;
  v_posted int := 0;
BEGIN
  FOR v_rec IN
    SELECT vdesk_log_id,
           count(*) AS n,
           count(*) FILTER (WHERE status = 'posted') AS n_posted,
           string_agg(status || '(' || coalesce(devops_entry_id, '-') || ')', ', ' ORDER BY created_at) AS detalhe
    FROM public.timelog_post_queue
    GROUP BY vdesk_log_id
    HAVING count(*) > 1
    ORDER BY count(*) DESC
  LOOP
    v_total := v_total + 1;
    IF v_rec.n_posted > 1 THEN
      v_posted := v_posted + 1;
      RAISE NOTICE 'DUPLICATA POSTADA (!): vdesk_log_id=% tem % linhas, % delas posted → %',
        v_rec.vdesk_log_id, v_rec.n, v_rec.n_posted, v_rec.detalhe;
    ELSE
      RAISE NOTICE 'duplicata resolvível: vdesk_log_id=% tem % linhas → %',
        v_rec.vdesk_log_id, v_rec.n, v_rec.detalhe;
    END IF;
  END LOOP;

  IF v_total = 0 THEN
    RAISE NOTICE 'Auditoria da fila: nenhuma duplicata. OK.';
  ELSIF v_posted > 0 THEN
    RAISE WARNING 'ATENÇÃO: % apontamento(s) foram POSTADOS MAIS DE UMA VEZ no DevOps. '
                  'O índice único abaixo vai falhar de propósito — limpe os documentos '
                  'duplicados no TechsBCN (edge devops-post-timelog, mode=cleanup) antes de reaplicar.',
                  v_posted;
  END IF;
END $$;

-- ── 2. Dedupe seguro (nunca apaga linha 'posted') ───────────────────────────
-- Mantém, por vdesk_log_id: a linha 'posted' se houver; senão a mais avançada
-- no fluxo; empate resolvido pela mais recente.
WITH ranked AS (
  SELECT id, vdesk_log_id,
    row_number() OVER (
      PARTITION BY vdesk_log_id
      ORDER BY CASE status
                 WHEN 'posted'    THEN 1
                 WHEN 'posting'   THEN 2
                 WHEN 'approved'  THEN 3
                 WHEN 'pending'   THEN 4
                 WHEN 'error'     THEN 5
                 WHEN 'duplicated' THEN 6
                 WHEN 'skipped'   THEN 7
                 WHEN 'rejected'  THEN 8
                 ELSE 9
               END,
               created_at DESC
    ) AS rn,
    count(*) FILTER (WHERE status = 'posted') OVER (PARTITION BY vdesk_log_id) AS n_posted
  FROM public.timelog_post_queue
)
DELETE FROM public.timelog_post_queue q
USING ranked r
WHERE q.id = r.id
  AND r.rn > 1
  AND r.n_posted <= 1;   -- só desempata quando NÃO há evidência de duplo lançamento

-- ── 3. Índice único total (substitui o parcial) ─────────────────────────────
DROP INDEX IF EXISTS public.uq_timelog_post_queue_active_log;

CREATE UNIQUE INDEX IF NOT EXISTS uq_timelog_post_queue_vdesk_log
  ON public.timelog_post_queue (vdesk_log_id);

COMMENT ON INDEX public.uq_timelog_post_queue_vdesk_log IS
  'IN-0: no máximo UMA linha de fila por apontamento VDESK, em qualquer status. '
  'O POST ao TechsBCN não tem idempotência (gera UUID novo a cada envio), então '
  'esta é a única barreira estrutural contra lançar a mesma hora duas vezes. '
  'Retentativa é sempre UPDATE (reset/cleanup), nunca INSERT.';

-- ── 4. rpc_timelog_queue_post: devolve a linha existente em qualquer status ──
-- Corpo idêntico ao vigente (20260430120000) exceto o lookup de idempotência.
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

    -- Idempotência: UMA linha por apontamento, qualquer status. Se já existe
    -- (inclusive 'posted' ou 'rejected'), devolve a existente em vez de criar
    -- outra — reenfileirar um item já lançado duplicaria a hora no DevOps.
    -- Para reprocessar, usar rpc_timelog_set_status(..., 'reset').
    SELECT * INTO v_row
      FROM public.timelog_post_queue
     WHERE vdesk_log_id = p_vdesk_log_id;
    IF FOUND THEN
        RETURN v_row;
    END IF;

    SELECT * INTO v_log FROM public.vdesk_time_logs WHERE id = p_vdesk_log_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'vdesk_time_logs id=% não encontrado.', p_vdesk_log_id USING ERRCODE = 'P0002';
    END IF;

    -- Resolução do destinatário (1 linha garantida pelo índice do TL-5)
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
