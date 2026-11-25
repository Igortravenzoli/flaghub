import { useCallback, useEffect, useRef, useState } from 'react';
import type { MotorTimer } from '@/hooks/useTimerRelogio';
import { entrouTimerNovo, proximoExibido, timerExibido } from '@/lib/timerMini';

/**
 * O timer que o mini mostra quando há mais de um rodando (paralelo): um por
 * vez, o clique no "1/2" passa ao próximo. Ao começar um timer novo, o mini
 * volta a mostrar o mais recente.
 */
export function useTimerExibido(motor: MotorTimer) {
  const { rodandoTodos, segundosDe } = motor;
  const [preferido, setPreferido] = useState<number | null>(null);
  const anteriores = useRef<number[]>([]);

  useEffect(() => {
    const ids = rodandoTodos.map((r) => r.work_item_id);
    if (entrouTimerNovo(anteriores.current, ids)) setPreferido(null);
    anteriores.current = ids;
  }, [rodandoTodos]);

  const { item: exibido, posicao } = timerExibido(rodandoTodos, preferido);
  const atual = exibido?.work_item_id ?? null;
  const proximo = useCallback(() => setPreferido(proximoExibido(rodandoTodos, atual)), [rodandoTodos, atual]);

  return {
    /** o timer à vista (null = nada rodando) */
    exibido,
    /** posição dele entre os que rodam, a partir de 0 */
    posicao,
    total: rodandoTodos.length,
    /** relógio do que está à vista: o que ele tem a lançar hoje + o trecho atual */
    segundos: exibido ? segundosDe(exibido) : 0,
    proximo,
  };
}
