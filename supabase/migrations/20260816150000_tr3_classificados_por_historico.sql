-- =============================================================================
-- TR-3 — Transbordo: "já classificado" deixa de depender do resumo derivado
--
-- Complemento obrigatório do 20260816120000 (TR-2). Sem esta migration, a
-- correção do recálculo (LC-1/LC-2) APAGA da tela os itens já transbordados.
--
-- ── O que se descobriu ao aplicar o TR-2 (16/08/2026) ───────────────────────
-- O TR-2 tirou o balde PENDENTE da dependência do resumo, mas deixou o balde
-- CLASSIFICADO em `first/last_committed_sprint`. Esses dois campos são
-- inicializados a partir da iteração ATUAL do item (devops-sync-all, passo 4:
-- `if (hasLead && currentSprintCode) first = last = currentSprintCode`). Ou
-- seja: assim que o item é movido para S17, o resumo recalculado passa a dizer
-- "S17" e ele some do quadro da S16.
--
-- Hoje isso não aparece só porque os resumos estão congelados — os 20 itens do
-- lote das 16:09 continuam visíveis por causa do MESMO atraso que escondia a
-- 15485. Destravar o recálculo (LC-1/LC-2) sem esta migration transformaria a
-- lista de "20 classificados" em zero.
--
-- ── A fonte que não se move ────────────────────────────────────────────────
-- `iteration_history` registra a SAÍDA (`oldValue` = a sprint) com data. Ela é
-- sincronizada pelo passo 2 e cobre tanto o que o botão moveu quanto o que foi
-- movido à mão no DevOps — que foi o caso dos 13 itens tratados manualmente
-- nesta virada S16→S17, invisíveis para `sprint_migration_items`.
--
-- Corte por `sprint_end`: só conta como transbordo a saída ocorrida a partir do
-- fim oficial da sprint. Item movido no MEIO da sprint é despriorização, não
-- transbordo — sem esse corte a S16 acumulava mais 6 itens antigos.
--
-- `sprint_migration_items` entra como segunda via: o lote grava na hora, e o
-- histórico do DevOps só chega no próximo passo 2 (janela de alguns minutos em
-- que o item ficaria fora dos dois baldes).
--
-- Medido em S16-2026 no dia da virada: 5 pendentes (os que de fato ficaram) e
-- 33 classificados (20 do lote + 13 movidos à mão).
--
-- ── Coluna nova: ja_migrado ────────────────────────────────────────────────
-- Como o balde (b) passa a trazer item que JÁ SAIU, quem consome precisa
-- separar "vai mover" de "já foi" — senão o passo 2 tenta mover de novo quem
-- está em S17 e a edge grava lote de migração vazio de sentido. A coluna é a
-- resposta direta: o item ainda está na sprint ou não.
-- Consumidores: `devops-transbordo` (migrate só age em ja_migrado = false) e
-- `TransbordoAcoesTab` (badge "serão movidos" × "já movidos").
-- A assinatura muda → DROP antes do CREATE (RETURNS TABLE não aceita REPLACE
-- com colunas diferentes).
-- =============================================================================

DROP FUNCTION IF EXISTS public.rpc_transbordo_elegiveis(text);

CREATE FUNCTION public.rpc_transbordo_elegiveis(p_sprint text)
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
  migracoes        integer,
  ja_migrado       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT w.id, w.work_item_type, w.title, w.state, coalesce(w.tags, ''),
         public.fn_tem_tag_transbordo(w.tags), w.iteration_path, w.web_url,
         (SELECT count(*)::int FROM public.devops_work_items c WHERE c.parent_id = w.id),
         coalesce(ls.sprint_migration_count, 0),
         NOT (w.iteration_path ~ ('(^|\\)' || p_sprint || '$'))   -- ja_migrado
  FROM public.devops_work_items w
  LEFT JOIN public.pbi_lifecycle_summary ls ON ls.work_item_id = w.id
  CROSS JOIN LATERAL public.fn_sprint_official_range(p_sprint) r
  WHERE w.work_item_type IN ('Product Backlog Item', 'User Story', 'Bug')
    AND (
      -- (a) PENDENTE ou classificado que ainda não saiu: está na sprint agora.
      --     Verdade do DevOps, sem intermediário derivado.
      ( w.iteration_path ~ ('(^|\\)' || p_sprint || '$')
        AND lower(trim(coalesce(w.state, ''))) IN ('new', 'em desenvolvimento') )

      -- (b) JÁ TRANSBORDADO: tem a tag e saiu da sprint depois do fim dela.
      --     Sem filtro de state — é registro do que transbordou, e o item pode
      --     ter avançado (Em Teste, Resolvido) depois de migrar.
      OR ( public.fn_tem_tag_transbordo(w.tags)
           AND EXISTS (
             SELECT 1
             FROM jsonb_array_elements(coalesce(w.iteration_history, '[]'::jsonb)) h
             WHERE h->>'oldValue' ~ ('(^|\\)' || p_sprint || '$')
               AND (h->>'revisedDate')::timestamptz >= r.sprint_end
           ) )

      -- (c) Segunda via do (b) enquanto o histórico do DevOps não sincroniza:
      --     o próprio lote do botão. Só pais — as tasks filhas acompanham.
      OR EXISTS (
           SELECT 1
           FROM public.sprint_migration_items mi
           JOIN public.sprint_migration_batches b ON b.id = mi.batch_id
           WHERE mi.work_item_id = w.id
             AND b.tipo = 'transbordo'
             AND b.sprint_origem = p_sprint
             AND NOT b.dry_run
             AND mi.status = 'sucesso'
             AND NOT mi.is_child
         )
    )
  ORDER BY public.fn_tem_tag_transbordo(w.tags) DESC, w.work_item_type, w.id;
$fn$;

COMMENT ON FUNCTION public.rpc_transbordo_elegiveis(text) IS
  'Itens da sprint para a tela de transbordo. Pendente = está na sprint pelo iteration_path '
  'ATUAL (New/Em desenvolvimento). Classificado = tem tag TRANSBORDO e saiu da sprint depois '
  'do fim dela (iteration_history), ou consta num lote de transbordo da sprint. '
  'ja_migrado = já não está mais na sprint: quem consome NUNCA deve movê-lo de novo. '
  'NÃO depende de pbi_lifecycle_summary para decidir quem aparece — o resumo atrasa e '
  'escondia itens (auditoria S16→S17 de 16/08/2026); ele só alimenta a coluna Migrações.';

-- A tela de transbordo vive em área autenticada (LogsTab → aba Transbordo), mas
-- o default privilege do Supabase concede EXECUTE a `anon` em toda função nova
-- de public — ou seja, a lista respondia com a anon key do bundle. O DROP/CREATE
-- é a oportunidade de fechar. Revogar de PUBLIC não resolve: o grant é explícito.
REVOKE EXECUTE ON FUNCTION public.rpc_transbordo_elegiveis(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_transbordo_elegiveis(text) TO authenticated, service_role;
