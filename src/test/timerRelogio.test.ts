import { describe, expect, it } from 'vitest';
import {
  aLancarDoItem,
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
  referenciaPresenca,
  REGRAS_PADRAO,
  relogio,
  segundosRodando,
  sinalDevido,
  situacaoTrecho,
  totalHojeSeg,
  NOTA_LANCAMENTO_AUTO,
  type TrechoFechado,
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

const fechado = (over: Partial<TrechoFechado> = {}): TrechoFechado => ({
  id: Math.random().toString(36),
  work_item_id: 123,
  titulo: 'Tarefa',
  tipo: 'Task',
  projeto: null,
  iniciado_em: '2026-11-16T13:00:00.000Z',
  encerrado_em: '2026-11-16T13:10:00.000Z',
  encerrado_original_em: null,
  motivo_fim: 'manual',
  descartado: false,
  lancamento_id: null,
  ...over,
});

describe('a lançar (o relógio zera ao lançar)', () => {
  it('soma só o que não foi lançado nem descartado, do item', () => {
    const ts = [
      fechado({}), // 10 min a lançar
      fechado({ lancamento_id: 'l1', motivo_fim: 'parcial' }), // lançado: sai
      fechado({ descartado: true }), // descartado: sai
      fechado({ work_item_id: 9 }), // outro item: sai
    ];
    expect(aLancarDoItem(ts, 123)).toBe(600);
    expect(aLancarDoItem([fechado({ lancamento_id: 'l1', motivo_fim: 'parcial' })], 123)).toBe(0);
  });
});

describe('situacaoTrecho (Hora | Tempo | Situação)', () => {
  it('lançado pelo botão: só "Lançado"', () => {
    expect(situacaoTrecho(fechado({ lancamento_id: 'l1', motivo_fim: 'parcial' }), [{ id: 'l1', notas: null }])).toEqual({
      estado: 'lancado', rotulo: 'Lançado', detalhe: null, alerta: false,
    });
  });
  it('lançado às 23:50: "fim do dia"', () => {
    const s = situacaoTrecho(fechado({ lancamento_id: 'l1', motivo_fim: 'parcial' }), [{ id: 'l1', notas: NOTA_LANCAMENTO_AUTO }]);
    expect([s.rotulo, s.detalhe]).toEqual(['Lançado', 'fim do dia']);
  });
  it('a conexão caiu: "sem conexão", em destaque', () => {
    const s = situacaoTrecho(fechado({ lancamento_id: 'l1', motivo_fim: 'sem_sinal' }), []);
    expect(s).toEqual({ estado: 'lancado', rotulo: 'Lançado', detalhe: 'sem conexão', alerta: true });
  });
  it('a lançar e descartado', () => {
    expect(situacaoTrecho(fechado({ motivo_fim: 'manual' }), [])).toMatchObject({ estado: 'a_lancar', rotulo: 'A lançar', detalhe: 'pausa' });
    expect(situacaoTrecho(fechado({ descartado: true, motivo_fim: 'sem_sinal' }), [])).toMatchObject({ estado: 'descartado', alerta: false });
  });
});
describe('paralelo (TM9)', () => {
  const a = rodando({ id: 'a', work_item_id: 1, iniciado_em: '2026-11-16T13:00:00.000Z', ultimo_sinal_em: '2026-11-16T13:20:00.000Z', ultima_presenca_em: '2026-11-16T13:00:00.000Z' });
  const b = rodando({ id: 'b', work_item_id: 2, iniciado_em: '2026-11-16T13:05:00.000Z', ultimo_sinal_em: '2026-11-16T13:10:00.000Z', ultima_presenca_em: '2026-11-16T13:05:00.000Z' });

  it('lê a lista; servidor sem a TM9 vira lista de um', () => {
    expect(lerEstado({ rodando: b, rodando_todos: [b, a] }).rodandoTodos.map((r) => r.id)).toEqual(['b', 'a']);
    expect(lerEstado({ rodando: a }).rodandoTodos.map((r) => r.id)).toEqual(['a']);
    expect(lerEstado({ rodando: null }).rodandoTodos).toEqual([]);
  });

  it('total do dia soma os paralelos (a hora conta inteira em cada)', () => {
    const e = lerEstado({ rodando: b, rodando_todos: [b, a], fechado_hoje_seg: 600 });
    // a: 10 min, b: 5 min, + 10 fechados
    expect(totalHojeSeg(e, t('2026-11-16T13:10:00.000Z'))).toBe(600 + 600 + 300);
  });

  it('sinal e presença pelo mais atrasado de cada', () => {
    const ref = referenciaPresenca([b, a])!;
    expect(ref.ultima_presenca_em).toBe(a.ultima_presenca_em); // a perguntaria primeiro
    expect(ref.ultimo_sinal_em).toBe(b.ultimo_sinal_em); // b é o sinal mais velho
    expect(referenciaPresenca([])).toBeNull();
  });

  it('erro de paralelos demais tem mensagem', () => {
    expect(mensagemErroTimer({ message: 'timer_muitos_paralelos' })).toMatch(/3 timers/);
  });
});

describe('capacidadeDia (barra de 7 h)', () => {
  it('até 7 h: verde, enchendo proporcional', async () => {
    const { capacidadeDia } = await import('@/lib/timerRelogio');
    expect(capacidadeDia(0)).toMatchObject({ pct: 0, acima: false });
    expect(capacidadeDia(3.5 * 3600)).toMatchObject({ pct: 50, acima: false });
    expect(capacidadeDia(7 * 3600).cor).toMatch(/^hsl\(142 /);
    expect(capacidadeDia(7 * 3600).pct).toBe(100);
  });

  it('passou de 7 h: cheia, amarelando até vermelho em 10 h', async () => {
    const { capacidadeDia } = await import('@/lib/timerRelogio');
    const hue = (s: number) => Number(capacidadeDia(s).cor.match(/^hsl\((\d+)/)![1]);
    expect(capacidadeDia(8 * 3600)).toMatchObject({ pct: 100, acima: true });
    expect(hue(8 * 3600)).toBeLessThan(142);
    expect(hue(8.5 * 3600)).toBeGreaterThan(50);
    expect(hue(8.5 * 3600)).toBeLessThan(90); // faixa do amarelo
    expect(hue(10 * 3600)).toBe(0);
    expect(hue(14 * 3600)).toBe(0);
  });

  it('valor negativo não quebra', async () => {
    const { capacidadeDia } = await import('@/lib/timerRelogio');
    expect(capacidadeDia(-5).pct).toBe(0);
  });
});
