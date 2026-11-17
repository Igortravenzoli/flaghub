# Plano de endurecimento do Supabase (revisão "dev curioso", 16/11/2026)

Base: o inventário da etapa 1 (`revisao-seguranca-etapa1.md`, na pasta de notas). Nada deste plano foi
aplicado. Cada fase de banco é uma migration + um `supabase/verificacao/secN_*.sql` no padrão dos `tm*.sql`
(um DO que mede, aplica por dentro, mede de novo e termina em RAISE), ensaiado em produção — nada fica
gravado — e só então aplicado pela Management API com o ok do Igor, registrado em
`supabase_migrations.schema_migrations`. O front nunca depende de migration não aplicada: as fases de banco
não exigem mudança de tela, e as de front funcionam com ou sem elas.

## O que as sondas só leitura mostraram (16/11, contagens, nenhuma linha baixada)

Transação `READ ONLY` + `SET LOCAL ROLE` + `request.jwt.claims` — o mesmo que o PostgREST faz com o JWT:

| perfil | relações que pode ler | com linhas |
|---|---|---|
| anon (só a chave pública) | 97 | **4 views**: `v_timelog_unified` ≥1001, `vw_infraestrutura_kpis` ≥1001, `v_horas_negocio` ≥1001, `v_colaborador_ausencias` 27 |
| pendente (login sem área) | 109 | as **mesmas 4 views** + `hub_areas` (7, nomes das áreas — a tela de pedir acesso precisa) |
| só Timer | = pendente + as próprias linhas `timer_*` (não há nenhum usuário só-Timer em produção hoje; os 2 ativos também são membros) |
| monitor (telão) | 109 | lê todas as tabelas de base das 4 views → a correção da SEC1 não deve tirar nada do telão (a SEC1 prova isso) |

`v_horas_negocio` já é invoker, mas lê a `v_timelog_unified`: corrigir esta fecha as duas.

Outros números: 90 tabelas no public, **todas com RLS** (6 com FORCE); 79 com INSERT/UPDATE/DELETE
concedido à anon (o RLS segura, mas é uma camada só); default privileges dão `ALL` à anon em todo objeto novo;
14 funções executáveis pela anon (3 definer: as de IP); 116 definer executáveis por qualquer login.

## Fases (ordem = maior risco fechado por menor chance de quebrar)

### SEC1 — views sem "dono" e sem anon (banco) · APLICADA em 16/11 23:51 (BRT), conferida
- **O quê:** `security_invoker = true` em `v_timelog_unified`, `v_colaborador_ausencias`,
  `vw_infraestrutura_kpis`; `REVOKE ALL ... FROM anon` em todas as views do public.
  Arquivos: `migrations/20261117090000_sec1_views_sem_definer.sql`, `verificacao/sec1_views.sql`
  (ensaio da DDL), `verificacao/sec1_views_conferencia.sql` (pós), `scripts/sec1-compara-invoker.mjs`.
- **Prova (feita):** os 23 usuários aprovados, o monitor entre eles, leem exatamente as mesmas linhas
  (8826/8806 na `v_timelog_unified`, 27, 1640, 8826/8806); o pendente passa de 1621/27/1535/1621 para 0
  nas quatro; o tempo fica igual (~1,2–1,5 s na `v_timelog_unified`, contra ~1,8 s hoje). Ensaio da DDL:
  `SEC1 OK` em ~2 s, nada gravado.
- **Lição do 1º ensaio:** contar linhas DEPOIS do `ALTER VIEW` na mesma transação segura a trava
  exclusiva por minutos (o 1º ensaio passou de 100 s e caiu no limite do Cloudflare; desfeito, conferido).
  Daí a separação: comparação só leitura sem DDL, e ensaio da DDL só com catálogo e `lock_timeout` 3 s.
  Vale para as próximas fases.
- **Aplicada (16/11 23:51 BRT, ok do Igor):** `SEC1 CONFERIDA` (monitor 8826/27/1640/8826, pendente 0, anon sem
  views, todas invoker, registrada). Pela API com a anon key: 401 nas quatro. Sonda só leitura: a anon
  lê 0 linhas em tudo; o pendente só vê `hub_areas` (7).
- **Risco:** baixo. Se um usuário perder linha, o ensaio falha e diz quem e onde (sinal de que a policy da
  base estava mais fechada que a tela supunha) — aí não se aplica.
- **Volta:** `verificacao/sec1_views_volta.sql` (RESET da opção; o GRANT à anon fica comentado).

### SEC2 — edges que apagam ou repassam (código + deploy de edge) · PUBLICADA em 17/11 00:22 (BRT), conferida
Código no ramo (f4b4f7e, 856dd81, 15f5b64); deploy por `scripts/sec2-edges-prod.mjs` (pre | aplicar | conferir | volta).
- **Publicada (ok do Igor):** survey-import v40, vdesk-tickets-os v57, webhook-test v40 (as três com a marca SEC2, sobem
  sem erro: OPTIONS 200 com a origem do FlagHub); vdesk-proxy e vdesk-ticket-os removidas (404); anon 401 nas três; o
  pacote da webhook-test tem a lista de hosts e o da vdesk-tickets-os não tem mais o endereço HTTP.
- **Rodada com JWT de admin (17/11 00:31, sessão do Igor no navegador do app, sem gravar nada):** vdesk status 200; lote
  de 501 → 413; pageSize 500 → 400; ticket inválido → 400; webhook tipo inválido → 400; webhook para 169.254.169.254 →
  400 "Blocked webhook host"; survey-import sem linhas → 400 (pelos logs: a resposta de erro saía sem CORS — bug antigo,
  `headers: corsHeaders` sem `(req)` em 6 respostas; consertado em a52b4d9 e publicado como survey-import v41 em 17/11 00:45: o navegador agora lê o 400 "No rows provided"). O 403 do pendente segue
  provado só pelo código (não há conta pendente de teste).
- `survey-import`: admin ou membro ativo da área Comercial (a régua da policy `survey_imports_insert_auth`),
  decidido antes de ler o corpo e de qualquer escrita; `purge` só admin. Só houve 1 importação até hoje, de um
  admin. O publicado (v39, 21/04) é o mesmo código do main (só tipos e formatação diferem): o deploy só acrescenta
  a régua.
- `vdesk-tickets-os`: exige `hub_is_approved()`; `reset` só admin; sem o fallback HTTP; `correlacao-batch` até 500
  tickets validados (a tabela tem 41 hoje); `consultar` repassa só os 9 parâmetros da tela, `pageSize` até 200.
  O publicado (v56) é igual ao main.
- `webhook-test`: só admin; `redirect: 'manual'`. **Achado novo:** o publicado é a v39 de 21/04, ANTERIOR ao
  endurecimento de 15/05 (f8e1ac7, nunca publicado). Hoje qualquer login faz o servidor dar POST em QUALQUER URL
  (http, IP interno, metadados da nuvem) e devolve os primeiros 300 caracteres da resposta — SSRF. O deploy leva o
  endurecimento de 15/05 + a régua de admin.
- Apaga as órfãs `vdesk-proxy` (v71, verify_jwt false) e `vdesk-ticket-os` (v41). Nada chama: nem o front, nem outra
  edge, nem cron; o teste Deno que apontava para a `vdesk-proxy` agora aponta para a `vdesk-tickets-os`.
- CORS: o `_shared/cors.ts` que vai no pacote tem as mesmas origens do publicado.
- **Guarda (a volta):** `D:\Mode.IA\Projetos_Flag\Portal FlagHub\_seguranca\sec2-guarda\` — os 5 pacotes eszip no ar
  em 17/11 + `guarda.json`. A `volta` republica os três pelo PATCH com o eszip e recria as órfãs.
- **Prova:** `conferir` sem JWT: versão nova com a marca, órfãs 404, anon 401. Com `JWT_ADMIN` (o do Igor, tirado do
  navegador): passa a régua em cada uma sem gravar nada (survey sem linhas → 400; webhook com tipo inválido → 400;
  vdesk status 200; lote de 501 → 413). Com `JWT_PENDENTE`: 403 nas três — não há conta pendente de teste; fica
  provado pelo código até existir uma (a SEC3 fecha o cadastro de onde ela viria).
- **Risco:** baixo. Quem usa hoje (admin, Comercial, aprovados) segue igual; perde só quem não devia ter acesso. Sem
  Deno nesta máquina, só a sintaxe foi checada aqui; o deploy compila no servidor e o script para no 1º erro.
- **Volta:** `node scripts/sec2-edges-prod.mjs volta <guarda>`. Não depende de merge nem de migration.

### SEC3 — cadastro só pelo SSO (config do Auth + função)
- `disable_signup` **não** serve: bloqueia também o primeiro login SSO de quem entra na Flag.
- Em vez disso, o hook **before-user-created** (`hook_before_user_created`) com uma função
  `public.hub_hook_antes_de_criar_usuario(event jsonb)` que recusa quem não vem do provedor `azure`;
  contas por senha (o monitor e futuras) continuam sendo criadas pelo admin.
- Junto: `mailer_autoconfirm=false`, `password_min_length=12`, `password_hibp_enabled=true` (o plano Pro
  permite), revisar `uri_allow_list` (tirar os domínios lovable).
- **Prova:** a função testada num DO com eventos de exemplo (azure aceita, email recusa, criação pelo admin
  aceita); depois `POST /auth/v1/signup` com a anon key → recusa; o Igor entra pelo SSO; o monitor entra
  pela senha. Conferir no ensaio se a criação pelo admin passa pelo hook (se passar, liberar pelo
  `app_metadata`).
- **Risco:** médio — um erro na função barra funcionário novo no SSO. Mitigação: o teste no DO e o login
  SSO de uma conta de teste logo depois.
- **Volta:** `PATCH /config/auth` com `hook_before_user_created_enabled=false` (um comando).
- Os 2 usuários que hoje não têm área, papel nem Timer: listar ao Igor (podem ser cadastros de fora).

### SEC4 — a anon fica só com o que o login precisa (banco)
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM anon` nas 79 tabelas (nada escreve como anon:
  `auth-rate-limit` usa a service role).
- `REVOKE EXECUTE ... FROM PUBLIC, anon` nas 3 funções de IP (o front só chama `hub_check_my_ip` com
  login: `useIpCheck` tem `enabled: !!user`) e na `rpc_timelog_chain_health`; as `fn_*` puras podem ficar.
- `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES/SEQUENCES/FUNCTIONS FROM anon` (e
  `EXECUTE FROM PUBLIC` em funções) para os donos `postgres` e, se o papel permitir, `supabase_admin` — o
  objeto novo deixa de nascer aberto.
- **Prova:** DO: anon sem privilégio de escrita em nada e sem EXECUTE nas definer; os 23 usuários e o
  monitor com as mesmas contagens nas tabelas que já leem; login por senha (o `auth-rate-limit`) inalterado.
- **Risco:** baixo. **Volta:** GRANT gerado do snapshot das ACLs tirado no ensaio.

### SEC5 — as 116 definer (banco, em lotes de ~20)
- Classificar cada uma: régua de policy (`hub_is_*`, fica), RPC de dado (guard
  `IF NOT hub_is_approved() THEN RAISE 42501` ou virar invoker), de admin (guard `hub_is_admin()`), de
  trigger/cron (tirar EXECUTE de `authenticated`). A RLS-A já fez 41; sobram ~75.
- `SET search_path = public, pg_temp` nas 15 apontadas pelo advisor (várias `timer_*`).
- **Prova:** por lote, um DO que chama cada função como pendente (espera 42501 ou vazio) e como o monitor e
  um usuário de cada área (espera o mesmo de antes).
- **Risco:** médio (uma tela que chama RPC sem ser aprovada). **Volta:** o lote anterior em
  `CREATE OR REPLACE` (guardado no ensaio com `pg_get_functiondef`).

### SEC6 — edges da segunda leva
- `auth-rate-limit`: só registra o IP de quem chama (não o e-mail digitado como "sucesso"), sem `reset`
  pelo cliente, sem o modo `legacy` com senha; ou trocar pelos limites nativos do Auth (já ligados:
  `rate_limit_*`). Hoje um curl pula ela (o Login chama, mas o GoTrue não depende dela).
- `timer-devops`: `buscar`/`filhos` só nos projetos do Timer e com teto por minuto por usuário; falhar
  fechado sem `DEVOPS_PAT_TIMER` (nunca cair no `DEVOPS_PAT` amplo).
- `devops-sync-query`: 401 sem o bloco de debug; comparações de segredo em tempo constante em todas.
- **Risco:** baixo. **Volta:** redeploy da versão anterior.

### SEC7 — o Timer não carrega o hub (front)
- `React.lazy` nas rotas do hub em `src/App.tsx`: o `/timer` deixa de baixar as telas e os nomes de
  tabela do hub. Sem dependência de banco: pode ir a qualquer momento.
- **Limite honesto:** o PostgREST continua dizendo "você quis dizer `public.x`?" (PGRST205/202) para
  qualquer chave, e 401×404 diz se um nome existe. Não há chave para desligar isso no Supabase. Esconder o
  hub de verdade de quem só tem o Timer exige tirar as tabelas do schema exposto (um schema `api` só com o
  que o front usa, `db_schema` apontando para ele) — projeto à parte, não fase deste plano.
- **Risco:** baixo (chunk que falha ao carregar → já há a tela de erro). **Volta:** revert do PR.

### SEC8 — estudo, sem migration ainda
- **MFA no banco:** policy RESTRICTIVE exigindo `aal2` para quem entra por senha. O SSO chega `aal1` (o MFA
  da Microsoft não aparece no JWT), e o monitor está com `mfa_exempt=false` de propósito — desenhar antes.
- **Limite de requisições no PostgREST:** o Supabase não oferece por usuário; só nas edges (SEC6) e nos
  limites do Auth. Registrar como risco aceito.
- **CORS:** o das edges já é restrito; o do `/rest/v1` é o do Supabase (aberto) e não se configura. CORS não
  segura curl — não é controle, é higiene.
- **OpenAPI:** a anon já recebe 401; conferir com um JWT de usuário na rodada com o Igor.

### SEC9 — trava para não voltar (repositório)
- Checagem estática nas migrations novas (script no `npm run lint` ou teste Vitest que lê os arquivos):
  `CREATE [OR REPLACE] VIEW` sem `security_invoker`, `SECURITY DEFINER` sem `SET search_path`,
  `GRANT ... TO anon`. O CI do PR só roda Vercel hoje; o teste entra no Vitest local e no pré-merge.
- Versionar a definição da `v_colaborador_ausencias` (hoje só existe em produção).

## Ordem sugerida e o que pede o Igor

1. **SEC1** — ensaio agora (o DO desfaz tudo) → ok → aplicar → conferir com o mesmo arquivo.
2. **SEC2** junto (edges, independe do banco).
3. **SEC3** com o Igor no teclado (login SSO e do monitor logo depois).
4. **SEC4**, **SEC5** (lotes), **SEC6**, **SEC7**, **SEC9**.
5. Honeypot (etapa 3) depois da SEC4, para não registrar ruído do que já vai ser fechado.

Lembrete: revogar o token temporário da Management API ao fim da revisão.
