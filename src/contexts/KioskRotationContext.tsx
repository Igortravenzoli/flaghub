/**
 * Rotação do modo TV — sequência ÚNICA (TV-1).
 *
 * Antes existiam duas camadas independentes: o Home girava entre SETORES e a
 * FabricaTvView girava entre suas 2 páginas com um setInterval próprio de 25s,
 * invisível para a barra superior. Isso produzia três defeitos:
 *
 *   • com "Modo Rotativo" desligado, a Fábrica continuava alternando sozinha;
 *   • com um setor só selecionado, a barra escondia todos os controles e a
 *     Fábrica seguia piscando — só o ESC saía;
 *   • com setor a 30s e página a 25s, a página 2 aparecia ~5s antes de trocar
 *     de setor; a 15s ela nunca era vista.
 *
 * Agora há um relógio só, no Home, e um único `avancar()` que o botão e o timer
 * compartilham: página 1 → página 2 → próximo setor.
 *
 * Setores sem páginas internas (comercial, customer-service/Produtos,
 * qualidade, infra) não precisam fazer nada: `paginas` vale 1 por padrão e o
 * avanço cai direto no próximo setor. Fábrica e Customer Service (slug
 * `helpdesk`, desde 07/08/2026) declaram 2 páginas via `registrarPaginas`.
 */
import { createContext, useContext, useEffect } from 'react';

export interface KioskRotationValue {
  /** Página interna corrente do setor exibido (0-based). */
  pagina: number;
  /** Quantas páginas o setor corrente tem. 1 = sem páginas internas. */
  paginas: number;
  /** Rotação automática ligada (config do dialog). */
  rotacaoLigada: boolean;
  /** Pausado pelo operador. */
  pausado: boolean;
  /** Declara quantas páginas o setor corrente tem. Chamar no mount da view. */
  registrarPaginas: (n: number) => void;
}

/**
 * Fora do modo TV o contexto não existe: a view renderiza a primeira página e
 * fica parada. É o comportamento correto — a rotação é um recurso do telão.
 */
const PADRAO_SEM_PROVIDER: KioskRotationValue = {
  pagina: 0,
  paginas: 1,
  rotacaoLigada: false,
  pausado: false,
  registrarPaginas: () => {},
};

export const KioskRotationContext = createContext<KioskRotationValue>(PADRAO_SEM_PROVIDER);

export function useKioskRotation(): KioskRotationValue {
  return useContext(KioskRotationContext);
}

/**
 * Açúcar para a view: declara o número de páginas e devolve a página corrente.
 * O registro é feito em efeito para não gerar setState durante o render do pai.
 */
export function usePaginaKiosk(totalPaginas: number): number {
  const { pagina, registrarPaginas } = useKioskRotation();

  useEffect(() => {
    registrarPaginas(totalPaginas);
    // Ao desmontar, o setor deixa de ter páginas internas.
    return () => registrarPaginas(1);
  }, [totalPaginas, registrarPaginas]);

  // Enquanto o registro não chega ao pai (primeiro render), a página corrente
  // pode estar fora do intervalo deste setor — clampa para não renderizar vazio.
  return Math.min(pagina, Math.max(0, totalPaginas - 1));
}
