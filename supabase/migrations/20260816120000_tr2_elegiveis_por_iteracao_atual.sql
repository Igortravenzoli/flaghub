-- =============================================================================
-- TR-2 — Transbordo: elegibilidade pela ITERAÇÃO ATUAL, não pelo resumo derivado
--
-- Rodado à mão em PROD em 16/08/2026; esta migration só versiona o que já está
-- no banco (CREATE OR REPLACE, idempotente).
--
-- ── O bug (auditoria S16→S17, 16/08/2026) ──────────────────────────────────
-- A versão original (20260726140000) filtrava por
-- `pbi_lifecycle_summary.first/last_committed_sprint`. Esse resumo é DERIVADO e
-- recalculado pela edge `devops-sync-all` (passo 4) — quando ele atrasa, a lista
-- de transbordo mente nos dois sentidos. Medido em S16-2026:
--
--   • US 15485 movida de S14 para S16 em 13/08; resumo congelado em 15/07 ainda
--     dizia "S14-2026" → o item NUNCA apareceu para ser classificado.
--   • 12075 despriorizada para S17 em 06/08; resumo de 01/08 ainda dizia "S16"
--     → aparecia como pendente de uma sprint em que não estava mais.
--   • 17148 e 17322 sequer tinham linha no resumo → invisíveis.
--   Total: 11 itens faltando e 1 sobrando numa lista de 20.
--
-- ── A regra nova ───────────────────────────────────────────────────────────
-- PENDENTE de classificação  = está FISICAMENTE na sprint agora (iteration_path).
--                              Verdade do Azure DevOps, sem intermediário.
-- JÁ CLASSIFICADO            = tem a tag TRANSBORDO E o resumo o atribui à
--                              sprint — é o que mantém visível o item que já
--                              migrou para a sprint seguinte (senão ele sumiria
--                              da tela no instante em que o botão o move).
--
-- O resumo continua sendo lido, mas só para o balde de quem já tem tag: um
-- resumo defasado não consegue mais esconder item pendente.
-- `migracoes` segue vindo do resumo (informativo na coluna Migrações); quando
-- defasado mostra menos migrações do que o real, nunca oculta a linha.
-- =============================================================================

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
  SELECT w.id, w.work_item_type, w.title, w.state, coalesce(w.tags, ''),
         public.fn_tem_tag_transbordo(w.tags), w.iteration_path, w.web_url,
         (SELECT count(*)::int FROM public.devops_work_items c WHERE c.parent_id = w.id),
         coalesce(ls.sprint_migration_count, 0)
  FROM public.devops_work_items w
  LEFT JOIN public.pbi_lifecycle_summary ls ON ls.work_item_id = w.id
  WHERE w.work_item_type IN ('Product Backlog Item', 'User Story', 'Bug')
    AND lower(trim(coalesce(w.state, ''))) IN ('new', 'em desenvolvimento')
    AND ( w.iteration_path ~ ('(^|\\)' || p_sprint || '$')
          OR ( public.fn_tem_tag_transbordo(w.tags)
               AND (ls.last_committed_sprint = p_sprint OR ls.first_committed_sprint = p_sprint) ) )
  ORDER BY public.fn_tem_tag_transbordo(w.tags) DESC, w.work_item_type, w.id;
$fn$;

COMMENT ON FUNCTION public.rpc_transbordo_elegiveis(text) IS
  'PBI/US/Bugs passíveis de transbordo: status New ou Em desenvolvimento. Pendente = '
  'está na sprint pelo iteration_path ATUAL (não depende de pbi_lifecycle_summary, que '
  'atrasa). Classificado = tem tag TRANSBORDO e o resumo o atribui à sprint (mantém '
  'visível quem já migrou). tem_tag=true → pronto para migrar; false → pendente.';

GRANT EXECUTE ON FUNCTION public.rpc_transbordo_elegiveis(text) TO authenticated, service_role;
