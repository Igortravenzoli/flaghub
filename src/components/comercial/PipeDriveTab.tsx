import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { DollarSign, TrendingUp, TrendingDown, Target, BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, ReferenceLine, Legend,
} from 'recharts';

// ── Mockup data based on Intelliwan CRM screenshots (Q1 2026) ──
// PRD rule: show % distribution, NOT absolute values

interface VendasPorCliente {
  bandeira: string;
  percentual: number; // % of total deal value
}

interface NegociosMensal {
  mes: string;
  percentualMeta: number; // % of monthly target achieved
  atingiuMeta: boolean;
}

const MOCK_VENDAS_POR_CLIENTE: VendasPorCliente[] = [
  { bandeira: 'Nespresso', percentual: 38.6 },
  { bandeira: 'Flag', percentual: 25.8 },
  { bandeira: 'Froneri', percentual: 16.7 },
  { bandeira: 'Nestlé', percentual: 12.4 },
  { bandeira: 'Outros', percentual: 5.2 },
  { bandeira: 'Heineken', percentual: 1.3 },
];

const MOCK_NEGOCIOS_MENSAL: NegociosMensal[] = [
  { mes: 'jan 2026', percentualMeta: 115.5, atingiuMeta: true },
  { mes: 'fev 2026', percentualMeta: 126.4, atingiuMeta: true },
  { mes: 'mar 2026', percentualMeta: 93.6, atingiuMeta: false },
  { mes: 'abr 2026', percentualMeta: 0, atingiuMeta: false },
  { mes: 'mai 2026', percentualMeta: 0, atingiuMeta: false },
  { mes: 'jun 2026', percentualMeta: 0, atingiuMeta: false },
];

const MOCK_VARIACAO = {
  percentualVariacao: -48.09,
  direcao: 'down' as 'up' | 'down',
  periodoLabel: 'Q1 2026 (jan–mar)',
};

const BAR_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
];

function CustomTooltipVendas({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as VendasPorCliente;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.bandeira}</p>
      <p className="text-muted-foreground">{d.percentual.toFixed(1)}% do total</p>
    </div>
  );
}

function CustomTooltipMensal({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as NegociosMensal;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{d.mes}</p>
      <p className="text-muted-foreground">
        {d.percentualMeta > 0 ? `${d.percentualMeta.toFixed(1)}% da meta` : 'Sem dados'}
      </p>
    </div>
  );
}

export function PipeDriveTab() {
  const [selectedBandeira, setSelectedBandeira] = useState<string | null>(null);

  const filteredVendas = useMemo(() => {
    if (!selectedBandeira) return MOCK_VENDAS_POR_CLIENTE;
    return MOCK_VENDAS_POR_CLIENTE.filter((v) => v.bandeira === selectedBandeira);
  }, [selectedBandeira]);

  const mesesComDados = MOCK_NEGOCIOS_MENSAL.filter((m) => m.percentualMeta > 0);
  const mediaAtingimento = mesesComDados.length > 0
    ? Math.round(mesesComDados.reduce((s, m) => s + m.percentualMeta, 0) / mesesComDados.length * 10) / 10
    : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardKpiCard
          label="Variação Período"
          value={`${MOCK_VARIACAO.percentualVariacao > 0 ? '+' : ''}${MOCK_VARIACAO.percentualVariacao}%`}
          icon={MOCK_VARIACAO.direcao === 'up' ? TrendingUp : TrendingDown}
          isLoading={false}
        />
        <DashboardKpiCard
          label="Bandeiras Ativas"
          value={MOCK_VENDAS_POR_CLIENTE.filter((v) => v.percentual > 0).length}
          icon={BarChart3}
          isLoading={false}
          delay={80}
        />
        <DashboardKpiCard
          label="Média Atingimento Meta"
          value={`${mediaAtingimento}%`}
          icon={Target}
          isLoading={false}
          delay={160}
        />
        <DashboardKpiCard
          label="Meses com Meta"
          value={`${mesesComDados.filter((m) => m.atingiuMeta).length}/${mesesComDados.length}`}
          icon={DollarSign}
          isLoading={false}
          delay={240}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Vendas por Cliente/Bandeira — horizontal bar */}
        <Card className="lg:col-span-3 p-4">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Vendas por Bandeira</h3>
              <p className="text-xs text-muted-foreground">Distribuição percentual — {MOCK_VARIACAO.periodoLabel}</p>
            </div>
            {selectedBandeira && (
              <Badge
                variant="secondary"
                className="cursor-pointer text-xs"
                onClick={() => setSelectedBandeira(null)}
              >
                {selectedBandeira} ✕
              </Badge>
            )}
          </div>
          <div className="h-[260px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredVendas} layout="vertical" margin={{ left: 60, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  domain={[0, 50]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="bandeira"
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                  width={55}
                />
                <Tooltip content={<CustomTooltipVendas />} />
                <Bar
                  dataKey="percentual"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: any) => setSelectedBandeira(d.bandeira === selectedBandeira ? null : d.bandeira)}
                >
                  {filteredVendas.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Venda Total — big number card */}
        <Card className="lg:col-span-2 p-6 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-muted-foreground mb-1">Venda Total (Deal Value)</p>
          <div className="flex items-center gap-2 mb-3">
            {MOCK_VARIACAO.direcao === 'up' ? (
              <Badge className="bg-[hsl(var(--chart-2))]/15 text-[hsl(var(--chart-2))] border-0 text-xs">
                <TrendingUp className="h-3 w-3 mr-1" />
                +{Math.abs(MOCK_VARIACAO.percentualVariacao)}%
              </Badge>
            ) : (
              <Badge className="bg-destructive/15 text-destructive border-0 text-xs">
                <TrendingDown className="h-3 w-3 mr-1" />
                {MOCK_VARIACAO.percentualVariacao}%
              </Badge>
            )}
          </div>
          <p className="text-4xl font-bold text-foreground tracking-tight">—</p>
          <p className="text-xs text-muted-foreground mt-2">Valor omitido por política de confidencialidade</p>
          <p className="text-[10px] text-muted-foreground mt-1">Período: {MOCK_VARIACAO.periodoLabel}</p>
          <Badge variant="outline" className="mt-4 text-[10px]">
            Fonte: Intelliwan CRM (mockup)
          </Badge>
        </Card>
      </div>

      {/* Negócios ganhos por mês */}
      <Card className="p-4">
        <div className="mb-1">
          <h3 className="text-sm font-semibold text-foreground">Negócios Ganhos — % da Meta Mensal</h3>
          <p className="text-xs text-muted-foreground">
            Meta de referência: 100% • Barras verdes = meta atingida, vermelhas = abaixo
          </p>
        </div>
        <div className="h-[240px] mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={MOCK_NEGOCIOS_MENSAL} margin={{ left: 10, right: 20, top: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="mes"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                domain={[0, 140]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltipMensal />} />
              <ReferenceLine
                y={100}
                stroke="hsl(var(--primary))"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Meta 100%',
                  position: 'right',
                  fill: 'hsl(var(--primary))',
                  fontSize: 10,
                }}
              />
              <Bar dataKey="percentualMeta" radius={[4, 4, 0, 0]} maxBarSize={60}>
                {MOCK_NEGOCIOS_MENSAL.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.percentualMeta === 0
                        ? 'hsl(var(--muted))'
                        : entry.atingiuMeta
                        ? 'hsl(142, 71%, 45%)'
                        : 'hsl(0, 84%, 60%)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <DashboardEmptyState
        description="Dados de referência do Intelliwan CRM. Integração via API futura — por ora, visualização mockup com distribuição percentual."
      />
    </div>
  );
}
