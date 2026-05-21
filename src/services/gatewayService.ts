// ── Config ────────────────────────────────────────────────────────────
const GATEWAY_URL = (import.meta.env.VITE_GATEWAY_URL as string | undefined) ?? '';
const SERVICE_SECRET = (import.meta.env.VITE_GATEWAY_SERVICE_SECRET as string | undefined) ?? '';
const MOCK_MODE =
  !GATEWAY_URL || (import.meta.env.VITE_GATEWAY_MOCK as string | undefined) === 'true';

// ── Mock data registry ────────────────────────────────────────────────

function buildMocks(): Record<string, unknown> {
  const SISTEMAS = ['Ailton', 'Italo', 'Leandrofaria', 'Guimaraes', 'Ricardo', 'Vagner', 'Wilker'];
  const INFRA = ['Bruna', 'Ronaldo'];
  const ALL = [...SISTEMAS, ...INFRA];

  const now = new Date('2026-05-21');
  const ini = '2026-05-01';
  const fim = '2026-05-21';

  /* Weekdays in May 2026 (without holidays) */
  const weekdays: string[] = [];
  for (let d = new Date('2026-05-01'); d <= now; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) {
      weekdays.push(d.toISOString().slice(0, 10));
    }
  }
  const diasUteis = weekdays.length; // ~15 dias

  /* Produtividade base por consultor (varia por dia) */
  const baseProd: Record<string, number> = {
    Ailton: 0.785, Italo: 0.821, Leandrofaria: 0.883,
    Guimaraes: 0.724, Ricardo: 0.912, Vagner: 0.798, Wilker: 0.846,
    Bruna: 0.763, Ronaldo: 0.689,
  };

  const consultorSistemas = SISTEMAS.map((c) => {
    const prod = baseProd[c];
    const totalRegistros = Math.round(prod * diasUteis * 9.5 + Math.random() * 10);
    const totalTempoSegundos = Math.round(totalRegistros * (60 * 22 + Math.random() * 300));
    return {
      consultor: c,
      totalRegistros,
      totalTempoSegundos,
      produtividade: +(prod * 100).toFixed(1),
      totalCentralSegundos: Math.round(Math.random() * 3600 * 2),
    };
  });

  const consultorInfra = INFRA.map((c) => {
    const prod = baseProd[c];
    const totalRegistros = Math.round(prod * diasUteis * 5.5 + Math.random() * 5);
    const totalTempoSegundos = Math.round(totalRegistros * (60 * 25 + Math.random() * 300));
    return {
      consultor: c,
      totalRegistros,
      totalTempoSegundos,
      produtividade: +(prod * 100).toFixed(1),
      totalCentralSegundos: Math.round(3600 + Math.random() * 5400),
    };
  });

  const totalRegistros = consultorSistemas.reduce((s, c) => s + c.totalRegistros, 0)
    + consultorInfra.reduce((s, c) => s + c.totalRegistros, 0);
  const totalTempoSegundos = consultorSistemas.reduce((s, c) => s + c.totalTempoSegundos, 0)
    + consultorInfra.reduce((s, c) => s + c.totalTempoSegundos, 0);

  /* Por Dia */
  const registrosPorDia: unknown[] = [];
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  for (const dia of weekdays) {
    const dt = new Date(dia + 'T00:00:00');
    const diaSemanaNome = diasSemana[dt.getDay()];
    for (const c of ALL) {
      const prod = baseProd[c] * (0.8 + Math.random() * 0.4);
      const sumMinutos = Math.round(prod * 480);
      const totalReg = Math.round(prod * 9 + Math.random() * 3);
      registrosPorDia.push({
        consultor: c,
        data: dia,
        diaSemana: diaSemanaNome,
        totalRegistros: totalReg,
        sumMinutos,
        produtividadeDia: +(prod * 100).toFixed(1),
      });
    }
  }

  /* Por Cliente */
  const clientes = [
    { apelido: 'Nestlé Brás', bandeira: 'Nestlé', totalRegistros: 234 },
    { apelido: 'Nestlé Caçapava', bandeira: 'Nestlé', totalRegistros: 187 },
    { apelido: 'Nestlé Marília', bandeira: 'Nestlé', totalRegistros: 156 },
    { apelido: 'Heineken SP', bandeira: 'Heineken', totalRegistros: 134 },
    { apelido: 'Nestlé Feira', bandeira: 'Nestlé', totalRegistros: 98 },
    { apelido: 'Heineken RJ', bandeira: 'Heineken', totalRegistros: 87 },
    { apelido: 'Nestlé Palmeiras', bandeira: 'Nestlé', totalRegistros: 76 },
    { apelido: 'Nestlé Uberlândia', bandeira: 'Nestlé', totalRegistros: 64 },
    { apelido: 'BRF Vitória', bandeira: 'BRF', totalRegistros: 58 },
    { apelido: 'Nestlé Goiânia', bandeira: 'Nestlé', totalRegistros: 47 },
    { apelido: 'Ambev MG', bandeira: 'Ambev', totalRegistros: 43 },
    { apelido: 'BRF Curitiba', bandeira: 'BRF', totalRegistros: 39 },
  ];

  /* Por Sistema */
  const sistemas = [
    { sistema: 'FlexxSales', totalRegistros: 312, totalMinutos: 8450, tempoMedioMinutos: 27.1 },
    { sistema: 'Datacenter', totalRegistros: 245, totalMinutos: 5340, tempoMedioMinutos: 21.8 },
    { sistema: 'AvanteSales', totalRegistros: 198, totalMinutos: 4230, tempoMedioMinutos: 21.4 },
    { sistema: 'QuickOne', totalRegistros: 167, totalMinutos: 3120, tempoMedioMinutos: 18.7 },
    { sistema: 'FlexxGPS', totalRegistros: 143, totalMinutos: 2890, tempoMedioMinutos: 20.2 },
    { sistema: 'AvanteShelf', totalRegistros: 128, totalMinutos: 2640, tempoMedioMinutos: 20.6 },
    { sistema: 'SmartSales', totalRegistros: 95, totalMinutos: 1980, tempoMedioMinutos: 20.8 },
    { sistema: 'FlexxPromo', totalRegistros: 82, totalMinutos: 1560, tempoMedioMinutos: 19.0 },
    { sistema: 'Decision', totalRegistros: 67, totalMinutos: 1230, tempoMedioMinutos: 18.4 },
    { sistema: 'OlaPDV', totalRegistros: 54, totalMinutos: 980, tempoMedioMinutos: 18.1 },
    { sistema: 'EstoqueCheck', totalRegistros: 43, totalMinutos: 780, tempoMedioMinutos: 18.1 },
    { sistema: 'FlexxTools', totalRegistros: 38, totalMinutos: 690, tempoMedioMinutos: 18.2 },
  ];

  /* SLA Flag */
  const slaFlag = {
    success: true,
    message: '[MOCK] Dados simulados',
    dataReferencia: new Date().toISOString(),
    tipo: 'Flag',
    metas: { metaTTRDias: 3.9, metaTTR24hPct: 48.0 },
    kpis: {
      totalAbertos: 87,
      ttrMedioAbertoDias: 4.2,
      abertos5Dias: 23,
      abertos30Dias: 8,
      totalFechados60Dias: 312,
      ttrMedioFechadoDias: 3.1,
      pctEncerrados24h: 51.3,
    },
    status: { ttr: 'ALERT', pct24h: 'OK' },
  };

  /* SLA Nestlé */
  const slaNestle = {
    success: true,
    message: '[MOCK] Dados simulados',
    dataReferencia: new Date().toISOString(),
    tipo: 'Nestle',
    metas: { metaTTRDias: 3.9, metaTTR24hPct: 48.0 },
    kpis: {
      totalAbertos: 45,
      ttrMedioAbertoDias: 3.6,
      abertos5Dias: 12,
      abertos30Dias: 3,
      totalFechados60Dias: 178,
      ttrMedioFechadoDias: 2.8,
      pctEncerrados24h: 42.1,
    },
    status: { ttr: 'OK', pct24h: 'ALERT' },
  };

  return {
    '/api/techlead/acumulado': {
      success: true,
      message: '[MOCK] Dados simulados',
      dataInicio: ini,
      dataFim: fim,
      totalRegistros,
      totalTempoSegundos,
      mediaDiariaRegistros: +(totalRegistros / diasUteis).toFixed(1),
      tmaSegundos: Math.round(totalTempoSegundos / totalRegistros),
      diasUteis,
    },
    '/api/techlead/resumo-consultor': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      consultores: consultorSistemas,
      totalRegistros: consultorSistemas.reduce((s, c) => s + c.totalRegistros, 0),
      totalTempoSegundos: consultorSistemas.reduce((s, c) => s + c.totalTempoSegundos, 0),
      totalCentralSegundos: consultorSistemas.reduce((s, c) => s + c.totalCentralSegundos, 0),
    },
    '/api/techlead/resumo-consultor-infra': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      consultores: consultorInfra,
      totalRegistros: consultorInfra.reduce((s, c) => s + c.totalRegistros, 0),
      totalTempoSegundos: consultorInfra.reduce((s, c) => s + c.totalTempoSegundos, 0),
      totalCentralSegundos: consultorInfra.reduce((s, c) => s + c.totalCentralSegundos, 0),
    },
    '/api/techlead/por-dia': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      registros: registrosPorDia,
    },
    '/api/techlead/por-cliente': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      clientes,
    },
    '/api/techlead/por-sistema': {
      success: true,
      message: '[MOCK]',
      dataInicio: ini,
      dataFim: fim,
      sistemas,
    },
    '/api/gestao/sla-flag': slaFlag,
    '/api/gestao/sla-nestle': slaNestle,
  };
}

let _mocks: Record<string, unknown> | null = null;
function getMocks() {
  if (!_mocks) _mocks = buildMocks();
  return _mocks;
}

// ── Auth ──────────────────────────────────────────────────────────────

const TOKEN_KEY = 'gw_service_token';
const EXPIRES_KEY = 'gw_service_token_expires';

async function acquireToken(): Promise<string> {
  const res = await fetch(`${GATEWAY_URL}/api/client-auth/service-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName: 'flaghub', serviceSecret: SERVICE_SECRET }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.sessionToken as string;
}

async function getToken(): Promise<string> {
  const cached = sessionStorage.getItem(TOKEN_KEY);
  const expires = sessionStorage.getItem(EXPIRES_KEY);
  if (cached && expires && new Date(expires) > new Date(Date.now() + 60_000)) {
    return cached;
  }
  const token = await acquireToken();
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(EXPIRES_KEY, new Date(Date.now() + 110 * 60 * 1000).toISOString());
  return token;
}

// ── Public API ────────────────────────────────────────────────────────

/** Returns true when running against mock data (no real Gateway) */
export const isMockMode = MOCK_MODE;

export async function gatewayGet<T>(path: string): Promise<T> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 300)); // simula latência
    const key = path.split('?')[0];
    const mock = getMocks()[key];
    if (mock !== undefined) return mock as T;
    throw new Error(`[mock] sem dados para ${key}`);
  }
  const token = await getToken();
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway ${res.status}: ${text}`);
  }
  return res.json();
}

export async function gatewayPost<T>(path: string, body: FormData | object): Promise<T> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 500));
    if (path.includes('/central/upload')) {
      return { success: true, message: '[MOCK] Upload simulado — 0 registros inseridos em modo mock.', inserted: 0 } as T;
    }
    throw new Error('[mock] POST não suportado neste endpoint');
  }
  const token = await getToken();
  const isFormData = body instanceof FormData;
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: isFormData
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: isFormData ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway ${res.status}: ${text}`);
  }
  return res.json();
}
