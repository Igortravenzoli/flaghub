/**
 * PostgREST falso, em memória, para testes de hooks que leem a Supabase.
 *
 * Cobre o subconjunto do query builder do supabase-js que os hooks de KPI usam
 * (select/eq/in/ilike/gte/lte/not/order/limit/range/maybeSingle e rpc) e aplica a
 * PROJEÇÃO do `select`: a linha devolvida só tem as colunas pedidas. É isso que
 * permite provar que um select enxuto não perdeu coluna que a tela lê — com um
 * mock que devolve a linha inteira, o teste passaria mesmo com a coluna fora.
 *
 * Coluna pedida que a tabela não tem vira erro, como no PostgREST.
 * `max_rows` de 1000 é respeitado: sem `range`, a resposta é cortada em 1000.
 */

export type Linha = Record<string, unknown>;

export interface RegistroConsulta {
  tabela: string;
  select: string;
  linhas: number;
}

export interface FakePostgrest {
  supabase: {
    from: (tabela: string) => unknown;
    rpc: (nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  /** Toda resposta servida, em ordem. */
  consultas: RegistroConsulta[];
}

const MAX_ROWS = 1000;

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function criarFakePostgrest(
  tabelas: Record<string, Linha[]>,
  rpcs: Record<string, (args: Record<string, unknown>) => unknown[]> = {},
): FakePostgrest {
  const consultas: RegistroConsulta[] = [];

  const from = (tabela: string) => {
    const base = tabelas[tabela];
    if (!base) throw new Error(`tabela desconhecida no fake: ${tabela}`);
    const colunasDaTabela = new Set(base.flatMap((l) => Object.keys(l)));
    let linhas = [...base];
    let select = '*';
    let faixa: [number, number] | null = null;
    let limite: number | null = null;
    let unica = false;

    const builder: Record<string, unknown> = {
      select: (s = '*') => { select = s; return builder; },
      eq: (c: string, v: unknown) => { linhas = linhas.filter((l) => l[c] === v); return builder; },
      in: (c: string, vs: unknown[]) => { linhas = linhas.filter((l) => vs.includes(l[c])); return builder; },
      gte: (c: string, v: string) => { linhas = linhas.filter((l) => l[c] != null && String(l[c]) >= v); return builder; },
      lte: (c: string, v: string) => { linhas = linhas.filter((l) => l[c] != null && String(l[c]) <= v); return builder; },
      ilike: (c: string, padrao: string) => {
        const re = new RegExp(`^${padrao.split('%').map(escaparRegex).join('.*')}$`, 'i');
        linhas = linhas.filter((l) => typeof l[c] === 'string' && re.test(l[c] as string));
        return builder;
      },
      not: (c: string, op: string, v: unknown) => {
        if (op === 'is' && v === null) linhas = linhas.filter((l) => l[c] != null);
        else if (op === 'in') {
          const vs = String(v).slice(1, -1).split(',');
          linhas = linhas.filter((l) => l[c] != null && !vs.includes(String(l[c])));
        } else throw new Error(`not(${op}) não suportado no fake`);
        return builder;
      },
      order: (c: string, opts?: { ascending?: boolean }) => {
        const asc = opts?.ascending ?? true;
        linhas = [...linhas].sort((a, b) => {
          const x = a[c] as string | number | null | undefined;
          const y = b[c] as string | number | null | undefined;
          if (x == null && y == null) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
        return builder;
      },
      limit: (n: number) => { limite = n; return builder; },
      range: (de: number, ate: number) => { faixa = [de, ate]; return builder; },
      maybeSingle: () => { unica = true; return builder; },
      then: (ok: (r: unknown) => unknown, falha?: (e: unknown) => unknown) => {
        const resultado = (() => {
          const colunas = select.trim() === '*'
            ? null
            : select.split(',').map((c) => c.trim()).filter(Boolean);
          for (const c of colunas ?? []) {
            if (!colunasDaTabela.has(c)) {
              return { data: null, error: { message: `column ${tabela}.${c} does not exist` } };
            }
          }
          let fatia = linhas;
          if (faixa) fatia = fatia.slice(faixa[0], Math.min(faixa[1] + 1, faixa[0] + MAX_ROWS));
          else fatia = fatia.slice(0, MAX_ROWS);
          if (limite != null) fatia = fatia.slice(0, limite);
          const projetadas = fatia.map((l) => {
            if (!colunas) return { ...l };
            const out: Linha = {};
            for (const c of colunas) out[c] = l[c] ?? null;
            return out;
          });
          consultas.push({ tabela, select, linhas: projetadas.length });
          if (unica) return { data: projetadas[0] ?? null, error: null };
          return { data: projetadas, error: null };
        })();
        return Promise.resolve(resultado).then(ok, falha);
      },
    };
    return builder;
  };

  const rpc = async (nome: string, args: Record<string, unknown>) => {
    const fn = rpcs[nome];
    if (!fn) return { data: null, error: { message: `rpc desconhecida no fake: ${nome}` } };
    const data = fn(args);
    consultas.push({ tabela: `rpc:${nome}`, select: '', linhas: data.length });
    return { data, error: null };
  };

  return { supabase: { from, rpc }, consultas };
}
