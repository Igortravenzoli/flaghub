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

### SEC3 — cadastro só pelo SSO (config do Auth + função) · APLICADA em 17/11 (BRT), conferida
- **Como ficou:** migration `20261117100000` (schema `privado`, fora da API: a função
  `privado.hub_antes_de_criar_usuario` e a tabela `privado.cadastro_permitido`), verificação
  `verificacao/sec3_cadastro.sql` (`SEC3 OK` no ensaio e depois de aplicada), config do Auth por
  `scripts/sec3-auth-prod.mjs` (guarda em `_seguranca\sec3-guarda\auth-antes.json`). Hook ligado; autoconfirm
  desligado; senha mínima 12; `uri_allow_list` só com os localhost. A checagem de senha vazada respondeu
  **402 (exige plano Pro)** e ficou desligada. Sonda: cadastro por e-mail com a anon key → 403 "Cadastro só
  pela conta Microsoft da Flag." e nenhuma conta criada.
- **Conta por senha nova (ex.: outro telão):** o admin insere o e-mail em `privado.cadastro_permitido`
  (SQL editor; vale 1 vez, vence em 7 dias) e cria a conta logo depois.
- **Atenção na aplicação:** o PowerShell 5.1 leu o .sql como ANSI e a mensagem saiu "sÃ³"; a verificação
  pegou e foi reaplicado em UTF-8 (`Get-Content -Encoding UTF8`). Mandar SQL sempre lido como UTF-8.
- Os 2 pendentes são da Flag (SSO, nunca aprovados). Há 1 conta aprovada `gmail.com`, por senha, de 16/04
  (`fd0c8724…`): conferir.

Plano original:
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

### SEC4 — a anon fica só com o que o login precisa (banco) · APLICADA em 17/11 (BRT), conferida
- **Como ficou:** migration `20261117110000`: a anon sem NENHUM privilégio em tabela/view/sequência/função do
  public (inclusive SELECT: nenhuma tela lê antes do login); as 14 funções abertas a PUBLIC passaram a
  authenticated + service_role explícitos; default privileges do postgres sem anon e sem EXECUTE para PUBLIC.
  Ensaio com foto: os 1155 privilégios de authenticated/service_role intactos. Depois de aplicada, o FlagHub
  recarregado com a sessão do Igor: 15 chamadas, todas 200. Volta: `verificacao/sec4_anon_volta.sql` (127
  GRANTs gerados das ACLs reais antes da aplicação).

Plano original:
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

### SEC5 — as 116 definer (banco, em lotes de ~20) · NÃO APLICADA, só o inventário (17/11)
- **Inventário:** as 116 já têm `search_path` fixo (o advisor das 15 estava desatualizado); 2 são de trigger;
  20 não são citadas por policy, view, outra função, front, edge nem cron (candidatas a perder o EXECUTE de
  authenticated); 51 são chamadas pelo front sem régua no corpo — várias do Timer e algumas escrevem. Essas
  pedem revisão uma a uma com o Igor antes de qualquer lote.

Plano original:
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

### SEC10 — `profiles.network_id` só por admin (banco) · NÃO APLICADA, PR aberto (18/11)
- **Origem:** auditoria de 17–18/11 com a skill `security-audit` da Cloudflare (run-1 só de fonte; run-2
  em sandbox Docker local, Postgres 16 sem rede, com as migrations do repositório). Achado **alto**,
  reproduzido por três agentes independentes: a política "Users can update own profile" não limita coluna,
  `auth_network_id()` lê `profiles.network_id` e as políticas de `tickets` (e `get_tickets` /
  `get_ticket_detail` / `get_dashboard_summary`) liberam por `network_id = auth_network_id()` sem
  `hub_is_approved()`. Uma conta logada **sem membership** fazia `PATCH /rest/v1/profiles` com
  `network_id = N` e passava a ler (com `raw_payload`/`vdesk_payload`), alterar e inserir tickets da rede N.
  A pentest 3 já tinha apontado a política; a correção de abril protegeu só `mfa_exempt`.
- **Como fica:** migration `20261118120000`: gatilho `protect_profile_network_id_trigger` (BEFORE INSERT OR
  UPDATE em `profiles`) recusa com 42501 a sessão de usuário não admin (`hub_is_admin()`) que tente gravar
  ou mudar `network_id`. A tela `/usuarios` (admin) e a `service_role` seguem gravando; nome e o resto do
  perfil continuam editáveis pelo próprio usuário. Não mexe em dado.
- **Prova:** `verificacao/sec10_network_id.sql` (ensaio = corpo da migration + PROVA; o RAISE desfaz).
  Na sandbox: ataque barrado, `SEC10 OK (desfeito): A B C`, e com a volta o ataque volta a passar.
  **Volta:** `verificacao/sec10_network_id_volta.sql`.
- **Fica para decidir (não está nesta migration):** (1) perfis que já têm rede sem membership ativa
  (`network_id = 1` dado a todos em `20260204140830`, ou membership revogada) mantêm acesso aos tickets —
  a leitura D da verificação lista quem; (2) defesa em profundidade: exigir `hub_is_approved()` junto de
  `auth_network_id()` nas políticas de tickets/networks/imports/settings e nos RPCs de tickets.
- **Outros achados da mesma auditoria** (baixos, com migration de correção proposta e testada na sandbox):
  `collab_map_admin_mut` deixa owner de qualquer área decidir em nome de quem a automação lança horas;
  `get_recent_batches` devolve lotes e e-mail de importador de qualquer rede. Relatórios locais em
  `Portal FlagHub\_seguranca\auditoria-skill-cloudflare-2026-11-17\run-2\`.

## Ordem sugerida e o que pede o Igor

1. **SEC1** — ensaio agora (o DO desfaz tudo) → ok → aplicar → conferir com o mesmo arquivo.
2. **SEC2** junto (edges, independe do banco).
3. **SEC3** com o Igor no teclado (login SSO e do monitor logo depois).
4. **SEC4** (aplicada); **SEC10** antes da SEC5 (achado alto, gatilho pequeno, sem mudar dado), depois **SEC5** (lotes),
   **SEC6**, **SEC7**, **SEC9**.
5. Honeypot (etapa 3) depois da SEC4, para não registrar ruído do que já vai ser fechado.

Lembrete: revogar o token temporário da Management API ao fim da revisão.
