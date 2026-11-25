import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_DEST_STATES, QA_ORIGIN_STATES } from '@/lib/qaRework';
import { VW_FABRICA_COLUNAS, VW_FABRICA_COLUNAS_ENXUTAS, WI_COLUNAS_MESA, WI_COLUNAS_TELAO } from '@/hooks/useFabricaKpis';

/**
 * Retorno QA = tag OU volta do teste pelo histórico (24/11/2026, regra do Igor).
 * A regra mora em três lugares que precisam andar juntos: a foto e a série
 * diária no banco, o campo calculado que o front lê, e o módulo da Qualidade
 * (`qaRework.ts`). Este teste lê a migration MAIS RECENTE de cada função.
 */
const DIR = resolve(__dirname, '../../supabase/migrations');
const ARQUIVOS = readdirSync(DIR).filter((n) => /^\d+_.*\.sql$/.test(n)).sort().reverse();

function corpoMaisRecente(assinatura: string): string {
  const arquivo = ARQUIVOS.find((n) => readFileSync(resolve(DIR, n), 'utf8').includes(assinatura));
  expect(arquivo, assinatura).toBeTruthy();
  const sql = readFileSync(resolve(DIR, arquivo!), 'utf8');
  const corpo = sql.slice(sql.indexOf(assinatura));
  return corpo.slice(0, corpo.indexOf('$function$;'));
}

const lista = (corpo: string, campo: 'oldValue' | 'newValue') => {
  const m = corpo.match(new RegExp(`'${campo}'\\)\\) IN \\(([^)]*)\\)`));
  expect(m, campo).toBeTruthy();
  return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
};

describe('Retorno QA pelo histórico', () => {
  it('a volta do teste no SQL é a mesma régua do módulo da Qualidade (inclui "new")', () => {
    const corpo = corpoMaisRecente('FUNCTION public.fn_retorno_qa_hist(');
    expect(lista(corpo, 'oldValue')).toEqual([...QA_ORIGIN_STATES].sort());
    expect(lista(corpo, 'newValue')).toEqual([...DEV_DEST_STATES].sort());
    expect(DEV_DEST_STATES.has('new')).toBe(true);
  });

  it('a foto e a série diária classificam com o histórico, no corte de cada uma', () => {
    for (const fn of ['FUNCTION public.rpc_reconstruct_sprint_snapshot(', 'FUNCTION public.rpc_capture_sprint_daily_progress_at(']) {
      const corpo = corpoMaisRecente(fn);
      const linhaCat = corpo.split('\n').filter((l) => l.includes('fn_classifica_demanda(') && /\) AS cat,/.test(l));
      expect(linhaCat, fn).toHaveLength(1);
      expect(linhaCat[0], fn).toMatch(/[a-z]\.state_history, v_as_of\) AS cat,/);
    }
  });

  it('toda leitura de item da Fábrica traz o campo calculado (sem ele a sprint em andamento diverge da foto)', () => {
    for (const cols of [VW_FABRICA_COLUNAS, VW_FABRICA_COLUNAS_ENXUTAS, WI_COLUNAS_MESA, WI_COLUNAS_TELAO]) {
      expect(cols.split(',').map((c) => c.trim())).toContain('retorno_qa_hist');
    }
  });
});
