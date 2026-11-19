import { describe, expect, it } from 'vitest';
import { detectarNavegador, instrucaoDe, motivoParaAbrir, ultimoCorteSemSinal } from '@/lib/timerAbaCongelada';
import type { TrechoFechado } from '@/lib/timerRelogio';

const UA = {
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};

describe('detectarNavegador', () => {
  it('separa Edge, Firefox e Chromium (Brave entra como Chrome)', () => {
    expect(detectarNavegador(UA.chrome)).toBe('chromium');
    expect(detectarNavegador(UA.edge)).toBe('edge');
    expect(detectarNavegador(UA.firefox)).toBe('firefox');
    expect(detectarNavegador(UA.opera)).toBe('outro');
    expect(detectarNavegador(UA.safari)).toBe('outro');
  });
  it('navegador desconhecido cai nas instruções do Chrome', () => {
    expect(instrucaoDe('outro').id).toBe('chromium');
    expect(instrucaoDe('firefox').instalaAppWeb).toBe(false);
  });
});

const trecho = (o: Partial<TrechoFechado>): TrechoFechado => ({
  id: 'a',
  work_item_id: 100,
  titulo: 'x',
  tipo: 'Task',
  projeto: null,
  iniciado_em: '2026-11-19T12:00:00Z',
  encerrado_em: '2026-11-19T12:20:00Z',
  encerrado_original_em: null,
  motivo_fim: 'manual',
  descartado: false,
  ...o,
});

describe('ultimoCorteSemSinal', () => {
  it('pega o corte sem sinal mais recente e ignora os outros motivos e os descartados', () => {
    const lista = [
      trecho({ id: 'velho', motivo_fim: 'sem_sinal', encerrado_em: '2026-11-19T10:00:00Z' }),
      trecho({ id: 'novo', motivo_fim: 'sem_sinal', encerrado_em: '2026-11-19T13:00:00Z' }),
      trecho({ id: 'manual', encerrado_em: '2026-11-19T14:00:00Z' }),
      trecho({ id: 'descartado', motivo_fim: 'sem_sinal', descartado: true, encerrado_em: '2026-11-19T15:00:00Z' }),
    ];
    expect(ultimoCorteSemSinal(lista)?.id).toBe('novo');
    expect(ultimoCorteSemSinal([trecho({})])).toBeNull();
  });
});

describe('motivoParaAbrir', () => {
  const base = { abaComum: true, naoExibir: false, corte: null, corteVisto: null, rodando: false, vistoNaSessao: false };
  const corte = trecho({ id: 'c1', motivo_fim: 'sem_sinal' });

  it('avisa o corte ainda não visto, antes do aviso de rodando', () => {
    expect(motivoParaAbrir({ ...base, corte, rodando: true })).toBe('corte');
    expect(motivoParaAbrir({ ...base, corte, corteVisto: 'c1' })).toBeNull();
  });
  it('com timer rodando, avisa uma vez por sessão', () => {
    expect(motivoParaAbrir({ ...base, rodando: true })).toBe('rodando');
    expect(motivoParaAbrir({ ...base, rodando: true, vistoNaSessao: true })).toBeNull();
    expect(motivoParaAbrir(base)).toBeNull();
  });
  it('"Não exibir novamente", app desktop e app web instalado nunca abrem sozinhos', () => {
    expect(motivoParaAbrir({ ...base, corte, rodando: true, naoExibir: true })).toBeNull();
    expect(motivoParaAbrir({ ...base, corte, rodando: true, abaComum: false })).toBeNull();
  });
});
