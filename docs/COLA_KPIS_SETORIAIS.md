# Cola Rápida de KPIs por Setor

Este arquivo foi pensado como versão curta para consulta rápida por usuários dentro do sistema.

## Fábrica

- `Total`: itens KPI sem dupla contagem de PBI + task filha.
- `Em progresso`: `In Progress`, `Active`, `Em desenvolvimento`, `Aguardando Teste`.
- `To do`: `To Do` e `New`.
- `Done`: `Done`, `Closed`, `Resolved`.
- `AVIÃO`: item com tag `AVIAO`.
- `Aguardando Teste`: ainda pertence à Fábrica, não à Qualidade.
- `Transbordo real`: mudanças relevantes de sprint menos o primeiro compromisso.
- `Lead time médio`: horas médias por PBI com base em timelog; sem timelog, usa esforço médio.
- Fonte principal: Azure DevOps.
- Armazenamento principal: `vw_fabrica_kpis` + `devops_work_items`.

## Qualidade

- `Fila QA`: somente `Em Teste` e `Aguardando Deploy`.
- `Em Teste`: itens no teste ativo.
- `Aguardando Deploy`: itens liberados por QA e aguardando publicação.
- `Taxa de vazão`: `Aguardando Deploy / Total QA`.
- `Retorno QA`: quantas vezes o item voltou para `Em Teste` depois da primeira entrada.
- `Aviões testados`: itens com tag `AVIAO` dentro da fila QA.
- Fonte principal: Azure DevOps.
- Armazenamento principal: `vw_qualidade_kpis`, `devops_work_items.state_history`, `pbi_lifecycle_summary`.

## Infraestrutura

- `Pendentes`: `New` e `To Do`.
- `Em andamento`: `In Progress` e `Active`.
- `Concluídos`: `Done`, `Closed`, `Resolved`.
- `Melhorias`: itens com tag `MELHORIA`.
- `ISO 27001`: itens com tag `ISO27001` ou `ISO`.
- `Trocas de sprint`: total de migrações detectadas no histórico de sprint.
- `Transbordo`: soma do excesso real depois do primeiro compromisso.
- Fonte principal: Azure DevOps.
- Armazenamento principal: `vw_infraestrutura_kpis` + `devops_work_items.iteration_history`.

## Customer Service

- `Fila CS`: itens DevOps do setor no recorte atual.
- `Por responsável`: agrupamento por `assigned_to_display`.
- `Implantações em andamento`: registros manuais sem status de encerramento.
- `Implantações finalizadas`: registros manuais encerrados/cancelados.
- `Produto`: extraído das tags conhecidas do item.
- `Aprovacao CS`: responsável/e-mail ligado a `aprovacaocs@flag.com.br`.
- `Customer Service`: responsável/e-mail ligado a `cs@flag.com.br`.
- `Backlog`: regra atual baseada em responsável contendo `lantim`.
- `Aging`: usa datas da descrição do item.
- Thresholds de aging:
  - VDesk -> DevOps: alerta 7d, crítico 14d
  - DevOps -> agora: alerta 14d, crítico 30d
- Fonte principal: Azure DevOps + upload manual.
- Armazenamento principal: `vw_customer_service_kpis`, `cs_implantacoes_records`, `cs_fila_manual_records`.

## Comercial

- `Ativos`, `Inativos`, `Bloqueados`: contagem por `status` da base de clientes.
- `Clientes por bandeira`: agrupamento dos clientes ativos por bandeira.
- `Movimentação`: ganhos, perdas, saldo financeiro e saldo de clientes.
- `Pesquisa`: média geral das notas numéricas em `notas_por_produto`.
- `Vendas por organização`: participação percentual do valor vendido por organização.
- `Vendas por mês`: compara o valor do mês contra a média histórica mensal, usada como proxy de meta.
- Fonte principal: Gateway/VDesk, uploads e tabela de vendas.
- Armazenamento principal: `vdesk_clients`, `vw_comercial_clientes_ativos`, `comercial_movimentacao_clientes`, `comercial_pesquisa_satisfacao`, `comercial_vendas`.

## Helpdesk

- `Total registros`: soma do acumulado dos snapshots do período.
- `Total horas`: `totalMinutos / 60`.
- `Consultores`: consolidado por nome do consultor.
- `Tipo de chamado x tempo médio`: tempo médio por tipo no período.
- `Histórico`: usa o snapshot mais recente de cada dia.
- Fonte principal: VDesk Helpdesk API.
- Armazenamento principal: `helpdesk_dashboard_snapshots` e `vw_helpdesk_kpis`.

## Programação

- Painel demonstrativo com dados mockados.
- KPIs atuais: total tasks, em progresso, to do, aviões, bugs, transbordos, retorno QA.
- Sem ingestão real.
- Sem armazenamento real no backend.

## Comunicação

- Painel demonstrativo com dados mockados.
- KPIs atuais: emails enviados, entregues, aberturas, leads, conversões, cliques, bounces, spam e descadastros.
- Sem ingestão real.
- Sem armazenamento real no backend.

## Produtos

- Setor ainda sem fonte configurada.
- Não há KPI operacional ativo nesta versão.