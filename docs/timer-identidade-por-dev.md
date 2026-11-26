# Timer Flag: escritas no Azure DevOps com a identidade de cada dev

25/11/2026. Ramo `claude/timer-identidade-por-dev`. O código entra **desligado** e só passa a valer com as duas chaves da seção 4.5.

**Estado em 25/11/2026, 13h20 (São Paulo):**

- Entra (4.1) e Azure DevOps (4.2): feitos. A organização `FlagIW` está conectada ao tenant do SSO.
- Migration TM10 (4.3): ensaiada, aplicada e registrada como `20261125163000`; verificação `TM10 OK`.
- Secrets e edge (4.4): os três secrets existem; a `timer-devops` v21 está no ar com este código.
- Ligar (4.5) e testar (4.6): **ainda não**. `TIMER_DEVOPS_DELEGADO` e `VITE_SSO_ESCOPOS_EXTRAS` estão ausentes, e o Timer grava pelo PAT como antes.

## 1. Decisão recomendada

Trocar o PAT único por um **token Microsoft Entra delegado da própria pessoa** nas três escritas de work item do Timer (`criar`, `reuniao`, `concluir`). O History do Azure DevOps passa a mostrar o dev porque é o dev quem autentica, sem pular regra nenhuma do processo.

- O login do FlagHub passa a pedir **só `offline_access` a mais**. Com isso a Supabase entrega, uma vez, o refresh token Microsoft da pessoa.
- A edge `timer-devops` guarda esse refresh token **cifrado** e, a cada escrita, troca-o no Entra por um access token do recurso do Azure DevOps (`499b84ac-1321-427f-aa17-267ca6975798/.default`).
- Sem token válido, ou se o DevOps recusar a credencial, a escrita **cai no PAT como hoje** e deixa o evento `devops_caiu_no_pat` em `timer_eventos`.
- Leituras, TimeLog (TechsBCN) e o lançamento automático das 23:50 **não mudam**: seguem no PAT de serviço.
- A alternativa `bypassRules` + `System.ChangedBy` **não serve** (seção 2, ponto 4).

O caminho se sustenta na documentação, mas a troca do token **não foi testada ao vivo** contra o Entra nem contra o DevOps (seção 5). O primeiro teste real é o passo 4.6.

## 2. Os cinco pontos

### Ponto 1 — o provider `azure` da Supabase e o escopo

- **Aceita o escopo.** O GoTrue parte de `openid` e acrescenta o que o cliente pedir, sem lista de permitidos: `oauthScopes := []string{"openid"}` e depois `append(oauthScopes, strings.Split(scopes, ",")...)` [S1]. A lista é quebrada por **vírgula**; por isso os escopos seguem separados por espaço, como já são hoje.
- **O login não depende do access token.** O GoTrue identifica a pessoa só pelo `id_token`: "Only ID tokens supported, UserInfo endpoint has a history of being less secure." [S1]. Ele não chama o Graph. Um access token emitido para outro recurso não deveria quebrar o login (leitura do código, não testado).
- **O `provider_token` de hoje não serve para o DevOps.** Com `email profile openid` ele não é do recurso do Azure DevOps. O DevOps aceita token Entra como `Authorization: Bearer` quando o token é do recurso `499b84ac-…` [M1][M3]. No desenho proposto o `provider_token` nem é usado: o que interessa é o **refresh token**, que o Entra não prende a um recurso: "bound to a combination of user and client, but aren't tied to a resource or tenant" [M6].
- **O que quebra no login atual: nada, se o consentimento vier antes.**
  - Hook de cadastro só-SSO (`privado.hub_antes_de_criar_usuario`): olha só o provedor `azure`. Escopo não entra na decisão.
  - `validarSsoFlag` (`sso.ts`): olha identidade `azure`, `amr` = oauth, tenant e e-mail. O escopo `email` continua no pedido. Não muda.
  - MFA do app: quem entra por SSO é isento (`checkLocalMfaRequirement`). O MFA do Entra continua valendo no login interativo, como hoje.
  - **O risco real é a ordem:** pedir `offline_access` antes do consentimento de admin faz o Entra mostrar tela de consentimento a cada pessoa ou barrar o login (AADSTS90094 / AADSTS65001) [M9]. E o login é do **FlagHub inteiro**, não só do Timer. Por isso o escopo extra fica atrás de `VITE_SSO_ESCOPOS_EXTRAS`, vazia por padrão.

### Ponto 2 — token válido a cada escrita

O access token dura cerca de 1 h [M3] e a Supabase não guarda nem renova o token do provedor: "Provider tokens are intentionally not stored in your project's database." [S3]. Ela o entrega "only once immediately after the user signs in" [S4]. Não há API de admin nem hook para a edge buscá-lo depois.

Opções avaliadas:

| Opção | Veredito |
| --- | --- |
| **Guardar o refresh token cifrado no servidor e renovar no Entra com o client secret** | **Escolhida.** Zero clique a mais para o dev; refresh token de app Web dura 90 dias e se renova a cada uso [M6]. |
| On-behalf-of | Não resolve. Exige um token cuja audiência seja a nossa própria API [M8], que o login da Supabase não emite, e a asserção também vence em 1 h: o refresh continuaria necessário. |
| Consentimento separado só do Timer (a edge faz o próprio fluxo OAuth) | Funciona e o refresh token não passaria pelo navegador, mas pede redirect URI novo, controle de `state`/PKCE na edge e um clique por dev. Fica como plano C. |

Como funciona (código em `supabase/functions/timer-devops/identidade.ts`):

1. No login, o app recebe o `provider_refresh_token` e o manda uma vez à edge (op `vincular`).
2. A edge **troca** esse token no Entra (`grant_type=refresh_token`, `scope=openid offline_access 499b84ac-…/.default`) [M7]. A troca prova que o token vale, que serve para o DevOps e de quem é: o `tid` e o `sub` do `id_token` devolvido têm de bater com o tenant da Flag e com o `sub` da identidade `azure` da sessão. Token de outra pessoa é recusado.
3. O refresh token que voltou é gravado em `privado.timer_devops_token`, cifrado com AES-256-GCM. O `user_id` entra como dado autenticado: a cifra de uma pessoa não abre na linha de outra.
4. A cada escrita: access token do cache em memória da instância; se faltar ou estiver a menos de 5 min de vencer, renova com o refresh guardado. O refresh novo só é regravado uma vez por semana por pessoa (o antigo continua valendo: o Entra "doesn't revoke old refresh tokens when used to fetch new access tokens" [M6]); isso evita uma escrita no banco por hora por pessoa.
5. Volta ao PAT só quando o pedido **não foi processado**: sem token, ou 401/403/203 do DevOps. Erro de rede, 400 e 5xx com o token da pessoa não repetem com o PAT (o item pode ter sido criado).

**Onde o segredo fica e quem lê**

| O quê | Onde | Quem alcança |
| --- | --- | --- |
| Refresh token (cifrado) | `privado.timer_devops_token` | Schema fora do PostgREST: `anon` e `authenticated` não alcançam. O `service_role` só pelas funções `timer_devops_token_ler/gravar/apagar`. `postgres` (painel) e `bkp_leitor` (dump do backup) veem **só a cifra**. |
| Chave da cifra | secret `TIMER_TOKEN_CHAVE` da edge | Quem administra os secrets do projeto. Todas as edges do projeto leem os mesmos secrets: não há isolamento entre edges. **Não guardar a chave junto do backup.** |
| Client secret do app | secret `TIMER_ENTRA_CLIENT_SECRET` | Idem. Sem ele o refresh token não vale nada (cliente confidencial) [M7]. |
| Access token | memória da instância da edge | Ninguém; some quando a instância recicla. Nunca vai ao banco nem ao log. |

**Como revogar**

- **Tudo, na hora:** tirar `TIMER_DEVOPS_DELEGADO`. Todas as escritas voltam ao PAT.
- **Uma pessoa:** revogar o Timer dela (`timer_revogar_acesso`) apaga o vínculo por gatilho; ou `DELETE FROM privado.timer_devops_token WHERE user_id = …`.
- **No Entra:** o admin revoga as sessões da pessoa, o que derruba o refresh token [M6]; ou remove o client secret (nenhum refresh guardado funciona mais); ou tira o consentimento do app. Atenção: a pessoa **trocar a própria senha não revoga** refresh token de cliente confidencial [M6].
- Chave perdida ou trocada: as cifras não abrem, os vínculos são apagados e cada pessoa volta a vincular no próximo login. Não há perda de dado.

### Ponto 3 — passos no Entra e no DevOps

Estão na seção 4, na ordem. Sobre a política do DevOps: **"Third-party application access via OAuth" não se aplica**. Ela vale só para os apps OAuth antigos do Azure DevOps: "This policy doesn't affect Microsoft Entra ID OAuth app access." [M4].

### Ponto 4 — manter o PAT e gravar `System.ChangedBy` com `bypassRules=true`

Não serve. Motivos:

- **Pula as regras do tipo.** `bypassRules` = "Do not enforce the work item type rules on this update" [M10]. Os campos que os KPIs da Fábrica leem são preenchidos por regra: "these fields are automatically set or cleared when you transition a work item from one state to another" (Closed/Activated/Resolved By e Date; State Change Date também é regra) [M12]. Com as regras puladas, `ClosedDate`, `ClosedBy`, `StateChangeDate` e `Reason` teriam de ser calculados e enviados pelo Timer. Os syncs `devops-sync-all` e `devops-sync-query` leem `Microsoft.VSTS.Common.ClosedDate` e `ClosedBy`: um item fechado pelo Timer sem data de fechamento some dos indicadores. (Que esses campos ficam vazios é inferência do texto acima; a Microsoft não diz isso numa frase só.)
- **Aceita valor inválido.** O exemplo oficial grava "Invalid Value" em `AssignedTo` e recebe 200 [M10]. As listas de Cliente e Produto deixariam de ser conferidas pelo DevOps.
- **É ferramenta de migração.** "Scenarios where this is useful are migrations where you don't want to update the by/date fields on import" [M11].
- **Permissão alta para o dono do PAT.** "Bypass rules on work item updates", por projeto [M11]. A documentação antiga ainda exige ser membro de "Project Collection Service Accounts" para alterar `System.ChangedBy`/`CreatedBy` [M13]; se isso segue valendo na nuvem não foi confirmado.
- **O History fica com o nome do dev, mas a autoria é forjada.** Quem autenticou continua sendo o dono do PAT (campo `System.AuthorizedAs`), e um PAT com essa permissão escreve em nome de **qualquer** pessoa. Para um ambiente com SGSI, é pior que o problema de hoje. Como a tela do History mostra esse caso ("via …") não está documentado e não foi testado.

Impersonação por cabeçalho (`X-TFS-Impersonate`) só aparece documentada para o TFS antigo; não há caminho suportado com PAT na nuvem (não confirmado oficialmente).

### Ponto 5 — leituras no PAT de serviço

Confirmado e mantido. `minhas`, `buscar`, `filhos`, `tags`, `campos` e, no ramo `claude/timer-ajustes-2511`, `estados` passam por `lerAzure(…, pat)`. As conferências que antecedem cada escrita (pai, sprint, listas de Cliente/Produto, tags, estados do tipo) também são leituras e seguem no PAT. Há um motivo além da simplicidade: os caches de tags e de campos são **compartilhados entre todos**; lidos com o token de uma pessoa, passariam a refletir a permissão dela para os demais. Só o POST/PATCH final troca de identidade.

Efeito colateral bom: o limite de uso do DevOps é por identidade ("Azure DevOps limits the resources each user can consume" [M14]); as escritas saem da conta do Igor.

## 3. O que mudou no código

| Arquivo | O quê |
| --- | --- |
| `supabase/functions/timer-devops/identidade.ts` | Parte pura: chave ligada/desligada, escolha do cabeçalho, validade, renovação, conferência do dono, cifra. |
| `supabase/functions/timer-devops/index.ts` | `escreverNoAzure` (usada por `criar`, `reuniao`, `concluir` e, desde 26/11/2026, `iniciar`: a Task sai de To Do para In Progress ao dar play) e a op `vincular`. Com a chave desligada, o comportamento é o de hoje. |
| `supabase/migrations/20261125163000_tm10_timer_devops_token.sql` | Tabela `privado.timer_devops_token`, três funções só do `service_role`, gatilho que apaga o vínculo ao revogar o Timer. Aplicada em 25/11/2026. |
| `supabase/verificacao/tm10_devops_token_timer.sql` | Ensaio e conferência da TM10. |
| `src/lib/timerVinculoDevops.ts`, `src/hooks/useTimerVinculoDevops.ts` | Escopos do login pela variável e envio do refresh token à edge, uma vez por login. |
| `src/contexts/AuthContext.tsx`, `src/components/timer/TimerRoute.tsx` | Duas ligações pequenas. Sem a variável, o login pede os mesmos escopos de sempre. |
| `src/test/timerIdentidade.test.ts` | 45 testes da parte pura. |
| `scripts/tm10-prod.mjs` | Aplicação manual em produção: `pre`, `ensaio`, `aplicar`, `edge`, `conferir`, `volta`. O `conferir` mostra os vínculos e os eventos `devops_*` dos últimos 7 dias. |

Eventos novos em `timer_eventos` (origem `servidor`): `devops_vinculado`, `devops_vinculo_falhou` (`motivo`, `erro`), `devops_caiu_no_pat` (`op`, `motivo`). Motivos da queda: `sem_vinculo`, `renovacao_recusada`, `renovacao_falhou`, `dono_nao_confere`, `cifra_nao_abre`, `configuracao_pendente`, `erro_interno`, `devops_401`, `devops_403`, `devops_203`.

Chaves, todas desligadas ou ausentes por padrão:

| Onde | Nome | Valor |
| --- | --- | --- |
| Edge | `TIMER_DEVOPS_DELEGADO` | `1` liga. Ausente = tudo como hoje. |
| Edge | `TIMER_ENTRA_CLIENT_ID` | Application (client) ID do app registration do SSO. |
| Edge | `TIMER_ENTRA_CLIENT_SECRET` | Client secret próprio da edge. |
| Edge | `TIMER_TOKEN_CHAVE` | 32 bytes aleatórios em base64. |
| Edge | `TIMER_DEVOPS_ESCOPO` | Opcional. Padrão `499b84ac-1321-427f-aa17-267ca6975798/.default`. |
| Vercel | `VITE_SSO_ESCOPOS_EXTRAS` | `offline_access`. Ausente = login de hoje. |

## 4. Passos do Igor, na ordem

A ordem importa: consentimento antes do escopo no login; migration e edge antes de ligar a chave.

**4.1 Entra — app registration do SSO** (o Client ID está no painel da Supabase, em Authentication › Providers › Azure; no portal, o caminho é **Registros de aplicativo › Todos os aplicativos**, não *Aplicativos empresariais*)

1. **API permissions › Add a permission ›** aba *APIs my organization uses* › **Azure DevOps › Delegated permissions › `vso.work_write`** ("read, create, and update work items and queries" [M2]). Não usar `user_impersonation`: é acesso total às APIs do DevOps [M2].
2. Pôr na lista as quatro **OpenId permissions** do Microsoft Graph: `openid`, `email`, `profile` e `offline_access`. As três primeiras o login já pede; têm de estar na lista **antes** do passo 3, porque conceder o consentimento troca o consentimento geral do app pela lista configurada (aviso do próprio portal), e escopo fora dela voltaria a pedir consentimento no login.
3. **Grant admin consent for Flag** [M9]. Pede o papel Cloud Application Administrator ou acima. Depois disso ninguém vê tela de consentimento.
4. **Authentication:** o redirect `https://nxmgppfyltwsqryfxkbm.supabase.co/auth/v1/callback` tem de estar na plataforma **Web**, não em *Single-page application* (em SPA o refresh token dura 24 h [M6]).
5. **Certificates & secrets › New client secret**, com nome próprio (ex.: `timer-devops edge`). Segredo separado do que a Supabase usa: cada um gira sem derrubar o outro. Anotar o valor e a validade.

**4.2 Azure DevOps — organização `FlagIW`**

1. **Organization settings › Microsoft Entra:** confirmar que a organização está conectada ao tenant da Flag. Token Entra só funciona para o tenant conectado à organização [M3].
2. **Organization settings › Policies:** nada a fazer em "Third-party application access via OAuth" [M4]. Se "Enable IP Conditional Access policy validation on non-interactive flows" estiver ligada e houver política de Acesso Condicional por IP, as chamadas saem dos IPs da Supabase e podem ser barradas [M5].
3. Cada dev precisa ter, **com a própria conta**, permissão para o que faz pelo Timer (criar Task/PBI, mudar estado) nos projetos em que trabalha. Onde não tiver, o DevOps responde 403 e a escrita cai no PAT, com o evento registrado.

**4.3 Supabase — migration** (precisa do "pode aplicar"; feita em 25/11/2026)

1. `node scripts/tm10-prod.mjs pre`: confere em `supabase_migrations.schema_migrations` que `20261125163000` está livre.
2. `node scripts/tm10-prod.mjs ensaio`: migration + `supabase/verificacao/tm10_devops_token_timer.sql` numa transação que se desfaz; tem de terminar em `TM10 OK`.
3. `node scripts/tm10-prod.mjs aplicar`: aplica, registra a versão e roda a verificação de novo.

**4.4 Supabase — secrets e edge** (precisa do "pode publicar")

1. Gerar a chave e criar os secrets `TIMER_ENTRA_CLIENT_ID`, `TIMER_ENTRA_CLIENT_SECRET` e `TIMER_TOKEN_CHAVE`. Não criar `TIMER_DEVOPS_DELEGADO` ainda.

   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```

2. Publicar a `timer-devops` com `node scripts/tm10-prod.mjs edge`. O script recusa publicar de um commit que não tenha o que já está no ar (a op `estados` do PR #150). Feito em 25/11/2026: v21, do commit `9b4bec4`.
3. Com a chave ainda ausente, o Timer tem de se comportar exatamente como hoje.

**4.5 Ligar**

1. Secret `TIMER_DEVOPS_DELEGADO=1` na edge.
2. Só então `VITE_SSO_ESCOPOS_EXTRAS=offline_access` na Vercel, e novo deploy do front.

**4.6 Primeiro teste (uma conta)**

1. Sair e entrar com Microsoft no Timer. Esperado em `timer_eventos`: `devops_vinculado`.
2. Criar uma Task pelo Timer e encerrá-la. Esperado: o History do DevOps mostra a pessoa na criação e na mudança de estado, e não há `devops_caiu_no_pat`.
3. Se vier `devops_vinculo_falhou`, o campo `erro` diz o que o Entra recusou (`consent_required`, `invalid_grant`, `interaction_required`…).

**4.7 Equipe:** cada dev precisa **sair e entrar de novo uma vez**. A sessão da Supabase não vence sozinha, então quem não refizer o login segue gravando pelo PAT; o evento `devops_caiu_no_pat` com `motivo = sem_vinculo` mostra quem falta.

## 5. Riscos e o que não foi verificado

- **Nada foi testado ao vivo.** Faltam prova de: (a) o Entra trocar um refresh token obtido só com escopos OIDC por um token do Azure DevOps — a documentação afirma e dá exemplo [M7], mas a mesma página diz, na tabela de parâmetros, que o escopo do refresh deve ser "equivalent to or a subset of the scopes requested in the original authorization_code request"; (b) o `sub` do `id_token` da renovação ser igual ao `sub` que a Supabase guarda na identidade `azure`. Se (b) falhar, todo vínculo é recusado com `dono_nao_confere` e nada quebra: as escritas seguem no PAT.
- **Plano B para (a), sem mudar código:** `VITE_SSO_ESCOPOS_EXTRAS="offline_access 499b84ac-1321-427f-aa17-267ca6975798/vso.work_write"`, pedindo o recurso já no login. Também não testado; a leitura do GoTrue indica que o login não quebra [S1].
- **Acesso Condicional.** A renovação sai da edge, sem dispositivo e de IP da Supabase. Política que exija dispositivo conforme ou local confiável devolve `interaction_required` / AADSTS53003 [M5]: o vínculo é apagado e a pessoa segue no PAT.
- **O login muda para o FlagHub inteiro**, não só para o Timer. Com `offline_access`, o refresh token Microsoft de todo usuário SSO passa pelo navegador e fica na sessão guardada até a primeira renovação da sessão da Supabase (cerca de 1 h). Ele não é utilizável sem o client secret.
- **A versão do Auth do projeto pode ser mais antiga** que o `master` do GoTrue lido aqui.
- **403 cai no PAT.** Se o dev não tem permissão no DevOps, o Timer ainda grava pelo PAT, como hoje. A tarefa pediu assim; o evento deixa rastro. Se a intenção for o DevOps mandar, basta tirar o 403 de `ehFalhaDeAutorizacao`.
- **A edge não foi conferida pelo Deno** (não há Deno na máquina de onde saiu). Passou numa checagem de tipos estrita do TypeScript, com os globais do Deno declarados à mão, e sobe em produção (responde 401 sem sessão). A parte pura tem 45 testes; o caminho com token da pessoa em `index.ts` só será exercitado no passo 4.6.
- **Validade do client secret:** quando vencer, toda renovação falha e tudo cai no PAT. Anotar a data.
- **Backup:** o dump de `D:\FlagHubBackup` passa a conter as cifras. Sem a chave elas não abrem; num restore, os vínculos são refeitos no login.

## 6. Fontes

Supabase / GoTrue
- [S1] `azure.go` (provider): https://raw.githubusercontent.com/supabase/auth/master/internal/api/provider/azure.go
- [S2] `external.go` (escopos e retorno do provider token): https://raw.githubusercontent.com/supabase/auth/master/internal/api/external.go
- [S3] Social Login, provider tokens: https://supabase.com/docs/guides/auth/social-sign-in
- [S4] auth-js `GoTrueClient.ts`: https://raw.githubusercontent.com/supabase/supabase-js/master/packages/core/auth-js/src/GoTrueClient.ts
- [S5] Login with Azure: https://supabase.com/docs/guides/auth/social-sign-in/auth-azure

Microsoft
- [M1] Entra OAuth no Azure DevOps: https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth?view=azure-devops
- [M2] Escopos (`vso.work_write`, `user_impersonation`): https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/oauth?view=azure-devops
- [M3] Tokens Entra para o Azure DevOps: https://learn.microsoft.com/en-us/azure/devops/cli/entra-tokens?view=azure-devops
- [M4] Políticas de conexão de aplicativos: https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/change-application-access-policies?view=azure-devops
- [M5] Acesso Condicional no Azure DevOps: https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/conditional-access-policies?view=azure-devops
- [M6] Refresh tokens: https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
- [M7] Fluxo de código de autorização (renovação): https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- [M8] On-behalf-of: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow
- [M9] Consentimento de admin: https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent e códigos de erro: https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes
- [M10] Work Items - Update (`bypassRules`): https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/update?view=azure-devops-rest-7.1
- [M11] Permissões ("Bypass rules on work item updates"): https://learn.microsoft.com/en-us/azure/devops/organizations/security/permissions?view=azure-devops
- [M12] Regras de work item: https://learn.microsoft.com/en-us/azure/devops/organizations/settings/work/rule-reference?view=azure-devops
- [M13] Exemplos antigos de migração (TFS 2017): https://learn.microsoft.com/en-us/previous-versions/azure/devops/integrate/previous-apis/wit/samples?view=tfs-2017
- [M14] Limites de uso: https://learn.microsoft.com/en-us/azure/devops/integrate/concepts/rate-limits?view=azure-devops
