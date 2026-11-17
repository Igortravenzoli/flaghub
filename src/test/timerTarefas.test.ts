import { describe, expect, it } from 'vitest';
import {
  acharIteracao,
  caminhoDoNo,
  descricaoHtml,
  ehRaiz,
  hojeSaoPaulo,
  idsDaWiql,
  idsDosFilhos,
  interpretarBusca,
  literalWiql,
  paraItem,
  sprintOficial,
  validarCriacao,
  wiqlBusca,
  wiqlMinhas,
} from '../../supabase/functions/timer-devops/tarefas';
import { getCurrentOfficialSprintCode } from '@/lib/sprintCalendar';
import { caminhoDe, gravarSelecao, lerSelecao } from '@/lib/timerSelecao';

describe('sprintOficial (edge) = getCurrentOfficialSprintCode (front)', () => {
  it('dá o mesmo código em todos os dias de 2025 a 2027', () => {
    const divergencias: string[] = [];
    for (let d = new Date(2025, 0, 1); d.getFullYear() < 2028; d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const front = getCurrentOfficialSprintCode(new Date(d));
      if (sprintOficial(iso) !== front) divergencias.push(`${iso}: ${sprintOficial(iso)} ≠ ${front}`);
    }
    expect(divergencias).toEqual([]);
  });

  it('usa a data de São Paulo, não a UTC', () => {
    // 02:00 UTC de 17/11 ainda é 16/11 em São Paulo
    expect(hojeSaoPaulo(new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16');
  });
});

describe('WIQL', () => {
  it('escapa aspas e remove controle', () => {
    expect(literalWiql("d'Ávila")).toBe("'d''Ávila'");
    expect(literalWiql("a\u0000b")).toBe("'a b'");
    expect(literalWiql('x'.repeat(150))).toHaveLength(102);
  });

  it('minhas filtra pelo e-mail, tipos atribuíveis e estados abertos', () => {
    const q = wiqlMinhas("dev@flag.com.br' OR 1=1 --");
    expect(q).toContain("[System.AssignedTo] = 'dev@flag.com.br'' OR 1=1 --'");
    expect(q).toContain("'Product Backlog Item', 'Bug', 'Task'");
    expect(q).toContain("NOT IN ('Done', 'Closed', 'Removed')");
  });

  it('busca por título usa CONTAINS e exclui Removed', () => {
    expect(wiqlBusca('login')).toContain("[System.Title] CONTAINS 'login'");
    expect(wiqlBusca('login')).toContain("<> 'Removed'");
  });
});

describe('interpretarBusca', () => {
  it('número exato com ou sem #, texto com 3+ letras', () => {
    expect(interpretarBusca('#16603')).toEqual({ tipo: 'id', id: 16603 });
    expect(interpretarBusca(' 42 ')).toEqual({ tipo: 'id', id: 42 });
    expect(interpretarBusca('ab')).toEqual({ tipo: 'curta' });
    expect(interpretarBusca('#ab')).toEqual({ tipo: 'curta' });
    expect(interpretarBusca('login sso')).toEqual({ tipo: 'texto', texto: 'login sso' });
    expect(interpretarBusca(undefined)).toEqual({ tipo: 'curta' });
  });
});

describe('respostas do Azure', () => {
  it('converte o item do batch', () => {
    const item = paraItem({
      id: 101,
      fields: {
        'System.Title': 'Tela de login',
        'System.State': 'In Progress',
        'System.WorkItemType': 'Task',
        'System.Parent': 100,
        'System.IterationPath': 'Flag.Planejamento\\S23-2026',
        'System.AreaPath': 'Flag.Planejamento\\Fabrica',
        'System.TeamProject': 'Flag.Planejamento',
        'System.Tags': 'X; Y',
      },
    });
    expect(item).toMatchObject({
      id: 101,
      parent_id: 100,
      work_item_type: 'Task',
      web_url: 'https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit/101',
      area_path: 'Flag.Planejamento\\Fabrica',
    });
    expect(paraItem({ fields: {} })).toBeNull();
  });

  it('lê ids da WIQL com teto e os filhos só da origem', () => {
    expect(idsDaWiql({ workItems: [{ id: 1 }, { id: 2 }, { id: 3 }] }, 2)).toEqual({ ids: [1, 2], truncado: true });
    expect(idsDaWiql(null, 5)).toEqual({ ids: [], truncado: false });
    const links = {
      workItemRelations: [
        { source: null, target: { id: 10 } },
        { source: { id: 10 }, target: { id: 11 } },
        { source: { id: 10 }, target: { id: 12 } },
        { source: { id: 99 }, target: { id: 13 } },
      ],
    };
    expect(idsDosFilhos(links, 10)).toEqual([11, 12]);
  });
});

describe('criação', () => {
  it('valida tipo, título e pai', () => {
    expect(validarCriacao({ tipo: 'Task', titulo: '  Ajustar   tela ', paiId: 5 })).toEqual({
      ok: true,
      tipo: 'Task',
      titulo: 'Ajustar tela',
      paiId: 5,
      descricao: null,
    });
    expect(validarCriacao({ tipo: 'PBI', titulo: 'Novo fluxo', paiId: '7' })).toMatchObject({ ok: true, tipo: 'Product Backlog Item', paiId: 7 });
    expect(validarCriacao({ tipo: 'Epic', titulo: 'x', paiId: 1 })).toEqual({ ok: false, motivo: 'tipo_invalido' });
    expect(validarCriacao({ tipo: 'Task', titulo: 'ab', paiId: 1 })).toEqual({ ok: false, motivo: 'titulo_invalido' });
    expect(validarCriacao({ tipo: 'Task', titulo: 'abc', paiId: -1 })).toEqual({ ok: false, motivo: 'pai_invalido' });
  });

  it('escapa a descrição', () => {
    expect(descricaoHtml('<b>oi</b>\n\nfim')).toBe('<div>&lt;b&gt;oi&lt;/b&gt;</div><div><br></div><div>fim</div>');
  });

  it('acha a iteração da sprint pelo nome e converte o caminho', () => {
    const raiz = {
      name: 'Flag.Planejamento',
      path: '\\Flag.Planejamento\\Iteration',
      children: [
        { name: '2026', path: '\\Flag.Planejamento\\Iteration\\2026', children: [
          { name: 'S22-2026', path: '\\Flag.Planejamento\\Iteration\\2026\\S22-2026' },
          { name: 'Sprint S23-2026', path: '\\Flag.Planejamento\\Iteration\\2026\\Sprint S23-2026' },
        ] },
      ],
    };
    expect(acharIteracao(raiz, 's23-2026')).toBe('Flag.Planejamento\\2026\\Sprint S23-2026');
    expect(acharIteracao(raiz, 'S99-2026')).toBeNull();
    expect(caminhoDoNo('\\P\\Iteration\\X')).toBe('P\\X');
    expect(ehRaiz('Flag.Planejamento')).toBe(true);
    expect(ehRaiz('Flag.Planejamento\\S23-2026')).toBe(false);
  });
});

describe('seleção do Timer', () => {
  it('monta o caminho pelos ancestrais', () => {
    const m = new Map([
      [1, { id: 1, title: 'Epic A', parent_id: null }],
      [2, { id: 2, title: 'Feature B', parent_id: 1 }],
      [3, { id: 3, title: 'PBI C', parent_id: 2 }],
    ]);
    expect(caminhoDe({ id: 4, title: 'Task', parent_id: 3 }, m)).toBe('Epic A › Feature B › PBI C');
    expect(caminhoDe({ id: 5, title: 'Solta', parent_id: null }, m)).toBeNull();
  });

  it('guarda e relê, recusando lixo e link de fora do DevOps', () => {
    const mem = new Map<string, string>();
    const s = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    gravarSelecao({ id: 7, title: 'T', work_item_type: 'Task', caminho: null, web_url: 'https://evil.com/x' }, s);
    expect(lerSelecao(s)).toMatchObject({ id: 7, web_url: null });
    mem.set('timer-flag:tarefa-selecionada', '{"id":"x"}');
    expect(lerSelecao(s)).toBeNull();
    gravarSelecao(null, s);
    expect(lerSelecao(s)).toBeNull();
  });
});

describe('modo paralelo (preferência do navegador)', () => {
  it('liga, desliga e não quebra sem storage', async () => {
    const { lerModoParalelo, gravarModoParalelo } = await import('@/lib/timerSelecao');
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(lerModoParalelo(st)).toBe(false);
    gravarModoParalelo(true, st);
    expect(lerModoParalelo(st)).toBe(true);
    gravarModoParalelo(false, st);
    expect(lerModoParalelo(st)).toBe(false);
    expect(lerModoParalelo(null)).toBe(false);
  });
});
