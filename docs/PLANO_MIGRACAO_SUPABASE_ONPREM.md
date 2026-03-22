# Plano de Migracao: Supabase SaaS para On-Prem

## Objetivo
Eliminar a dependencia de Supabase SaaS, migrando banco, autenticacao, funcoes, scheduler e secrets para stack self-hosted.

## Escopo Confirmado
- Remover toda dependencia de Supabase, incluindo Supabase Auth
- Manter funcionalidades atuais: login, OAuth Azure, MFA, RLS, syncs DevOps/VDESK, imports e dashboards
- Time estimado: 1-2 devs part-time

## Estimativa Realista
- Faixa total: 8-14 semanas

## Fases

### Fase 0 - Baseline e Freeze (1 semana)
- Mapear fluxos criticos em producao
- Definir criterios de aceite por fluxo
- Congelar mudancas de schema durante a migracao

Entregavel:
- Checklist de paridade por fluxo (login, dashboard, importacao, sincronizacao)

### Fase 1 - PostgreSQL On-Prem com Paridade (1-2 semanas)
- Provisionar PostgreSQL 14+
- Aplicar migracoes existentes
- Validar funcoes SQL/RPC criticas
- Ajustar extensoes necessarias

Entregavel:
- Banco on-prem com schema funcional e RPCs principais validadas

### Fase 2 - Funcoes e Jobs Self-Hosted (2-3 semanas)
- Substituir Edge Functions por runtime self-hosted (Node.js ou Deno)
- Substituir cron gerenciado por scheduler on-prem
- Garantir execucao de syncs DevOps/VDESK e jobs de limpeza

Entregavel:
- Jobs e funcoes criticas executando em ambiente on-prem

### Fase 3 - Auth fora do Supabase (2-4 semanas)
- Implementar IdP self-hosted (recomendado: Keycloak)
- Integrar login/sessao/refresh token
- Integrar Azure OIDC
- Implementar MFA TOTP
- Adaptar frontend para novo backend de autenticacao

Entregavel:
- Fluxo completo de autenticacao sem Supabase

### Fase 4 - Seguranca e Autorizacao (1-2 semanas)
- Revalidar RLS com claims JWT do novo IdP
- Revisar papeis e politicas sensiveis
- Migrar secrets para cofre/secret manager

Entregavel:
- Modelo de seguranca validado ponta a ponta

### Fase 5 - Cutover Controlado (1 semana)
- Rodar paralelo antes da virada
- Sincronizacao final
- Janela de corte com rollback plan
- Smoke test pos-go-live

Entregavel:
- Operacao em on-prem com rollback testado

## Principais Riscos
- Auth/OAuth/MFA: maior complexidade funcional
- Agendamentos e funcoes: risco operacional se scheduler nao estiver robusto
- RLS com novo JWT issuer: risco de regressao de autorizacao
- Secrets: risco se migracao nao for acompanhada por rotacao e hardening

## Arquivos de Referencia no Projeto
- src/integrations/supabase/client.ts
- src/contexts/AuthContext.tsx
- src/pages/Login.tsx
- src/pages/MfaChallenge.tsx
- src/hooks/useSupabaseData.ts
- supabase/functions/auth-rate-limit/index.ts
- supabase/functions/devops-sync-all/index.ts
- supabase/functions/devops-sync-timelog/index.ts
- supabase/functions/vdesk-sync-helpdesk/index.ts
- supabase/functions/vdesk-sync-base-clientes/index.ts
- supabase/migrations
- supabase/config.toml

## Checklist de Validacao
1. Banco
- Aplicar todas as migracoes em ambiente limpo
- Validar RPCs criticas: auth_user_role_masked, auth_network_id, get_tickets, get_dashboard_summary, get_batch_statistics

2. Auth
- Validar login e refresh
- Validar OAuth Azure fim a fim
- Validar MFA TOTP (enroll/challenge/verify)

3. Seguranca
- Validar isolamento por network_id
- Validar excecoes de admin sem bypass indevido

4. Jobs
- Validar cron de syncs DevOps/VDESK
- Validar rotinas de cleanup e retention

5. Cutover
- Executar smoke test completo
- Confirmar procedimento de rollback

## Recomendacoes de Implementacao
- Priorizar migracao por fases, evitando big-bang
- Executar piloto em staging antes de tocar producao
- Medir custo operacional on-prem (backup, monitoramento, DR, rotacao de secrets)
- Definir ownership de plataforma (quem opera banco, auth, scheduler e observabilidade)

## Status
- Documento criado para validacao futura
- Atualizar este plano a cada marco concluido
