-- =============================================================================
-- EG-2 — devops-sync-all para de reler tabela inteira para achar quase nada
--
-- ── O problema medido (20–21/09/2026, 24h, bytes crus de resposta) ──────────
-- A edge devops-sync-all roda a cada 10 min (cron `sync-devops-all`, 144
-- rodadas/dia) e, em toda rodada, baixava do PostgREST linhas que só servem
-- para ser comparadas e jogadas fora:
--
--   passo 2 · IterHistory   6 páginas de (id, changed_date,       ~107,5 MB/dia
--                           iteration_history_synced_at) — os 6.000 itens
--                           mais recentes, 747 kB por rodada — para achar
--                           candidatos. Em 112 das 144 rodadas: ZERO; nas
--                           outras 32, 93 ids somados.
--   passo 3 · ChildrenSync  (id, rev) das ~8,3 mil filhas Task/Bug, em lotes   ~30 MB/dia
--                           de 1000, para gravar 5 filhas no dia inteiro.
--   passo 3 · lista de pais 2 páginas de [{id}] dos 1.536 PBI/US/Feature.      ~3,5 MB/dia
--
-- Com o orçamento de egress do plano Free (~161 MB/dia), só o passo 2 já
-- comia dois terços da conta. Com as três funções, os mesmos passos caem para
-- ~1,3 MB/dia (quase tudo é a lista de pais, 8,7 kB por rodada).
--
-- ── A correção ─────────────────────────────────────────────────────────────
-- A comparação vai para dentro do banco e a edge recebe só o resultado, como
-- `integer[]`. Retorno ESCALAR de propósito: o PostgREST deste projeto roda com
-- `max_rows = 1000` e corta em silêncio função SETOF/TABLE — um array é um
-- valor só, não é cortado. É o mesmo teto que já pegou a edge duas vezes (ver
-- commit 1dc734d): a paginação que existia na edge era remendo dele.
--
-- As regras são as da edge, copiadas, não reinventadas. Onde o JavaScript tem
-- semântica que o SQL não tem de graça (precisão de milissegundo do Date,
-- `null < n`), o SQL espelha o JavaScript e o comentário diz por quê.
--
-- Nenhuma das três funções escreve. Não há SECURITY DEFINER: só a edge chama,
-- com service_role, que já lê `devops_work_items` direto.
-- =============================================================================


-- ── 1. Candidatos do histórico de iteração/estado (passo 2) ──────────────────
--
-- Espelha `processIterationHistory` + `shouldRefreshByChange` da edge como
-- estavam em 9f39c30:
--
--   janela    as `p_scan` linhas mais recentes de PBI/US/Bug/Task, na ordem
--             `changed_date DESC, id DESC`. É a ordem que o `.order()` da edge
--             mandava ao PostgREST, sem `nullsfirst/nullslast` — e DESC sem
--             cláusula é NULLS FIRST no Postgres. Está escrito aqui para
--             ninguém "arrumar" para NULLS LAST achando que é detalhe.
--   regra     nunca sincronizado (`iteration_history_synced_at` nulo) OU
--             `changed_date` posterior ao último sync. `changed_date` nulo com
--             sync feito NÃO é candidato (o `if (!changed) return false`).
--   teto      os `p_limit` primeiros candidatos NA ORDEM DA JANELA — o
--             `slice(0, N)` da edge. A ordem de retorno é a de processamento.
--
-- `date_trunc('milliseconds', ...)`: a edge comparava `Date` do JavaScript,
-- que TRUNCA o timestamptz em milissegundos ao parsear. Dois valores que só
-- diferem no microssegundo eram "iguais" lá, e continuam sendo aqui. Hoje
-- nenhum escritor grava sub-milissegundo (DevOps e `toISOString()`), então é
-- fidelidade barata, não correção de bug.
--
-- Fora da janela ficam hoje 3.865 itens nunca sincronizados (Task antiga,
-- sobretudo). Isso é comportamento existente e continua igual: esta função
-- troca o transporte, não o alcance.

CREATE OR REPLACE FUNCTION public.rpc_iter_history_candidates(
  p_limit integer DEFAULT 400,
  p_scan  integer DEFAULT 6000
)
RETURNS integer[]
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(array_agg(c.id ORDER BY c.changed_date DESC NULLS FIRST, c.id DESC), '{}')
  FROM (
    SELECT j.id, j.changed_date
    FROM (
      SELECT w.id, w.changed_date, w.iteration_history_synced_at
      FROM public.devops_work_items w
      WHERE w.work_item_type IN ('Product Backlog Item', 'User Story', 'Bug', 'Task')
      ORDER BY w.changed_date DESC NULLS FIRST, w.id DESC
      LIMIT p_scan
    ) j
    WHERE j.iteration_history_synced_at IS NULL
       OR date_trunc('milliseconds', j.changed_date)
          > date_trunc('milliseconds', j.iteration_history_synced_at)
    ORDER BY j.changed_date DESC NULLS FIRST, j.id DESC
    LIMIT p_limit
  ) c;
$fn$;

COMMENT ON FUNCTION public.rpc_iter_history_candidates(integer, integer) IS
  'Ids de PBI/US/Bug/Task cujo iteration_history/state_history está defasado, dentro da '
  'janela dos p_scan itens mais recentes (changed_date DESC NULLS FIRST, id DESC), na ordem '
  'de processamento e cortados em p_limit. Espelha shouldRefreshByChange da edge '
  'devops-sync-all (passo 2). Retorno escalar: não sofre o max_rows do PostgREST.';

REVOKE EXECUTE ON FUNCTION public.rpc_iter_history_candidates(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_iter_history_candidates(integer, integer) TO service_role;


-- ── 2. Filhas que precisam de upsert (passo 3) ───────────────────────────────
--
-- A edge busca as filhas no DevOps e manda (id, rev) de cada uma; volta só o
-- id de quem precisa ser gravado. Regra de `fetchChildrenOfItems`:
--
--     existingRev === undefined || existingRev < m.rev
--
--   sem linha no banco        → grava
--   rev do banco MENOR        → grava   (é `<`, não `!=`: rev do banco maior
--   rev igual ou banco maior  → pula     que a do DevOps não regride o banco)
--
-- `coalesce(w.rev, 0)`: no JavaScript `null < n` vale `0 < n`. A coluna é
-- NOT NULL DEFAULT 0 hoje, então o coalesce só segura a regra se isso mudar.
-- Rev do DevOps nula nunca é stale, salvo item novo — como `x < undefined`,
-- que é sempre falso.
--
-- A ordem de retorno é a de entrada (a edge filtra o próprio array, então a
-- ordem aqui é cortesia). `coalesce(..., '{}')`: array_agg de zero linhas é
-- NULL, e a edge espera array.

CREATE OR REPLACE FUNCTION public.rpc_devops_stale_ids(
  p_ids  integer[],
  p_revs integer[]
)
RETURNS integer[]
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(array_agg(p.id ORDER BY p.ord), '{}')
  FROM unnest(p_ids, p_revs) WITH ORDINALITY AS p(id, rev, ord)
  LEFT JOIN public.devops_work_items w ON w.id = p.id
  WHERE p.id IS NOT NULL
    AND (w.id IS NULL OR coalesce(w.rev, 0) < p.rev);
$fn$;

COMMENT ON FUNCTION public.rpc_devops_stale_ids(integer[], integer[]) IS
  'Dos pares (id, rev) vindos do DevOps, devolve os ids sem linha em devops_work_items ou '
  'com rev gravada MENOR. Usada pelo passo 3 (filhas Task/Bug) da edge devops-sync-all.';

REVOKE EXECUTE ON FUNCTION public.rpc_devops_stale_ids(integer[], integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_devops_stale_ids(integer[], integer[]) TO service_role;


-- ── 3. Pais cujas filhas o passo 3 varre ─────────────────────────────────────
--
-- PBI/US/Feature, id DESC (mais novos primeiro), cortados em `p_max`. O teto
-- era o `PBIS_MAX = 4000` da edge; fica como parâmetro para a edge continuar
-- dona do número e do aviso "teto atingido". Hoje são ~1.536.

CREATE OR REPLACE FUNCTION public.rpc_devops_parent_ids(p_max integer DEFAULT 4000)
RETURNS integer[]
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT coalesce(array_agg(s.id ORDER BY s.id DESC), '{}')
  FROM (
    SELECT w.id
    FROM public.devops_work_items w
    WHERE w.work_item_type IN ('Product Backlog Item', 'User Story', 'Feature')
    ORDER BY w.id DESC
    LIMIT p_max
  ) s;
$fn$;

COMMENT ON FUNCTION public.rpc_devops_parent_ids(integer) IS
  'Ids de PBI/US/Feature em id DESC, até p_max: os pais cujas filhas Task/Bug o passo 3 da '
  'edge devops-sync-all sincroniza. Retorno escalar: não sofre o max_rows do PostgREST.';

REVOKE EXECUTE ON FUNCTION public.rpc_devops_parent_ids(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_devops_parent_ids(integer) TO service_role;
