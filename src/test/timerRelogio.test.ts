import { describe, expect, it } from 'vitest';
import {
  desvioServidor,
  devePerguntarPresenca,
  duracaoSeg,
  foiAutomatico,
  horaCurta,
  horaNoDia,
  horas,
  houveSuspensao,
  lerEstado,
  mensagemErroTimer,
  presencaPerguntarEm,
  presencaPrazo,
  REGRAS_PADRAO,
  relogio,
  segundosRodando,
  sinalDevido,
  totalHojeSeg,
  type TrechoRodando,
} from '@/lib/timerRelogio';

const rodando = (over: Partial<TrechoRodando> = {}): TrechoRodando => ({
  id: 'x',
  work_item_id: 123,
  titulo: 'Tarefa',
  tipo: 'Task',
  projeto: null,
  iniciado_em: '2026-11-16T13:00:00.000Z',
  ultimo_sinal_em: '2026-11-16T13:00:00.000Z',
  ultima_presenca_em: '2026-11-16T13:00:00.000Z',
  ...over,
});
const t = (iso: string) => Date.parse(iso);

describe('lerEstado', () => {
  it('preenche o que falta com as regras padrão', () => {
    const e = lerEstado({ agora: '2026-11-16T13:00:00Z', rodando: null, trechos: [], fechado_hoje_seg: '120' });
    expect(e.regras).toEqual(REGRAS_PADRAO);
    expect(e.fechado_hoje_seg).toBe(120);
    expect(e.rodando).toBeNull();
  });

  it('aguenta resposta vazia', () => {
    const e = lerEstado(null);
    expect(e.trechos).toEqual([]);
    expect(e.rodando).toBeNull();
  });

  it('as regras do servidor valem sobre as padrão', () => {
    const e = lerEstado({ regras: { ...REGRAS_PADRAO, sinal_seg: 120 } });
    expect(e.regras.sinal_seg).toBe(120);
  });
});

describe('tempo no relógio do servidor', () => {
  it('desvio = servidor − máquina', () => {
    expect(desvioServidor('2026-11-16T13:00:10.000Z', t('2026-11-16T13:00:00.000Z'))).toBe(10_000);
    expect(desvioServidor('lixo', 0)).toBe(0);
  });

  it('segundos rodando contam do início carimbado pelo servidor', () => {
    expect(segundosRodando(rodando(), t('2026-11-16T13:01:30.000Z'))).toBe(90);
    expect(segundosRodando(rodando(), t('2026-11-16T12:59:00.000Z'))).toBe(0);
    expect(segundosRodando(null, Date.now())).toBe(0);
  });

  it('total do dia = fechado + rodando', () => {
    const e = lerEstado({ rodando: rodando(), fechado_hoje_seg: 600 });
    expect(totalHojeSeg(e, t('2026-11-16T13:10:00.000Z'))).toBe(1200);
  });

  it('duração de trecho fechado', () => {
    expect(duracaoSeg({ iniciado_em: '2026-11-16T13:00:00Z', encerrado_em: '2026-11-16T14:30:00Z' })).toBe(5400);
  });
});

describe('presença e sinal', () => {
  it('pergunta aos 60 min e o prazo vai a 70', () => {
    const r = rodando();
    expect(presencaPerguntarEm(r, REGRAS_PADRAO)).toBe(t('2026-11-16T14:00:00.000Z'));
    expect(presencaPrazo(r, REGRAS_PADRAO)).toBe(t('2026-11-16T14:10:00.000Z'));
    expect(devePerguntarPresenca(r, REGRAS_PADRAO, t('2026-11-16T13:59:59.000Z'))).toBe(false);
    expect(devePerguntarPresenca(r, REGRAS_PADRAO, t('2026-11-16T14:00:00.000Z'))).toBe(true);
    expect(devePerguntarPresenca(null, REGRAS_PADRAO, Date.now())).toBe(false);
  });

  it('sinal a cada 5 min desde o último registrado', () => {
    const r = rodando({ ultimo_sinal_em: '2026-11-16T13:20:00.000Z' });
    expect(sinalDevido(r, REGRAS_PADRAO, t('2026-11-16T13:24:59.000Z'))).toBe(false);
    expect(sinalDevido(r, REGRAS_PADRAO, t('2026-11-16T13:25:00.000Z'))).toBe(true);
    expect(sinalDevido(null, REGRAS_PADRAO, Date.now())).toBe(false);
  });

  it('suspensão: lacuna entre tiques acima de 3 min (aba oculta tica 1x/min)', () => {
    expect(houveSuspensao(0, 61_000)).toBe(false);
    expect(houveSuspensao(0, 180_000)).toBe(false);
    expect(houveSuspensao(0, 180_001)).toBe(true);
  });
});

describe('textos', () => {
  it('relógio e horas', () => {
    expect(relogio(0)).toBe('00:00:00');
    expect(relogio(3723)).toBe('01:02:03');
    expect(relogio(-5)).toBe('00:00:00');
    expect(horas(59)).toBe('0min');
    expect(horas(45 * 60)).toBe('45min');
    expect(horas(3 * 3600 + 5 * 60)).toBe('3h 05min');
  });

  it('hora curta em São Paulo', () => {
    expect(horaCurta('2026-11-16T13:05:00.000Z')).toBe('10:05');
  });

  it('cortes automáticos x da pessoa', () => {
    expect(foiAutomatico('sem_confirmacao')).toBe(true);
    expect(foiAutomatico('sem_sinal')).toBe(true);
    expect(foiAutomatico('manual')).toBe(false);
    expect(foiAutomatico('suspensao')).toBe(false);
  });

  it('erro do RAISE vira mensagem amigável', () => {
    expect(mensagemErroTimer({ message: 'timer_limite_dia' })).toMatch(/12 h/);
    expect(mensagemErroTimer({ message: 'timer_correcao_so_reduz' })).toMatch(/encurtar/);
    expect(mensagemErroTimer(new Error('fetch failed'))).toMatch(/servidor/);
    expect(mensagemErroTimer(null)).toMatch(/servidor/);
  });
});

describe('horaNoDia (correção do fim)', () => {
  it('monta a hora no dia do trecho, em São Paulo', () => {
    expect(horaNoDia('2026-11-16T13:00:00.000Z', '10:45')).toBe('2026-11-16T13:45:00.000Z');
    // 23:30 em SP ainda é o dia 16 lá, embora já seja 17 em UTC
    expect(horaNoDia('2026-11-17T02:30:00.000Z', '23:40')).toBe('2026-11-17T02:40:00.000Z');
  });

  it('recusa hora inválida', () => {
    expect(horaNoDia('2026-11-16T13:00:00.000Z', '24:00')).toBeNull();
    expect(horaNoDia('2026-11-16T13:00:00.000Z', '10:60')).toBeNull();
    expect(horaNoDia('2026-11-16T13:00:00.000Z', 'abc')).toBeNull();
  });
});
