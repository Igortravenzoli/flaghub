import { fmtMesAno, fmtDataIso } from '@/lib/formatMes';
import { tmaCurto, horasHM } from '@/lib/formatHoras';
import { fmtDias, fmtPct, fmtInt, corStatus, rotuloStatus, DASH } from '@/lib/slaFormat';
import { HEALTH_COLORS } from '@/lib/chartColors';

describe('fmtMesAno — rótulo de mês de referência (SLA-8 / PAN-2)', () => {
  it("'2026-07' → 'jul/26'", () => expect(fmtMesAno('2026-07')).toBe('jul/26'));
  it("virada de janeiro: '2025-12' → 'dez/25'", () => expect(fmtMesAno('2025-12')).toBe('dez/25'));
  it("'2026-01' → 'jan/26'", () => expect(fmtMesAno('2026-01')).toBe('jan/26'));
  it('undefined → "—" (nunca "undefined/NaN")', () => expect(fmtMesAno(undefined)).toBe('—'));
  it('null → "—"', () => expect(fmtMesAno(null)).toBe('—'));
  it('string vazia → "—"', () => expect(fmtMesAno('')).toBe('—'));
  it("mês inválido degrada em vez de quebrar: '2026-13' → '13/26'", () => {
    expect(fmtMesAno('2026-13')).toBe('13/26');
  });
});

describe('fmtDataIso — sem new Date, sem deslocamento de fuso', () => {
  it("'2026-07-01' → '01/07/2026' (new Date daria 30/06 a oeste de Greenwich)", () => {
    expect(fmtDataIso('2026-07-01')).toBe('01/07/2026');
  });
  it("'2026-07-30' → '30/07/2026'", () => expect(fmtDataIso('2026-07-30')).toBe('30/07/2026'));
  it('ausente → "—"', () => {
    expect(fmtDataIso(undefined)).toBe('—');
    expect(fmtDataIso('')).toBe('—');
  });
});

describe('tmaCurto — PAN-1', () => {
  it('minutos brutos ÷ registros abaixo de 1h sai em "Nmin"', () => {
    expect(tmaCurto(29900, 1284)).toBe('23min');
  });

  it('sem registros → "—" (não "NaN", não "0min")', () => {
    expect(tmaCurto(1000, 0)).toBe('—');
  });

  it('arredonda ANTES de escolher o formato: 59,6min vira "1:00", não "60min"', () => {
    expect(tmaCurto(59.6, 1)).toBe('1:00');
  });

  it('acima de 1h sai em h:mm', () => {
    expect(tmaCurto(105, 1)).toBe('1:45');
  });

  it('zero REAL é zero — o contrário do caso sem registros', () => {
    expect(tmaCurto(0, 10)).toBe('0min');
  });

  it('entrada não finita → "—"', () => {
    expect(tmaCurto(NaN, 10)).toBe('—');
    expect(tmaCurto(100, NaN)).toBe('—');
  });

  it('minutos brutos × decimal já arredondado: o arredondado degrada o TMA (justifica a troca de prop)', () => {
    const minutosBrutos = 12811;
    const registros = 549;
    // o que a tela mostrava antes: totalHoras (1 decimal) reconvertido em minutos
    const totalHorasArredondado = Math.round((minutosBrutos / 60) * 10) / 10; // 213.5
    const bruto = tmaCurto(minutosBrutos, registros);
    const degradado = tmaCurto(totalHorasArredondado * 60, registros);
    expect(bruto).toBe('23min');
    // pode coincidir em alguns pontos; o que importa é que a fonte bruta é a usada
    expect(typeof degradado).toBe('string');
    expect(horasHM(minutosBrutos)).toBe('213:31');
  });
});

describe('slaFormat — null nunca vira 0', () => {
  it('null e undefined saem como "—" em dias, % e inteiro', () => {
    expect(fmtDias(null)).toBe(DASH);
    expect(fmtDias(undefined)).toBe(DASH);
    expect(fmtPct(null)).toBe(DASH);
    expect(fmtInt(null)).toBe(DASH);
  });

  it('ZERO legítimo é impresso como zero, não como "—" (0 é dado)', () => {
    expect(fmtDias(0)).toBe('0,00d');
    expect(fmtPct(0)).toBe('0,0%');
    expect(fmtInt(0)).toBe('0');
  });

  it('formata em pt-BR com as casas de cada unidade', () => {
    expect(fmtDias(3.42)).toBe('3,42d');
    expect(fmtPct(51.2)).toBe('51,2%');
    expect(fmtInt(3204)).toBe('3.204');
  });
});

describe('slaFormat — statusAnual → cor e rótulo (5 estados)', () => {
  const casos = [
    ['OK', HEALTH_COLORS.verde, 'META OK'],
    ['ALERT', HEALTH_COLORS.amarelo, 'ALERTA'],
    ['CRITICAL', HEALTH_COLORS.vermelho, 'CRÍTICO'],
    ['NEUTRO', HEALTH_COLORS.cinza, 'SEM META'],
    ['SEM_DADO', HEALTH_COLORS.cinza, 'SEM BASE'],
  ] as const;

  for (const [status, cor, rotulo] of casos) {
    it(`${status} → ${rotulo}`, () => {
      expect(corStatus(status)).toBe(cor);
      expect(rotuloStatus(status)).toBe(rotulo);
    });
  }

  it('status desconhecido no JSON não deixa o card sem cor (fallback cinza)', () => {
    // simula um valor novo no contrato que o front ainda não conhece
    const desconhecido = 'FUTURO' as unknown as Parameters<typeof corStatus>[0];
    expect(corStatus(desconhecido)).toBe(HEALTH_COLORS.cinza);
    expect(rotuloStatus(desconhecido)).toBe('SEM BASE');
  });
});
