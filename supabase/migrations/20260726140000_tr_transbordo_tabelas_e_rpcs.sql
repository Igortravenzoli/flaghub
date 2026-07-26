-- =============================================================================
-- TR — Transbordo de sprint: rastro, elegibilidade e trava de segurança
--
-- Fluxo desenhado com o gestor (25/07/2026):
--   1. CLASSIFICAR — lista PBI/Bugs passíveis de transbordo (status New ou
--      Em desenvolvimento SEM a tag), o gestor multiseleciona e a tag
--      TRANSBORDO é aplicada no Azure DevOps.
--   2. APLICAR TRANSBORDO — move para a próxima sprint só o que está
--      classificado. Se houver pendente de classificação, o pop-up pergunta
--      se o gestor quer classificar antes; se não, envia só os classificados.
--
-- Definição oficial: "transbordo é quando tem a TAG Transbordo".
--
-- ── TRAVA DUPLA (decisão explícita do gestor) ──────────────────────────────
-- O botão só age quando AS DUAS condições valem:
--   (a) a sprint que fechou tem FOTO SELADA; e
--   (b) hoje é DATA POSTERIOR ao fim da sprint.
-- (a) sozinha não basta como regra de negócio, e (b) sozinha não basta
-- tecnicamente: mover itens antes da selagem os faria SUMIR da foto, porque a
-- reconstrução seleciona por last/first_committed_sprint — valores ATUAIS,
-- reescritos pelo devops-sync-all a cada 10 minutos.
-- Nunca permitir transbordo no meio da sprint.
-- =============================================================================

-- ── 1. Lote de movimentação ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sprint_migration_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo              text NOT NULL CHECK (tipo IN ('classificacao', 'transbordo')),
  sprint_origem     text NOT NULL,
  sprint_destino    text,                       -- NULL em lote de classificação
  executed_by       uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  executed_at       timestamptz NOT NULL DEFAULT now(),
  -- Foto de que este lote dependeu: prova de que a trava foi respeitada
  snapshot_as_of    timestamptz,
  total_itens       integer NOT NULL DEFAULT 0,
  total_sucesso     integer NOT NULL DEFAULT 0,
  total_falha       integer NOT NULL DEFAULT 0,
  dry_run           boolean NOT NULL DEFAULT false,
  observacao        text
);

COMMENT ON TABLE public.sprint_migration_batches IS
  'Um lote por clique em Classificar ou Aplicar transbordo. snapshot_as_of registra '
  'a foto selada que autorizou a ação (auditoria da trava de segurança).';

CREATE INDEX IF NOT EXISTS idx_sprint_migration_batches_exec
  ON public.sprint_migration_batches (executed_at DESC);

-- ── 2. Item do lote ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sprint_migration_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                 uuid NOT NULL REFERENCES public.sprint_migration_batches(id) ON DELETE CASCADE,
  work_item_id             integer NOT NULL,
  work_item_type           text,
  work_item_title          text,
  -- Insumo da REVERSÃO: gravado ANTES do PATCH, nunca depois
  iteration_path_anterior  text,
  iteration_path_novo      text,
  tags_anterior            text,
  tag_transbordo_aplicada  boolean NOT NULL DEFAULT false,
  -- Tasks filhas acompanham o pai; guardadas p/ conferência e reversão
  is_child                 boolean NOT NULL DEFAULT false,
  parent_work_item_id      integer,
  child_task_count         integer,
  status                   text NOT NULL DEFAULT 'pendente'
                           CHECK (status IN ('pendente','sucesso','falha','revertido','simulado')),
  error_message            text,
  attempt_count            integer NOT NULL DEFAULT 0,
  reverted_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.sprint_migration_items.iteration_path_anterior IS
  'Sprint de origem do item, gravada ANTES do PATCH — é o único insumo da reversão. '
  'ATENÇÃO: reverter restaura o campo, mas as revisões do Azure DevOps são append-only, '
  'então os contadores derivados do histórico (sprint_migration_count/overflow_count) '
  'ficam incrementados nos dois sentidos. Não existe reversão da métrica.';

CREATE INDEX IF NOT EXISTS idx_sprint_migration_items_batch
  ON public.sprint_migration_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_sprint_migration_items_wi
  ON public.sprint_migration_items (work_item_id);

DROP TRIGGER IF EXISTS trg_sprint_migration_items_updated_at ON public.sprint_migration_items;
CREATE TRIGGER trg_sprint_migration_items_updated_at
  BEFORE UPDATE ON public.sprint_migration_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. RLS: leitura para aprovado; escrita só service_role/RPC ──────────────
ALTER TABLE public.sprint_migration_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprint_migration_items   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sprint_migration_batches_select ON public.sprint_migration_batches;
CREATE POLICY sprint_migration_batches_select ON public.sprint_migration_batches
  FOR SELECT TO authenticated USING (public.hub_is_approved());

DROP POLICY IF EXISTS sprint_migration_items_select ON public.sprint_migration_items;
CREATE POLICY sprint_migration_items_select ON public.sprint_migration_items
  FOR SELECT TO authenticated USING (public.hub_is_approved());

GRANT SELECT ON public.sprint_migration_batches TO authenticated;
GRANT SELECT ON public.sprint_migration_items   TO authenticated;

-- ── 4. Contexto/trava: o botão pode agir? ───────────────────────────────────
-- Fonte ÚNICA da decisão. O front usa para habilitar/desabilitar e explicar o
-- motivo; a edge chama de novo antes de escrever (nunca confiar no front).
CREATE OR REPLACE FUNCTION public.rpc_transbordo_contexto()
RETURNS TABLE (
  sprint_origem   text,
  sprint_fim      date,
  sprint_destino  text,
  foto_selada     boolean,
  foto_as_of      timestamptz,
  pode_migrar     boolean,
  motivo          text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_snap record;
BEGIN
  -- Sprint que fechou = a mais recente cujo fim oficial já passou.
  SELECT cands.sc, r.sprint_end INTO sprint_origem, sprint_fim
  FROM (
    SELECT DISTINCT coalesce(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
    FROM public.pbi_lifecycle_summary ls
    WHERE coalesce(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
  ) cands
  JOIN LATERAL public.fn_sprint_official_range(cands.sc) r ON true
  WHERE r.sprint_end < v_hoje
  ORDER BY r.sprint_end DESC
  LIMIT 1;

  IF sprint_origem IS NULL THEN
    foto_selada := false; pode_migrar := false;
    motivo := 'Nenhuma sprint encerrada encontrada.';
    RETURN NEXT; RETURN;
  END IF;

  -- Destino pela DATA (segunda seguinte), nunca por n+1 — que quebraria na
  -- virada de ano (S26-2026 → S1-2027).
  sprint_destino := public.fn_sprint_code_for_date(sprint_fim + 3);

  SELECT s.snapshot_source, s.as_of_datetime INTO v_snap
  FROM public.sprint_indicator_snapshots s
  WHERE s.sprint_code = sprint_origem
    AND s.snapshot_source IN ('fim_sprint_selado', 'manual')
  LIMIT 1;

  foto_selada := v_snap.snapshot_source IS NOT NULL;
  foto_as_of  := v_snap.as_of_datetime;

  -- Trava dupla
  IF v_hoje <= sprint_fim THEN
    pode_migrar := false;
    motivo := format('Sprint %s ainda não encerrou (fim %s). Transbordo no meio da sprint é bloqueado.',
                     sprint_origem, to_char(sprint_fim, 'DD/MM'));
  ELSIF NOT foto_selada THEN
    pode_migrar := false;
    motivo := format('A fotografia da %s ainda não foi selada (corte domingo 22:00, selagem na madrugada de segunda). '
                     'Mover itens antes disso os apagaria da foto.', sprint_origem);
  ELSE
    pode_migrar := true;
    motivo := format('Liberado: %s encerrada e fotografada. Destino: %s.', sprint_origem, sprint_destino);
  END IF;

  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.rpc_transbordo_contexto() IS
  'Trava do transbordo: exige foto selada da sprint que fechou E data posterior ao fim '
  'da sprint. Fonte única — o front usa para habilitar o botão, a edge revalida antes de escrever.';

GRANT EXECUTE ON FUNCTION public.rpc_transbordo_contexto() TO authenticated, service_role;

-- ── 5. Elegíveis: classificados × pendentes de classificação ────────────────
-- Elegibilidade por STATUS (New / Em desenvolvimento — grafias confirmadas no
-- acervo). A tag separa "pronto para migrar" de "precisa ser classificado".
CREATE OR REPLACE FUNCTION public.rpc_transbordo_elegiveis(p_sprint text)
RETURNS TABLE (
  work_item_id     integer,
  work_item_type   text,
  title            text,
  state            text,
  tags             text,
  tem_tag          boolean,
  iteration_path   text,
  web_url          text,
  tasks_filhas     integer,
  migracoes        integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT
    w.id,
    w.work_item_type,
    w.title,
    w.state,
    coalesce(w.tags, ''),
    public.fn_tem_tag_transbordo(w.tags),
    w.iteration_path,
    w.web_url,
    (SELECT count(*)::int FROM public.devops_work_items c WHERE c.parent_id = w.id),
    coalesce(ls.sprint_migration_count, 0)
  FROM public.pbi_lifecycle_summary ls
  JOIN public.devops_work_items w ON w.id = ls.work_item_id
  WHERE (ls.last_committed_sprint = p_sprint OR ls.first_committed_sprint = p_sprint)
    AND lower(trim(coalesce(w.state, ''))) IN ('new', 'em desenvolvimento')
  ORDER BY public.fn_tem_tag_transbordo(w.tags) DESC, w.work_item_type, w.id;
$fn$;

COMMENT ON FUNCTION public.rpc_transbordo_elegiveis(text) IS
  'PBI/Bugs passíveis de transbordo na sprint: status New ou Em desenvolvimento. '
  'tem_tag=true → pronto para migrar; false → pendente de classificação.';

GRANT EXECUTE ON FUNCTION public.rpc_transbordo_elegiveis(text) TO authenticated, service_role;

-- ── 6. Histórico para a aba de Logs ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_transbordo_historico(p_days int DEFAULT 90)
RETURNS TABLE (
  batch_id        uuid,
  tipo            text,
  sprint_origem   text,
  sprint_destino  text,
  executed_at     timestamptz,
  executed_by     uuid,
  executor        text,
  total_itens     integer,
  total_sucesso   integer,
  total_falha     integer,
  dry_run         boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT b.id, b.tipo, b.sprint_origem, b.sprint_destino, b.executed_at, b.executed_by,
         p.full_name, b.total_itens, b.total_sucesso, b.total_falha, b.dry_run
  FROM public.sprint_migration_batches b
  LEFT JOIN public.profiles p ON p.user_id = b.executed_by
  WHERE b.executed_at >= now() - make_interval(days => greatest(p_days, 0))
  ORDER BY b.executed_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.rpc_transbordo_historico(int) TO authenticated, service_role;
