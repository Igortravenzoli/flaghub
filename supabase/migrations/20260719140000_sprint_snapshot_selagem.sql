-- ============================================================================
-- Selagem da fotografia de fim de sprint — "o passado não muda"
--
-- Decisão do gestor (19/07/2026):
--   • Regra: a foto de cada sprint é o estado às SEXTA 23:59 BRT, sem
--     tolerância. Construída na primeira madrugada após o fim e SELADA na
--     mesma passada — daí em diante é imutável (o cron pula).
--   • Mudança de status/tag/hierarquia após a virada NÃO reflete na história.
--   • Mudanças futuras de regra de cálculo NÃO reprocessam sprints seladas;
--     reprocesso só por decisão explícita (des-selar → reconstruir → re-selar).
--   • Exceções esporádicas (ex.: S14-2026 com corte sábado 18/07 23:59) usam
--     snapshot_source='manual': mesma imutabilidade, corte alternativo.
--
-- Mecânica (sem tabela/coluna nova — reusa snapshot_source):
--   'fim_sprint_reconstruido' → foto ainda não selada (reprocessável)
--   'fim_sprint_selado'       → selada pelo fluxo padrão (corte sexta 23:59)
--   'manual'                  → selada com corte de exceção aprovado
--
-- Para des-selar conscientemente (runbook):
--   update sprint_indicator_snapshots set snapshot_source='fim_sprint_reconstruido'
--    where sprint_code='Sxx-2026';
--   -- a próxima madrugada reconstrói (corte sexta 23:59) e re-sela.
-- ============================================================================

-- Aceitar o novo estado 'fim_sprint_selado' na procedência do snapshot
alter table public.sprint_indicator_snapshots
  drop constraint if exists sis_snapshot_source_chk;
alter table public.sprint_indicator_snapshots
  add constraint sis_snapshot_source_chk check (
    snapshot_source = any (array['estado_atual', 'fim_sprint_reconstruido', 'fim_sprint_selado', 'manual'])
  );

CREATE OR REPLACE FUNCTION public.rpc_backfill_reconstruct_closed_sprints(
  p_year int DEFAULT EXTRACT(YEAR FROM NOW())::int
)
RETURNS TABLE(sprint_code text, status text, qa_done bigint, qa_concluidos bigint, itens_aprox bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_sprint text;
  v_end date;
  v_res record;
BEGIN
  IF NOT (public.hub_is_admin() OR session_user IN ('postgres','supabase_admin')) THEN
    RAISE EXCEPTION 'permission denied: admin required';
  END IF;

  FOR v_sprint IN
    SELECT DISTINCT COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) AS sc
    FROM public.pbi_lifecycle_summary ls
    WHERE COALESCE(ls.last_committed_sprint, ls.first_committed_sprint) ~ '^S[0-9]+-[0-9]{4}$'
      AND split_part(COALESCE(ls.last_committed_sprint, ls.first_committed_sprint), '-', 2)::int = p_year
    ORDER BY 1
  LOOP
    SELECT r.sprint_end INTO v_end FROM public.fn_sprint_official_range(v_sprint) r LIMIT 1;
    IF v_end IS NULL THEN
      sprint_code := v_sprint; status := 'invalid_sprint_code'; qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
      RETURN NEXT; CONTINUE;
    END IF;
    IF v_end >= CURRENT_DATE THEN
      sprint_code := v_sprint; status := 'open_sprint_skipped'; qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    -- Passado imutável: foto selada (padrão ou manual) nunca é regravada.
    IF EXISTS (
      SELECT 1 FROM public.sprint_indicator_snapshots s
      WHERE s.sprint_code = v_sprint
        AND s.snapshot_source IN ('fim_sprint_selado', 'manual')
    ) THEN
      sprint_code := v_sprint; status := 'selado_preservado'; qa_done := NULL; qa_concluidos := NULL; itens_aprox := NULL;
      RETURN NEXT; CONTINUE;
    END IF;

    -- Primeira madrugada após o fim (ou foto ainda não selada): constrói a
    -- foto com o corte padrão (sexta 23:59 BRT) e SELA na mesma passada.
    SELECT * INTO v_res FROM public.rpc_reconstruct_sprint_snapshot(v_sprint, NULL) LIMIT 1;
    UPDATE public.sprint_indicator_snapshots s
       SET snapshot_source = 'fim_sprint_selado'
     WHERE s.sprint_code = v_sprint;

    sprint_code := v_sprint; status := 'reconstructed_sealed';
    qa_done := v_res.qa_done; qa_concluidos := v_res.qa_concluidos; itens_aprox := v_res.itens_aprox;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- ── Job 51: 00:00 → 00:30 BRT ────────────────────────────────────────────────
-- Os syncs do DevOps rodam a cada 10–15 min; às 00:00 em ponto a última janela
-- de sexta (23:50–23:59) pode ainda não ter espelhado. Como a selagem é
-- imediata e definitiva, meia hora de folga elimina o risco de selar sem a
-- cauda final — o corte continua sendo sexta 23:59.
DO $$ BEGIN
  PERFORM cron.alter_job(51, schedule => '30 3 * * *');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron.alter_job(51) falhou (%). Ajuste o agendamento manualmente.', SQLERRM;
END $$;
