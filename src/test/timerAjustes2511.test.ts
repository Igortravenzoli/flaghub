import { describe, expect, it } from 'vitest';
import { destinoDoEncerrar, estadosDoTipo, TIPOS_QUE_ANDAM } from '../../supabase/functions/timer-devops/tarefas';
import { destinoPadrao, MANTER_ESTADO, opcoesDeDestino } from '@/lib/timerEstadoItem';
import { dicaParalelos, entrouTimerNovo, proximoExibido, selecaoAberta, timerExibido } from '@/lib/timerMini';
import { lerPedidoEncerrar } from '@/lib/timerDesktop';
import { urlWorkItem } from '@/lib/timerSelecao';

// Os estados do PBI na Flag (print do Igor, 25/11/2026), como a API do DevOps devolve.
const PBI_FLAG = {
  value: [
    { name: 'New', category: 'Proposed' },
    { name: 'Em desenvolvimento', category: 'InProgress' },
    { name: 'Aguardando Teste', category: 'InProgress' },
    { name: 'Em Teste', category: 'InProgress' },
    { name: 'Aguardando Deploy', category: 'InProgress' },
    { name: 'Done', category: 'Completed' },
    { name: 'Removed', category: 'Removed' },
  ],
};
const TASK = { value: [{ name: 'To Do', category: 'Proposed' }, { name: 'In Progress', category: 'InProgress' }, { name: 'Done', category: 'Completed' }, { name: 'Removed', category: 'Removed' }] };

describe('encerrar PBI/Bug pelo Timer: o destino no DevOps (edge)', () => {
  it('Task, PBI e Bug andam; Epic e Feature não', () => {
    expect(TIPOS_QUE_ANDAM).toEqual(['Task', 'Product Backlog Item', 'Bug']);
  });

  it('lista os estados do tipo na ordem do fluxo, sem Removed', () => {
    expect(estadosDoTipo(PBI_FLAG).map((e) => e.nome)).toEqual([
      'New',
      'Em desenvolvimento',
      'Aguardando Teste',
      'Em Teste',
      'Aguardando Deploy',
      'Done',
    ]);
    // a categoria manda mesmo se o DevOps devolver fora de ordem
    const baguncado = { value: [{ name: 'Done', category: 'Completed' }, { name: 'New', category: 'Proposed' }, { name: 'Em Teste', category: 'InProgress' }] };
    expect(estadosDoTipo(baguncado).map((e) => e.nome)).toEqual(['New', 'Em Teste', 'Done']);
    expect(estadosDoTipo(null)).toEqual([]);
  });

  it('sem estado pedido: a Task vai para Done e o PBI não muda (front antigo segue igual)', () => {
    expect(destinoDoEncerrar('Task', undefined, TASK)).toEqual({ ok: true, destino: 'Done' });
    expect(destinoDoEncerrar('Product Backlog Item', undefined, PBI_FLAG)).toEqual({ ok: true, destino: null });
    expect(destinoDoEncerrar('Bug', '', PBI_FLAG)).toEqual({ ok: true, destino: null });
  });

  it('com estado pedido: só um estado do tipo, com a grafia do DevOps', () => {
    expect(destinoDoEncerrar('Product Backlog Item', 'Done', PBI_FLAG)).toEqual({ ok: true, destino: 'Done' });
    expect(destinoDoEncerrar('Product Backlog Item', ' aguardando teste ', PBI_FLAG)).toEqual({ ok: true, destino: 'Aguardando Teste' });
    expect(destinoDoEncerrar('Task', 'In Progress', TASK)).toEqual({ ok: true, destino: 'In Progress' });
  });

  it('recusa Removed, estado que não existe e lixo', () => {
    expect(destinoDoEncerrar('Product Backlog Item', 'Removed', PBI_FLAG)).toEqual({ ok: false, motivo: 'estado_invalido' });
    expect(destinoDoEncerrar('Product Backlog Item', 'Closed', PBI_FLAG)).toEqual({ ok: false, motivo: 'estado_invalido' });
    expect(destinoDoEncerrar('Product Backlog Item', 42, PBI_FLAG)).toEqual({ ok: false, motivo: 'estado_invalido' });
    expect(destinoDoEncerrar('Product Backlog Item', 'x'.repeat(101), PBI_FLAG)).toEqual({ ok: false, motivo: 'estado_invalido' });
  });
});

describe('encerrar PBI/Bug pelo Timer: o seletor do diálogo', () => {
  const info = (estado: string) => ({ estado, estados: estadosDoTipo(PBI_FLAG), concluido: 'Done' });

  it('oferece os outros estados, na ordem, e sugere Done', () => {
    expect(opcoesDeDestino(info('New'))).toEqual(['Em desenvolvimento', 'Aguardando Teste', 'Em Teste', 'Aguardando Deploy', 'Done']);
    expect(destinoPadrao(info('New'))).toBe('Done');
    expect(destinoPadrao(info('Aguardando Deploy'))).toBe('Done');
  });

  it('sem estado de conclusão entre as opções, o padrão é manter', () => {
    expect(destinoPadrao({ estado: 'New', estados: [{ nome: 'New', categoria: 'Proposed' }], concluido: 'Done' })).toBe(MANTER_ESTADO);
    expect(destinoPadrao({ estado: 'Done', estados: estadosDoTipo(PBI_FLAG), concluido: 'Done' })).toBe(MANTER_ESTADO);
    expect(destinoPadrao({ estado: 'New', estados: estadosDoTipo(PBI_FLAG), concluido: null })).toBe(MANTER_ESTADO);
  });
});

describe('mini timer: demanda encerrada sai e paralelos alternam', () => {
  const sel = { id: 19234, title: 'Evolução de Segurança' };

  it('parado, só oferece retomar a demanda que segue aberta', () => {
    expect(selecaoAberta(sel, [{ work_item_id: 19234 }, { work_item_id: 19281 }])).toBe(sel);
    // encerrou (ou deu Done): a escolha guardada não vale mais
    expect(selecaoAberta(sel, [{ work_item_id: 19281 }])).toBeNull();
    expect(selecaoAberta(sel, [])).toBeNull();
    // estado ainda não chegou do servidor: não oferece nada
    expect(selecaoAberta(sel, null)).toBeNull();
    expect(selecaoAberta(null, [{ work_item_id: 19234 }])).toBeNull();
  });

  const rodando = [
    { work_item_id: 30, titulo: 'C' },
    { work_item_id: 20, titulo: 'B' },
    { work_item_id: 10, titulo: 'A' },
  ];

  it('mostra o mais recente até a pessoa escolher outro; o que parou cede a vez', () => {
    expect(timerExibido(rodando, null)).toEqual({ item: rodando[0], posicao: 0 });
    expect(timerExibido(rodando, 10)).toEqual({ item: rodando[2], posicao: 2 });
    // o preferido foi pausado/encerrado: volta ao mais recente
    expect(timerExibido(rodando, 99)).toEqual({ item: rodando[0], posicao: 0 });
    expect(timerExibido([], 10)).toEqual({ item: null, posicao: -1 });
  });

  it('o clique no "1/3" dá a volta', () => {
    expect(proximoExibido(rodando, 30)).toBe(20);
    expect(proximoExibido(rodando, 20)).toBe(10);
    expect(proximoExibido(rodando, 10)).toBe(30);
    expect(proximoExibido(rodando, null)).toBe(30);
    expect(proximoExibido([], 10)).toBeNull();
  });

  it('timer novo traz o mini de volta ao mais recente; "lançar sem encerrar" não', () => {
    expect(entrouTimerNovo([10, 20], [30, 10, 20])).toBe(true);
    expect(entrouTimerNovo([10, 20], [20, 10])).toBe(false); // mesma turma, ordem nova
    expect(entrouTimerNovo([10, 20], [20])).toBe(false);
    expect(entrouTimerNovo([], [10])).toBe(true);
  });

  it('a dica lista todos os que rodam', () => {
    expect(dicaParalelos(rodando)).toBe('3 timers em paralelo (clique para ver o próximo):\n#30 C\n#20 B\n#10 A');
  });

  it('o pedido de encerrar do mini leva o tipo, quando há', () => {
    const agora = 1_800_000_000_000;
    const com = JSON.stringify({ id: 16687, titulo: 'Painéis', ts: agora - 1000, tipo: 'Product Backlog Item' });
    expect(lerPedidoEncerrar(com, agora)).toEqual({ id: 16687, titulo: 'Painéis', ts: agora - 1000, tipo: 'Product Backlog Item' });
    const lixo = JSON.stringify({ id: 16687, titulo: 'Painéis', ts: agora - 1000, tipo: 7 });
    expect(lerPedidoEncerrar(lixo, agora)).toEqual({ id: 16687, titulo: 'Painéis', ts: agora - 1000 });
  });
});

describe('link do #id para o Azure DevOps', () => {
  it('com o projeto vai direto; sem ele, o endereço da organização resolve', () => {
    expect(urlWorkItem(19037, 'Flag.Planejamento')).toBe('https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/19037');
    expect(urlWorkItem(19037, 'Projeto Novo')).toBe('https://dev.azure.com/FlagIW/Projeto%20Novo/_workitems/edit/19037');
    expect(urlWorkItem(19037, null)).toBe('https://dev.azure.com/FlagIW/_workitems/edit/19037');
    expect(urlWorkItem(19037)).toBe('https://dev.azure.com/FlagIW/_workitems/edit/19037');
  });
});
