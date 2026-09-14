import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import {
  GC_TELAO_MS,
  PISO_TELAO_COMERCIAL_MS,
  PISO_TELAO_PADRAO_MS,
  PISO_TELAO_SGSI_MS,
  definirPoliticaTelao,
  foraDoExpediente,
  instalarPoliticaTelao,
  pisoTelao,
} from '@/lib/politicaCacheTelao';

/**
 * Contrato da política de cache do telão (egress da Supabase, 14/09/2026).
 *
 * O que este arquivo protege:
 *   • telas de mesa: política desligada = defaults idênticos ao QueryClient puro;
 *   • o telão não rebaixa o que já tem antes do piso, nem de noite/fim de semana;
 *   • chave sem dado continua buscando na hora (a pausa não deixa tela vazia);
 *   • a virada das 07h vale na montagem, não quando as opções foram calculadas;
 *   • desligar a política vale até para opções já calculadas (Voltar saindo do
 *     kiosk: a página nova renderiza com a política ligada e monta sem ela).
 */

const MIN = 60_000;
const HORA = 60 * MIN;
const CINCO_MIN = 5 * MIN;

// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019).
const SEG_10H = new Date('2026-09-14T13:00:00Z');
const SEG_22H = new Date('2026-09-15T01:00:00Z');
const SAB_10H = new Date('2026-09-12T13:00:00Z');

function novoClient(ativa: boolean) {
  definirPoliticaTelao(ativa);
  return instalarPoliticaTelao(
    new QueryClient({
      defaultOptions: { queries: { staleTime: CINCO_MIN, refetchOnWindowFocus: false, retry: false } },
    }),
  );
}

function resolver(valor: unknown, query?: unknown) {
  return typeof valor === 'function' ? (valor as (q: unknown) => unknown)(query) : valor;
}

function defaultar(client: QueryClient, opcoes: { queryKey: QueryKey; staleTime?: unknown }) {
  return client.defaultQueryOptions({ queryFn: async () => null, ...opcoes } as never);
}

function staleResolvido(client: QueryClient, opcoes: { queryKey: QueryKey; staleTime?: unknown }, query?: unknown) {
  return resolver(defaultar(client, opcoes).staleTime, query);
}

describe('foraDoExpediente — seg–sex 07h–19h no horário de Brasília', () => {
  // Relógio local travado numa quarta ao meio-dia: só um cálculo que respeite o
  // fuso passa nos casos de noite e fim de semana, qualquer que seja o fuso da
  // máquina que roda a suíte.
  beforeEach(() => {
    vi.spyOn(Date.prototype, 'getDay').mockReturnValue(3);
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['segunda 10h', '2026-09-14T13:00:00Z', false],
    ['segunda 06h59', '2026-09-14T09:59:00Z', true],
    ['segunda 07h00', '2026-09-14T10:00:00Z', false],
    ['segunda 18h59', '2026-09-14T21:59:00Z', false],
    ['segunda 19h00', '2026-09-14T22:00:00Z', true],
    ['sexta 18h30 (UTC já passou das 21h)', '2026-09-18T21:30:00Z', false],
    ['segunda 06h30 (UTC já é 09h30)', '2026-09-14T09:30:00Z', true],
    ['sábado 10h', '2026-09-12T13:00:00Z', true],
    ['domingo 21h (UTC já é segunda)', '2026-09-14T00:00:00Z', true],
  ])('%s → fora=%s', (_rotulo, iso, fora) => {
    expect(foraDoExpediente(new Date(iso))).toBe(fora);
  });
});

describe('pisoTelao — faixas por queryKey', () => {
  it.each<[QueryKey, number | null]>([
    [['bi-infra', 'sgsi-rows'], PISO_TELAO_SGSI_MS],
    [['cs', 'incidentes-declarados', '017', '2026-09-01', '2026-09-14'], PISO_TELAO_SGSI_MS],
    [['comercial', 'kpis'], PISO_TELAO_COMERCIAL_MS],
    [['survey_responses'], PISO_TELAO_COMERCIAL_MS],
    [['survey_aggregates'], PISO_TELAO_COMERCIAL_MS],
    [['fabrica', 'work-items'], PISO_TELAO_PADRAO_MS],
    [['infraestrutura', 'kpis'], PISO_TELAO_PADRAO_MS],
    [['cs', 'outra-coisa'], PISO_TELAO_PADRAO_MS],
    // Gateway VDESK: não é egress da Supabase, não tem piso.
    [['gestao', 'sla-flag'], null],
    [['techlead', 'por-dia', '2026-09-01', '2026-09-14'], null],
    [['bi-customer', 'kpis'], null],
    [['helpdesk', 'kpis', '2026-09-14', '2026-09-14'], null],
  ])('%j → %s', (chave, piso) => {
    expect(pisoTelao(chave)).toBe(piso);
  });
});

describe('QueryClient com a política', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SEG_10H);
  });
  afterEach(() => {
    definirPoliticaTelao(false);
    vi.useRealTimers();
  });

  it('desligada: defaults idênticos aos do QueryClient puro (telas de mesa)', () => {
    const puro = new QueryClient({
      defaultOptions: { queries: { staleTime: CINCO_MIN, refetchOnWindowFocus: false, retry: false } },
    });
    const comPolitica = novoClient(false);
    const opcoes = { queryKey: ['fabrica', 'kpis'], queryFn: async () => 1, staleTime: MIN };

    expect(comPolitica.defaultQueryOptions(opcoes)).toEqual(puro.defaultQueryOptions(opcoes));
  });

  it('ligada no expediente: piso de 30 min, gcTime de 2 h e sem refetch na reconexão', () => {
    const client = novoClient(true);
    const d = defaultar(client, { queryKey: ['fabrica', 'kpis'] });

    expect(resolver(d.staleTime)).toBe(PISO_TELAO_PADRAO_MS);
    expect(d.gcTime).toBe(GC_TELAO_MS);
    expect(resolver(d.refetchOnReconnect)).toBe(false);
  });

  it('desligar a política vale até para opções já calculadas (Voltar saindo do kiosk)', () => {
    const client = novoClient(true);
    const d = defaultar(client, { queryKey: ['fabrica', 'kpis'] });

    definirPoliticaTelao(false);

    expect(resolver(d.staleTime)).toBe(CINCO_MIN);
    expect(resolver(d.refetchOnReconnect)).toBe(true);
  });

  it('hook que já pede mais que o piso continua valendo', () => {
    const client = novoClient(true);
    expect(staleResolvido(client, { queryKey: ['fabrica', 'kpis'], staleTime: 3 * HORA })).toBe(3 * HORA);
  });

  it('staleTime em função também recebe o piso', () => {
    const client = novoClient(true);
    expect(staleResolvido(client, { queryKey: ['fabrica', 'kpis'], staleTime: () => MIN })).toBe(
      PISO_TELAO_PADRAO_MS,
    );
  });

  it("'static' é respeitado, inclusive fora do expediente", () => {
    const client = novoClient(true);
    expect(staleResolvido(client, { queryKey: ['fabrica', 'kpis'], staleTime: 'static' })).toBe('static');
    vi.setSystemTime(SAB_10H);
    expect(staleResolvido(client, { queryKey: ['fabrica', 'kpis'], staleTime: 'static' })).toBe('static');
  });

  it('gateway VDESK fica sem piso no expediente e pausa à noite', () => {
    const client = novoClient(true);
    expect(staleResolvido(client, { queryKey: ['gestao', 'sla-flag'] })).toBe(CINCO_MIN);
    vi.setSystemTime(SEG_22H);
    expect(staleResolvido(client, { queryKey: ['gestao', 'sla-flag'] })).toBe(Infinity);
  });

  it('helpdesk com o gateway fora caiu na Supabase: aí vale o piso padrão', () => {
    const client = novoClient(true);
    const chave = { queryKey: ['helpdesk', 'kpis', '2026-09-01', '2026-09-14'] };

    const doGateway = { state: { data: { source: 'api', data: {} } } };
    const daSupabase = { state: { data: { source: 'supabase', data: [] } } };

    expect(staleResolvido(client, chave, doGateway)).toBe(CINCO_MIN);
    expect(staleResolvido(client, chave, daSupabase)).toBe(PISO_TELAO_PADRAO_MS);
  });

  it('fora do expediente tudo pausa', () => {
    const client = novoClient(true);
    vi.setSystemTime(SAB_10H);
    expect(staleResolvido(client, { queryKey: ['bi-infra', 'sgsi-rows'] })).toBe(Infinity);
    expect(staleResolvido(client, { queryKey: ['fabrica', 'kpis'] })).toBe(Infinity);
  });

  it('gcTime maior que 2 h é mantido', () => {
    const client = novoClient(true);
    const d = client.defaultQueryOptions({ queryKey: ['x'], queryFn: async () => 1, gcTime: Infinity });
    expect(d.gcTime).toBe(Infinity);
  });

  it("refetchOnMount 'always' vira true (senão rebaixaria a cada visita)", () => {
    const client = novoClient(true);
    const d = client.defaultQueryOptions({ queryKey: ['x'], queryFn: async () => 1, refetchOnMount: 'always' });
    expect(d.refetchOnMount).toBe(true);
  });

  it('opções já defaultadas passam direto, sem recalcular', () => {
    const client = novoClient(true);
    const d = client.defaultQueryOptions({ queryKey: ['fabrica', 'kpis'], queryFn: async () => 1 });
    expect(client.defaultQueryOptions(d)).toBe(d);
  });
});

describe('efeito na montagem — o que de fato gera egress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SEG_10H);
  });
  afterEach(() => {
    definirPoliticaTelao(false);
    vi.useRealTimers();
  });

  function montar(client: QueryClient, queryKey: QueryKey) {
    const queryFn = vi.fn(async () => 'novo');
    const observer = new QueryObserver(client, { queryKey, queryFn });
    return { queryFn, observer };
  }

  it.each([
    [true, 0],
    [false, 1],
  ])('política ligada=%s: dado de 10 min atrás → %i busca(s) ao voltar à tela', (ativa, buscas) => {
    const client = novoClient(ativa);
    client.setQueryData(['fabrica', 'work-items'], 'velho', { updatedAt: Date.now() - 10 * MIN });

    const { queryFn, observer } = montar(client, ['fabrica', 'work-items']);
    const sair = observer.subscribe(() => {});

    expect(queryFn).toHaveBeenCalledTimes(buscas);
    sair();
    client.clear();
  });

  it('à noite não rebaixa o dado de ontem, mas chave sem dado busca na hora', () => {
    vi.setSystemTime(SEG_22H);
    const client = novoClient(true);
    client.setQueryData(['bi-infra', 'sgsi-rows'], 'ontem', { updatedAt: Date.now() - 20 * HORA });

    const comDado = montar(client, ['bi-infra', 'sgsi-rows']);
    const sair1 = comDado.observer.subscribe(() => {});
    expect(comDado.queryFn).not.toHaveBeenCalled();

    const semDado = montar(client, ['cs', 'incidentes-declarados', '017', '2026-09-01', '2026-09-15']);
    const sair2 = semDado.observer.subscribe(() => {});
    expect(semDado.queryFn).toHaveBeenCalledTimes(1);

    sair1();
    sair2();
    client.clear();
  });

  it('a virada das 07h vale na montagem, mesmo com as opções calculadas antes', () => {
    const client = novoClient(true);
    // Terça 06h55 em Brasília; o dado é da véspera, 18h50.
    vi.setSystemTime(new Date('2026-09-15T09:55:00Z'));
    client.setQueryData(['fabrica', 'work-items'], 'vespera', {
      updatedAt: new Date('2026-09-14T21:50:00Z').getTime(),
    });

    const antes = montar(client, ['fabrica', 'work-items']);
    const sair1 = antes.observer.subscribe(() => {});
    expect(antes.queryFn).not.toHaveBeenCalled();
    sair1();

    // Observer criado (e opções calculadas) às 06h55, montado às 07h05.
    const depois = montar(client, ['fabrica', 'work-items']);
    vi.setSystemTime(new Date('2026-09-15T10:05:00Z'));
    const sair2 = depois.observer.subscribe(() => {});
    expect(depois.queryFn).toHaveBeenCalledTimes(1);

    sair2();
    client.clear();
  });

  it('página que renderiza com a política ligada e monta depois de desligada busca como mesa', () => {
    const client = novoClient(true);
    client.setQueryData(['fabrica', 'work-items'], 'do-kiosk', { updatedAt: Date.now() - 10 * MIN });

    // Render da página nova ainda com o Home no ar (opções calculadas com a política)…
    const pagina = montar(client, ['fabrica', 'work-items']);
    // …o Home sai e desliga a política antes de a página se inscrever.
    definirPoliticaTelao(false);
    const sair = pagina.observer.subscribe(() => {});

    expect(pagina.queryFn).toHaveBeenCalledTimes(1);
    sair();
    client.clear();
  });
});
