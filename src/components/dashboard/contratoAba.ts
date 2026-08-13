/**
 * Contrato entre uma aba e a barra de filtro da página.
 *
 * O problema que isto resolve: cada aba nova tendia a criar o próprio seletor de
 * período e o próprio botão de exportar, e a página acabava com três camadas de
 * filtro que não conversavam. A regra passa a ser: a aba NÃO cria filtro de
 * período — ela recebe o intervalo por props e devolve, por este contrato, o que
 * a barra precisa mostrar em nome dela.
 *
 * Fica em arquivo próprio, e não junto do componente da barra, porque tanto a
 * barra quanto as abas o importam: deixá-lo no componente criaria dependência
 * circular assim que uma aba precisasse do tipo.
 */

/** Filtro de drill aplicado dentro da aba (clique em KPI, gráfico ou linha). */
export interface ChipFiltro {
  id: string;
  rotulo: string;
  remover: () => void;
}

/** Formato de exportação que a aba activa sabe gerar. */
export interface ExportadorAba {
  id: string;
  rotulo: string;
  executar: () => void;
}

export interface ContratoAba {
  /** Filtros de drill activos, mostrados como chips removíveis na barra. */
  chips: ChipFiltro[];
  /** Remove todos os chips de uma vez. Ausente quando não há nenhum. */
  limparTudo?: () => void;
  /** Substitui o menu de exportação da barra enquanto esta aba estiver activa. */
  exportadores?: ExportadorAba[];
}

export const CONTRATO_VAZIO: ContratoAba = { chips: [] };
