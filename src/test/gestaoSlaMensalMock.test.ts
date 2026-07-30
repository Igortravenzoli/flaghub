import { gatewayGet, isMockMode } from '@/services/gatewayService';
import type {
  GestaoSlaMensalResponse, GestaoCoberturaClientesResponse, GestaoSlaDetalheResponse,
} from '@/hooks/useGestaoKpis';

// Contrato dos mocks das 2 rotas novas. Sem VPN o dashboard cai em mock, então
// um mock desalinhado do DTO só apareceria na tela — estes testes pegam antes.
//
// O teste 1 é a regressão da correção em `gatewayGet`: o registry era indexado
// por `path.split('?')[0]`, o que colapsava os 3 segmentos de `sla-mensal` num
// mock só (e devolvia Nestlé para Heineken, escondendo o caso "sem meta").

describe('modo mock', () => {
  it('o ambiente de teste roda em MOCK_MODE (sem VITE_GATEWAY_URL)', () => {
    expect(isMockMode).toBe(true);
  });
});

describe('resolução de mock por path COM query', () => {
  it('sla-mensal?segmento=heineken devolve o mock do HEINEKEN, não o de Nestlé', async () => {
    const d = await gatewayGet<GestaoSlaMensalResponse>('/api/gestao/sla-mensal?segmento=heineken');
    expect(d.segmento).toBe('heineken');
    expect(d.metas.metaDefinida).toBe(false);
  });

  it('cada segmento resolve o seu payload', async () => {
    const nestle = await gatewayGet<GestaoSlaMensalResponse>('/api/gestao/sla-mensal?segmento=nestle');
    const outros = await gatewayGet<GestaoSlaMensalResponse>('/api/gestao/sla-mensal?segmento=outros');
    expect(nestle.segmento).toBe('nestle');
    expect(outros.segmento).toBe('outros');
  });

  it('chamada SEM query continua resolvendo (fallback do path sem parâmetro)', async () => {
    const d = await gatewayGet<GestaoSlaMensalResponse>('/api/gestao/sla-mensal');
    expect(d.success).toBe(true);
  });

  it('rotas antigas continuam resolvendo pelo path sem query', async () => {
    const d = await gatewayGet<GestaoSlaDetalheResponse>('/api/gestao/sla-nestle-detalhe?filtro=aberto');
    expect(d.success).toBe(true);
    // campos ADITIVOS do contrato novo presentes no mock
    expect(d.truncado).toBe(false);
    expect(d.limite).toBe(500);
  });

  it('drill-down inc5/inc30 tem mock próprio, só com ticket INC', async () => {
    const inc5 = await gatewayGet<GestaoSlaDetalheResponse>('/api/gestao/sla-nestle-detalhe?filtro=inc5');
    expect(inc5.filtro).toBe('inc5');
    expect(inc5.items.length).toBeGreaterThan(0);
    expect(inc5.items.every((i) => i.ticket?.startsWith('INC'))).toBe(true);

    const inc30 = await gatewayGet<GestaoSlaDetalheResponse>('/api/gestao/sla-nestle-detalhe?filtro=inc30');
    expect(inc30.total).toBe(7);
    expect(inc30.items).toHaveLength(7);
  });
});

describe('coerência dos 3 mocks de sla-mensal com o DTO', () => {
  const segmentos = ['nestle', 'heineken', 'outros'] as const;
  // gatewayGet simula 300 ms de latência: busca uma vez, assevera muitas.
  const payload = {} as Record<(typeof segmentos)[number], GestaoSlaMensalResponse>;

  beforeAll(async () => {
    await Promise.all(segmentos.map(async (s) => {
      payload[s] = await gatewayGet<GestaoSlaMensalResponse>(`/api/gestao/sla-mensal?segmento=${s}`);
    }));
  });

  it('menorMelhor e unidadeVariacao estão presentes nos dois grupos (read-only no DTO, mas vem no JSON)', () => {
    for (const s of segmentos) {
      const d = payload[s];
      expect(d.ttr.menorMelhor).toBe(true);
      expect(d.ttr.unidadeVariacao).toBe('%');
      expect(d.ttr24h.menorMelhor).toBe(false);
      expect(d.ttr24h.unidadeVariacao).toBe('p.p.');
    }
  });

  it('metaDefinida=false implica metas null e statusAnual NEUTRO (senão o card mostra meta que não existe)', () => {
    for (const s of segmentos) {
      const d = payload[s];
      if (d.metas.metaDefinida === false) {
        expect(d.metas.metaTTRDias).toBeNull();
        expect(d.metas.metaTTR24hPct).toBeNull();
        expect(d.ttr.statusAnual).toBe('NEUTRO');
        expect(d.ttr24h.statusAnual).toBe('NEUTRO');
        expect(d.ttr.atingiuMetaAnual).toBeNull();
      } else {
        expect(d.metas.metaTTRDias).not.toBeNull();
      }
    }
  });

  it('só Nestlé tem incMaior* (ServiceNow); os outros mandam null', () => {
    expect(payload.nestle.abertos.incMaior5Dias).not.toBeNull();
    for (const s of ['heineken', 'outros'] as const) {
      expect(payload[s].abertos.incMaior5Dias).toBeNull();
      expect(payload[s].abertos.incMaior30Dias).toBeNull();
    }
  });

  it('a referência é coerente: mesAnterior é o mês antes de mesAtual, e o ano bate', () => {
    for (const s of segmentos) {
      const r = payload[s].referencia;
      const atual = new Date(`${r.mesAtual}-01T12:00:00Z`);
      const ant = new Date(`${r.mesAnterior}-01T12:00:00Z`);
      const diffMeses =
        (atual.getUTCFullYear() - ant.getUTCFullYear()) * 12 + (atual.getUTCMonth() - ant.getUTCMonth());
      expect(diffMeses).toBe(1);
      expect(r.ano).toBe(atual.getUTCFullYear());
      expect(r.inicioAno).toBe(`${r.ano}-01-01`);
      expect(r.inicioMesAtual).toBe(`${r.mesAtual}-01`);
    }
  });

  it('quando mesAtual é null a variação também é (não pode ter delta sem operando)', () => {
    const d = payload.outros;
    expect(d.ttr.mesAtual).toBeNull();
    expect(d.ttr.variacaoPct).toBeNull();
    expect(d.ttr.variacaoDias).toBeNull();
    expect(d.ttr24h.variacaoPp).toBeNull();
  });
});

describe('mock de cobertura-clientes (PAN-2)', () => {
  it('tem os campos do DTO e um mesReferencia YYYY-MM', async () => {
    const d = await gatewayGet<GestaoCoberturaClientesResponse>('/api/gestao/cobertura-clientes');
    expect(d.mesReferencia).toMatch(/^\d{4}-\d{2}$/);
    expect(d.atendidosMes + d.naoAtendidos).toBe(d.totalClientesAtivos);
    expect(typeof d.pctCobertura).toBe('number');
    expect(Array.isArray(d.clientesInternosExcluidos)).toBe(true);
  });
});
