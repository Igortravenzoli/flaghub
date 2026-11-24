import { useCallback, useEffect, useState } from 'react';

/**
 * Como os gráficos de Desempenho mostram o número de cada ponto (24/11/2026):
 * - `percentual`: % do escopo da sprint (a régua dos indicadores);
 * - `quantidade`: quantos itens (encerrados, bugs, retornos).
 * "33" em percentual com escopo de 3 é 1 item — com escopo pequeno a leitura
 * em % engana, e a quantidade tira a dúvida.
 */
export type ModoValor = 'percentual' | 'quantidade';

const CHAVE = 'fabrica.modoValor';
const EVENTO = 'fabrica:modo-valor';

function ler(): ModoValor {
  try {
    return window.localStorage.getItem(CHAVE) === 'quantidade' ? 'quantidade' : 'percentual';
  } catch {
    return 'percentual';
  }
}

/**
 * Escolha do leitor, lembrada no navegador dele e igual em todos os cards da
 * tela (trocar num troca nos outros). Sem armazenamento, começa em percentual.
 */
export function useModoValor(): [ModoValor, (m: ModoValor) => void] {
  const [modo, setModo] = useState<ModoValor>(ler);
  useEffect(() => {
    const aoMudar = (e: Event) => setModo((e as CustomEvent<ModoValor>).detail);
    window.addEventListener(EVENTO, aoMudar);
    return () => window.removeEventListener(EVENTO, aoMudar);
  }, []);
  const trocar = useCallback((m: ModoValor) => {
    setModo(m);
    try {
      window.localStorage.setItem(CHAVE, m);
    } catch {
      /* sem armazenamento: vale só nesta tela */
    }
    window.dispatchEvent(new CustomEvent<ModoValor>(EVENTO, { detail: m }));
  }, []);
  return [modo, trocar];
}
