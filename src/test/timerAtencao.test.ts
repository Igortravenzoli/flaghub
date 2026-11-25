import { describe, expect, it } from 'vitest';
import { assumirAviso, CHAVE_ATENCAO, textoDoAviso } from '@/lib/timerAtencao';

const storageFalso = () => {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
    dados,
  };
};

describe('textoDoAviso', () => {
  it('pergunta de presença com uma tarefa: a tarefa e o prazo', () => {
    const t = textoDoAviso('presenca', [{ work_item_id: 19300, titulo: 'Refinamento KPI' }], 10);
    expect(t.titulo).toBe('Ainda está nesta tarefa? · Timer Flag');
    expect(t.corpo).toBe('#19300 Refinamento KPI\nResponda em até 10 min, ou o timer pausa.');
  });

  it('várias tarefas: plural, até três na lista e o resto contado', () => {
    const tarefas = [1, 2, 3, 4, 5].map((n) => ({ work_item_id: n, titulo: `Tarefa ${n}` }));
    const t = textoDoAviso('presenca', tarefas, 10);
    expect(t.titulo).toBe('Ainda está nestas tarefas? · Timer Flag');
    expect(t.corpo).toBe('#1 Tarefa 1\n#2 Tarefa 2\n#3 Tarefa 3\n+2\nResponda em até 10 min, ou os timers pausam.');
  });

  it('ausência: outra pergunta, prazo arredondado e nunca abaixo de 1 min', () => {
    expect(textoDoAviso('ausencia', [{ work_item_id: 7, titulo: 'X' }], 5).titulo).toBe('Você está aí? · Timer Flag');
    expect(textoDoAviso('ausencia', [], 0.2).corpo).toBe('Responda em até 1 min, ou o timer pausa.');
  });

  it('título longo é cortado para caber no aviso', () => {
    const t = textoDoAviso('presenca', [{ work_item_id: 1, titulo: 'a'.repeat(200) }], 10);
    expect(t.corpo.split('\n')[0]).toHaveLength(70);
  });
});

describe('assumirAviso', () => {
  it('a primeira janela fica com o aviso; a segunda, não', () => {
    const s = storageFalso();
    expect(assumirAviso('pres:1:a', s, new Set())).toBe(true);
    expect(s.dados.get(CHAVE_ATENCAO)).toBe('pres:1:a');
    expect(assumirAviso('pres:1:a', s, new Set())).toBe(false);
  });

  it('a mesma janela religando a mesma pergunta continua dona', () => {
    const s = storageFalso();
    const minhas = new Set<string>();
    expect(assumirAviso('pres:1:a', s, minhas)).toBe(true);
    expect(assumirAviso('pres:1:a', s, minhas)).toBe(true);
  });

  it('pergunta nova troca a marca e volta a avisar', () => {
    const s = storageFalso();
    assumirAviso('pres:1:a', s, new Set());
    expect(assumirAviso('pres:1:b', s, new Set())).toBe(true);
    expect(s.dados.get(CHAVE_ATENCAO)).toBe('pres:1:b');
  });

  it('sem storage, ou com storage que falha, avisa assim mesmo', () => {
    expect(assumirAviso('x', null, new Set())).toBe(true);
    const quebrado = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => undefined,
    };
    expect(assumirAviso('x', quebrado, new Set())).toBe(true);
  });
});
