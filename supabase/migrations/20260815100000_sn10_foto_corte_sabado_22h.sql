-- ============================================================================
-- SN-10 — O corte da fotografia volta para 22:00, mas continua no SÁBADO
--
-- Decisão do gestor (15/08/2026), 11 dias depois da SN-9 e ANTES da primeira
-- foto tirada sob ela (a S16 seria selada hoje 13:20; esta migration precisa
-- entrar antes disso — ver bloco de auditoria no fim).
--
--   corte:   sexta 23:59 → sábado 23:59 → domingo 22:00 → sábado 13:00 → SÁBADO 22:00
--   selagem: sábado 00:30 → domingo 00:30 → segunda 00:30 → sábado 13:20 → SÁBADO 22:30
--
-- É a hora da SN-5 com o dia da SN-9. O que se ganha em relação às 13:00: mais
-- 9 horas de espelhamento antes de a foto congelar — a manhã E a tarde de sábado
-- para o time acertar status. O que se perde: o transbordo destrava à noite, não
-- mais no meio da tarde de sábado. O gestor optou pela precisão da foto.
--
-- ── Só muda a HORA. Não muda o dia, nem o dono, nem o universo ──────────────
-- A SN-9 foi cara porque moveu o DIA da selagem (guard por data → por instante),
-- trocou o dono do ponto de fechamento da série diária e mexeu na trava do
-- transbordo. Nada disso volta atrás:
--   · o guard continua comparando INSTANTES (`now() < fn_corte_foto_sprint`) —
--     e agora é ainda mais necessário, porque a selagem cai em UTC do dia
--     seguinte ao corte em BRT;
--   · o ponto de fechamento da série segue escrito pelo driver da selagem, com
--     rótulo `sprint_end + 1` — que continua sendo o SÁBADO do corte. Nada a
--     ajustar: mudou a hora, não o dia;
--   · a trava do transbordo é a mesma; muda só o horário citado na mensagem.
-- Por isso esta migration é curta: `fn_corte_foto_sprint` é a fonte única do
-- instante (essa foi a razão de ela existir), então o corte muda em um lugar só.
--
-- ── A ARMADILHA DESTA MUDANÇA: o cron inverte o dia da semana ───────────────
-- 22:30 BRT = 01:30 UTC do DIA SEGUINTE. O job sai de `20 16 * * 6` (sáb 13:20
-- BRT) para `30 1 * * 0` — DOW 0, DOMINGO em UTC, para rodar no SÁBADO à noite
-- em BRT. Manter DOW 6 agendaria a selagem para as 22:30 BRT de SEXTA (antes do
-- corte, o guard pularia) e a foto só sairia na rede de segurança das 00:30.
-- O Brasil não tem mais horário de verão, então o -3 é fixo e essa conversão
-- não volta a mudar sozinha.
--
-- Fotos já seladas NÃO são reprocessadas. A série fica: ≤S13 corte sexta ·
-- S14 sábado 23:59 (manual) · S15 domingo 22:00 · S16 em diante SÁBADO 22:00.
-- A SN-9 (sábado 13:00) não chegou a selar nenhuma sprint — vigorou 11 dias,
-- todos dentro da S16, e é substituída antes da primeira aplicação real.
--
-- Não muda: universo da foto (quadro por iteration_path, SN-7), definição de
-- entregue (SN-7), transbordo por tag (SN-5/SN-6) e o corte de HORAS/alocação do
-- timelog, que segue na sexta.
-- ============================================================================

-- ── Fonte única do instante do corte: 13h → 22h ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corte_foto_sprint(p_sprint_end date)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ((p_sprint_end + 1)::timestamp + interval '22 hours')
         AT TIME ZONE 'America/Sao_Paulo';
$$;

COMMENT ON FUNCTION public.fn_corte_foto_sprint(date) IS
  'Instante do corte da fotografia de uma sprint: SÁBADO 22:00 BRT '
  '(sprint_end + 1, a sprint encerra na sexta). Regra SN-10, 15/08/2026 — antes '
  'sábado 13:00 (SN-9), domingo 22:00 (SN-5), sábado 23:59 e sexta 23:59. Fonte '
  'única: reconstrução, guard da selagem e trava do transbordo leem daqui.';

-- ── Corpos inalterados; só os COMMENTs citam o horário novo ─────────────────
-- rpc_reconstruct_sprint_snapshot e rpc_backfill_reconstruct_closed_sprints
-- leem fn_corte_foto_sprint e não precisam ser redefinidas.
COMMENT ON FUNCTION public.rpc_reconstruct_sprint_snapshot(text, timestamptz) IS
  'Reconstrói a foto de fim de sprint sobre O QUADRO (iteration_path no corte, '
  'PBI + User Story + Bug). Corte padrão: SÁBADO 22:00 BRT '
  '(fn_corte_foto_sprint; regra SN-10, 15/08/2026 — antes sábado 13:00). '
  'Entregue = aguardando teste/em teste/aguardando deploy/deploy/homologação. '
  'p_as_of permite corte alternativo (exceção manual e refação de foto antiga, '
  'que DEVE usar o corte da época).';

COMMENT ON FUNCTION public.rpc_backfill_reconstruct_closed_sprints(int) IS
  'Driver da selagem. Varre as sprints do QUADRO (iteration_path) do ano '
  'informado e sela na primeira passada em que o corte (sábado 22:00 BRT) já '
  'passou — na prática, o job das 22:30 do sábado. Grava também o ponto de '
  'FECHAMENTO da série diária (rótulo sprint_end + 1), na mesma passada e antes '
  'de o transbordo destravar. Fotos seladas/manuais nunca são regravadas; erro '
  'numa sprint não interrompe as demais. Regra SN-10, 15/08/2026.';

-- ── Trava do transbordo: mesma regra, horários novos na mensagem ────────────
-- Assinatura idêntica à da SN-9 → CREATE OR REPLACE basta, sem DROP.
CREATE OR REPLACE FUNCTION public.rpc_transbordo_contexto()
RETURNS TABLE (
  sprint_origem   text,
  sprint_fim      date,
  sprint_destino  text,
  foto_selada     boolean,
  foto_as_of      timestamptz,
  corte_previsto  timestamptz,
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
  corte_previsto := public.fn_corte_foto_sprint(sprint_fim);

  SELECT s.snapshot_source, s.as_of_datetime INTO v_snap
  FROM public.sprint_indicator_snapshots s
  WHERE s.sprint_code = sprint_origem
    AND s.snapshot_source IN ('fim_sprint_selado', 'manual')
  LIMIT 1;

  foto_selada := v_snap.snapshot_source IS NOT NULL;
  foto_as_of  := v_snap.as_of_datetime;

  -- Trava dupla (decisão do gestor, 25/07/2026 — reafirmada em 04/08 e 15/08):
  -- (a) foto da sprint que fechou já TIRADA; (b) data posterior ao fim dela.
  -- (b) sozinha não basta tecnicamente — mover itens antes da selagem os faria
  -- sumir da foto, porque o universo sai do iteration_path atual. A mensagem
  -- distingue "a foto ainda não é hora" de "a foto atrasou".
  IF v_hoje <= sprint_fim THEN
    pode_migrar := false;
    motivo := format('Sprint %s ainda não encerrou (fim %s). Transbordo no meio da sprint é bloqueado.',
                     sprint_origem, to_char(sprint_fim, 'DD/MM'));
  ELSIF NOT foto_selada AND now() < corte_previsto THEN
    pode_migrar := false;
    motivo := format('A foto da %s ainda não foi tirada — o corte é %s (sábado 22:00). '
                     'O transbordo libera logo depois da selagem, ~30 min após o corte.',
                     sprint_origem,
                     to_char(corte_previsto AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'));
  ELSIF NOT foto_selada THEN
    pode_migrar := false;
    motivo := format('O corte da %s (%s) já passou, mas a foto ainda não foi selada. '
                     'Mover itens antes disso os apagaria da foto — acionar o suporte se persistir.',
                     sprint_origem,
                     to_char(corte_previsto AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'));
  ELSE
    pode_migrar := true;
    motivo := format('Liberado: %s encerrada e fotografada. Destino: %s.', sprint_origem, sprint_destino);
  END IF;

  RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION public.rpc_transbordo_contexto() IS
  'Trava do transbordo: exige foto TIRADA (selada) da sprint que fechou E data '
  'posterior ao fim da sprint. Devolve corte_previsto (sábado 22:00 BRT, SN-10) '
  'para a mensagem dizer quando libera. Fonte única — o front usa para habilitar '
  'o botão, a edge revalida antes de escrever.';

GRANT EXECUTE ON FUNCTION public.rpc_transbordo_contexto() TO authenticated, service_role;

-- ── Cron: sábado 22:30 BRT = DOMINGO 01:30 UTC (DOW 0, não 6) ───────────────
-- O jobname continua "...-saturday": ele descreve o SÁBADO DA FOTO em BRT, que
-- é o que o operador procura. O DOW 0 do cron é só a tradução para UTC. Não
-- renomear — a doc e as migrations anteriores localizam por este nome.
DO $$
DECLARE
  v_jobid bigint;
  v_schedule text;
BEGIN
  SELECT jobid, schedule INTO v_jobid, v_schedule
  FROM cron.job WHERE jobname = 'snapshot-sprint-end-saturday' LIMIT 1;

  IF v_jobid IS NULL THEN
    PERFORM cron.schedule(
      'snapshot-sprint-end-saturday',
      '30 1 * * 0',
      'SELECT public.rpc_backfill_reconstruct_closed_sprints();'
    );
    RAISE NOTICE 'Job "snapshot-sprint-end-saturday" agendado (01:30 UTC dom = sáb 22:30 BRT).';
  ELSIF v_schedule IS DISTINCT FROM '30 1 * * 0' THEN
    PERFORM cron.alter_job(v_jobid, schedule => '30 1 * * 0');
    RAISE NOTICE 'Job "snapshot-sprint-end-saturday" (id %) reagendado de % para 30 1 * * 0 (sáb 22:30 BRT).',
      v_jobid, v_schedule;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Reagendamento do job de sábado falhou (%). Ajustar manualmente — ver docs/SETUP_CRON_JOBS.md.', SQLERRM;
END $$;

-- A rede de segurança diária (00:30 BRT / 03:30 UTC) fica ainda mais próxima do
-- corte: se a selagem das 22:30 falhar, a foto sai 2h depois, não no dia
-- seguinte. Só confere existência — não é gerenciada por migration.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'snapshot-sprint-end-daily' LIMIT 1;
  IF v_jobid IS NULL THEN
    RAISE NOTICE 'Job "snapshot-sprint-end-daily" não encontrado — agendar manualmente (rede de segurança).';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Verificação do cron diário falhou (%).', SQLERRM;
END $$;

-- ── Auditoria: esta migration chegou a tempo? (somente leitura) ─────────────
-- O caso que importa é a S16, que seria selada às 13:20 de hoje com o corte das
-- 13:00. Se já estiver selada, o corte novo NÃO se aplica a ela sozinho — foto
-- selada nunca é regravada — e a correção é o runbook de des-selagem em
-- docs/FOTOGRAFIA_SPRINT_SELAGEM.md.
DO $$
DECLARE
  v_rec record;
  v_count int := 0;
BEGIN
  FOR v_rec IN
    SELECT s.sprint_code, s.snapshot_source, s.as_of_datetime
    FROM public.sprint_indicator_snapshots s
    JOIN LATERAL public.fn_sprint_official_range(s.sprint_code) r ON true
    WHERE s.snapshot_source = 'fim_sprint_selado'
      AND s.as_of_datetime = ((r.sprint_end + 1)::timestamp + interval '13 hours')
                             AT TIME ZONE 'America/Sao_Paulo'
    ORDER BY r.sprint_end
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE 'ATENÇÃO: % foi selada com o corte SN-9 (% = sáb 13:00) antes desta migration. '
                 'Para refazer às 22:00: des-selar (snapshot_source = fim_sprint_reconstruido), '
                 'apagar o ponto de fechamento da série (sprint_daily_progress, captured_date = sprint_end + 1) '
                 'e deixar o job das 22:30 rodar.', v_rec.sprint_code, v_rec.as_of_datetime;
  END LOOP;
  IF v_count = 0 THEN
    RAISE NOTICE 'OK: nenhuma sprint foi selada com o corte das 13:00. A SN-10 pegou a S16 a tempo.';
  END IF;
END $$;
