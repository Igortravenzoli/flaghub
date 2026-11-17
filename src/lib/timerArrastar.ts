/**
 * Arrastar uma anotação para dentro de um PBI/Bug cria a Task ali (pedido do
 * Igor, 17/11/2026). O dado viaja no DataTransfer com um tipo próprio, para a
 * árvore só aceitar o que veio da coluna de anotações.
 */
export const MIME_ANOTACAO = 'application/x-timer-anotacao';

export interface AnotacaoArrastada {
  id: string;
  texto: string;
}

type Escrita = Pick<DataTransfer, 'setData'> & { effectAllowed?: DataTransfer['effectAllowed'] };

export function escreverArrasto(dt: Escrita, a: AnotacaoArrastada): void {
  dt.setData(MIME_ANOTACAO, JSON.stringify({ id: a.id, texto: a.texto }));
  // texto puro também: soltar fora (num editor) cola o texto da anotação
  dt.setData('text/plain', a.texto);
  dt.effectAllowed = 'copy';
}

/** É uma anotação sendo arrastada? (no dragover só os tipos são legíveis) */
export function ehArrastoDeAnotacao(dt: Pick<DataTransfer, 'types'> | null | undefined): boolean {
  return !!dt && Array.from(dt.types ?? []).includes(MIME_ANOTACAO);
}

export function lerArrasto(dt: Pick<DataTransfer, 'getData'> | null | undefined): AnotacaoArrastada | null {
  try {
    const bruto = dt?.getData(MIME_ANOTACAO);
    if (!bruto) return null;
    const v = JSON.parse(bruto) as Partial<AnotacaoArrastada>;
    if (typeof v.id !== 'string' || !v.id || typeof v.texto !== 'string' || !v.texto.trim()) return null;
    return { id: v.id, texto: v.texto };
  } catch {
    return null;
  }
}

/** Só PBI e Bug recebem Task. */
export const recebeTask = (tipo: string | null | undefined) => tipo === 'Product Backlog Item' || tipo === 'Bug';
