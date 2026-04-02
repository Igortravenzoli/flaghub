

## Plan: Tooltips inline nos Gargalos + Ordenacao no Sprint Board

### 1. Tooltips explicativos inline nos Gargalos (Fabrica + Qualidade)

Adicionar tooltips em cada metrica das linhas de gargalo, usando o componente `Tooltip` ja existente. Cada label (Média, Máx, Em etapa, Atraso) tera um tooltip com explicacao contextual:

- **Média**: "Tempo médio (dias) que os itens permanecem nesta etapa. Valores altos indicam lentidão no processo."
- **Máx**: "Maior tempo (dias) que um item ficou nesta etapa. Outliers indicam itens travados."
- **Em etapa**: "Quantidade de itens atualmente nesta etapa. Volume alto pode indicar gargalo de capacidade."
- **Atraso**: "Itens que ultrapassaram o limite de dias aceitável para esta etapa (ex: Fábrica >14d = atenção, >21d = crítico)."

Tambem adicionar um banner explicativo no topo da tab Gargalos com texto curto explicando o proposito da analise.

**Arquivos**: `src/pages/setores/FabricaDashboard.tsx` (linhas ~1363-1388), `src/pages/setores/QualidadeDashboard.tsx` (linhas ~558-576).

### 2. Ordenacao no Sprint Board (Fabrica)

Adicionar estado `sortBy` com opcoes: `'sprint-asc' | 'sprint-desc' | 'total-asc' | 'total-desc'`.

- Default: `sprint-desc` (sprint mais recente primeiro).
- Controle via Select ao lado do filtro de tipo existente.
- O `displaySprints` sera reordenado com `useMemo` baseado no `sortBy`:
  - Sprint asc/desc: usa a ordem ja existente de `sortedSprints` (natural ou invertida).
  - Total asc/desc: ordena pela soma de itens por sprint.

**Arquivo**: `src/components/fabrica/SprintBoardTab.tsx`.

### Resumo de alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `FabricaDashboard.tsx` | Tooltips nas metricas de gargalo + banner explicativo |
| `QualidadeDashboard.tsx` | Tooltips nas metricas de gargalo + banner explicativo |
| `SprintBoardTab.tsx` | Estado sortBy, Select de ordenacao, logica de sort no displaySprints |

