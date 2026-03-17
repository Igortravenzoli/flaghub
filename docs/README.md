# Documentation Index

Este diretorio concentra guias operacionais e tecnicos do projeto.

## Start Here

- [README.md](../README.md)
- [SETUP_API_REST.md](SETUP_API_REST.md)
- [SETUP_CRON_JOBS.md](SETUP_CRON_JOBS.md)
- [COMECE_AQUI_TESTES.md](COMECE_AQUI_TESTES.md)

## Architecture and Flows

- [ARQUITETURA.md](ARQUITETURA.md)
- [FIX_ROTAS_F5.md](FIX_ROTAS_F5.md)

## Testing and Local Validation

- [TESTE_LOCAL.md](TESTE_LOCAL.md)
- [TESTES_CRIADOS.md](TESTES_CRIADOS.md)

## Planning and Alignment

- Living roadmap (VS Code + Lovable): [.lovable/plan.md](../.lovable/plan.md)

Regra de alinhamento:

1. Mudou regra de KPI, filtros de sprint, ou arquitetura de sync?
2. Atualize no mesmo ciclo: codigo + `.lovable/plan.md` + doc operacional impactado.
3. Evite manter roadmap apenas em chat, para nao gerar drift entre VS Code e Lovable.

Convencao de nomenclatura em docs:

- `customer_service` = chave canonica de area (backend/planos)
- `customer-service` = slug de rota (URL)
