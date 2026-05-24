import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
import {
  useTechLeadAcumulado, useTechLeadConsultorSistemas, useTechLeadConsultorInfra,
  useTechLeadPorDia, useTechLeadPorCliente, useTechLeadPorSistema,
  ConsultorItem, PorDiaItem, PorClienteItem, PorSistemaItem,
} from '@/hooks/useTechLeadKpis';
import { gatewayPost, isMockMode } from '@/services/gatewayService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Monitor, UserCheck, Clock, TrendingUp, Upload, Phone, Flag,
  BarChart3, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '@/lib/chartColors';

function fmtSeg(seg: number): string {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function pct(val: number) {
  return `${val.toFixed(1)}%`;
}

function StatusBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 3;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="font-medium truncate max-w-[55%]">{label}</span>
        <span className="font-bold">{value}</span>
      </div>
      <div className="h-4 bg-muted rounded-full overflow-hidden flex items-center">
        <div
          className="h-full rounded-full"
          style={{ width: `${w}%`, background: 'hsl(var(--primary))' }}
        />
      </div>
    </div>
  );
}

function ConsultorTable({ data, isLoading }: { data: ConsultorItem[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data.length) return <DashboardEmptyState description="Sem registros para o período." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="text-left py-2 px-3 font-medium">Consultor</th>
            <th className="text-right py-2 px-3 font-medium">Registros</th>
            <th className="text-right py-2 px-3 font-medium">Tempo VDESK</th>
            <th className="text-right py-2 px-3 font-medium">Produtividade</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.consultor} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className="py-2 px-3 font-medium">{c.consultor}</td>
              <td className="py-2 px-3 text-right font-mono">{c.totalRegistros}</td>
              <td className="py-2 px-3 text-right font-mono text-muted-foreground">{fmtSeg(c.totalTempoSegundos)}</td>
              <td className="py-2 px-3 text-right">
                <Badge
                  variant={c.produtividade >= 80 ? 'default' : c.produtividade >= 50 ? 'secondary' : 'outline'}
                  className="font-mono text-xs"
                >
                  {pct(c.produtividade)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PorDiaGrid({ data, isLoading }: { data: PorDiaItem[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data.length) return <DashboardEmptyState description="Sem registros para o período." />;

  const consultores = [...new Set(data.map((d) => d.consultor))].sort();
  // dataRegistro chega como ISO datetime do .NET ("2026-05-01T00:00:00") — fatia apenas a data
  const dias = [...new Set(data.map((d) => d.dataRegistro.slice(0, 10)))].sort();

  const map = new Map<string, PorDiaItem>();
  data.forEach((d) => map.set(`${d.consultor}|${d.dataRegistro.slice(0, 10)}`, d));

  return (
    <ScrollArea className="h-96">
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card border border-border px-2 py-1 font-medium text-left min-w-[100px]">Consultor</th>
              {dias.map((d) => {
                const dt = new Date(d + 'T12:00:00'); // noon para evitar problema de fuso
                return (
                  <th key={d} className="border border-border px-2 py-1 font-medium text-center min-w-[72px] whitespace-nowrap">
                    {dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    <br />
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {dt.toLocaleDateString('pt-BR', { weekday: 'short' })}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {consultores.map((c) => (
              <tr key={c}>
                <td className="sticky left-0 bg-card border border-border px-2 py-1 font-medium">{c}</td>
                {dias.map((d) => {
                  const item = map.get(`${c}|${d}`);
                  const prod = item?.produtividadeDia ?? 0;
                  const bg = prod >= 80 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : prod >= 50 ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : prod > 0 ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                    : '';
                  return (
                    <td key={d} className={`border border-border px-2 py-1 text-center ${bg}`}>
                      {item ? (
                        <div>
                          <div className="font-bold">{pct(prod)}</div>
                          <div className="text-[10px] text-muted-foreground">{item.totalRegistros} reg</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScrollArea>
  );
}

function PorClienteList({ data, isLoading }: { data: PorClienteItem[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data.length) return <DashboardEmptyState description="Sem registros para o período." />;
  const sorted = [...data].sort((a, b) => b.totalRegistros - a.totalRegistros);
  const max = sorted[0]?.totalRegistros ?? 1;
  return (
    <ScrollArea className="h-80">
      <div className="space-y-2 pr-2">
        {sorted.map((c, i) => (
          <div key={c.cliente} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium truncate">{c.cliente}</span>
                  {c.bandeira && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{c.bandeira}</Badge>
                  )}
                </div>
                <span className="text-xs font-bold ml-2 shrink-0">{c.totalRegistros}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, Math.round((c.totalRegistros / max) * 100))}%`,
                    background: CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function PorSistemaList({ data, isLoading }: { data: PorSistemaItem[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data.length) return <DashboardEmptyState description="Sem registros para o período." />;
  const sorted = [...data].sort((a, b) => b.totalRegistros - a.totalRegistros).slice(0, 20);
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} layout="vertical" margin={{ left: 5, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-20" horizontal={false} />
          <XAxis type="number" className="text-xs" tick={{ fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="nomeSistema"
            width={120}
            tick={{ fontSize: 10 }}
            className="text-xs"
          />
          <Tooltip
            formatter={(v: number, name: string) => [
              name === 'totalRegistros' ? v : fmtMin(v as number),
              name === 'totalRegistros' ? 'Registros' : 'Tempo Total',
            ]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="totalRegistros" name="totalRegistros" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TechLeadPanel() {
  const filters = useDashboardFilters('mes_atual');
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const acumulado = useTechLeadAcumulado(filters.dateFrom, filters.dateTo);
  const sistemas = useTechLeadConsultorSistemas(filters.dateFrom, filters.dateTo);
  const infra = useTechLeadConsultorInfra(filters.dateFrom, filters.dateTo);
  const porDia = useTechLeadPorDia(filters.dateFrom, filters.dateTo);
  const porCliente = useTechLeadPorCliente(filters.dateFrom, filters.dateTo);
  const porSistema = useTechLeadPorSistema(filters.dateFrom, filters.dateTo);

  const ac = acumulado.data;

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('csv', file);
      const result = await gatewayPost<{ success: boolean; message: string; inserted: number }>(
        '/api/techlead/central/upload',
        fd,
      );
      toast({
        title: result.success ? 'Upload concluído' : 'Erro no upload',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      if (result.success) {
        qc.invalidateQueries({ queryKey: ['techlead'] });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4 py-2">
      {/* Mock mode notice */}
      {isMockMode && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <span className="font-semibold">MOCK</span>
          <span>Dados simulados — conecte o backend (VITE_GATEWAY_URL) para dados reais do VDESK.</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <DashboardFilterBar
          preset={filters.preset}
          onPresetChange={filters.setPreset}
          presetLabel={filters.presetLabel}
          presetControl="dropdown"
          presetsLabel="Período"
          presets={[
            { value: 'mes_atual', label: 'Mês Atual' },
            { value: 'mes_anterior', label: 'Mês Anterior' },
            { value: '30d', label: 'Últimos 30d' },
            { value: '90d', label: 'Últimos 90d' },
            { value: '1y', label: 'Ano' },
          ]}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onCustomRange={filters.setCustomRange}
        />
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvUpload}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Enviando...' : 'CSV Central'}
          </Button>
        </div>
      </div>

      {/* KPI summary row */}
      {acumulado.isError ? (
        <DashboardEmptyState variant="error" onRetry={() => acumulado.refetch()} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Registros', icon: Users, val: ac ? String(ac.totalRegistros) : '—' },
            { label: 'Dias Úteis', icon: Calendar, val: ac ? String(ac.diasUteis) : '—' },
            { label: 'Média/Dia', icon: TrendingUp, val: ac ? ac.mediaDiariaRegistros.toFixed(1) : '—' },
            { label: 'TMA', icon: Clock, val: ac ? fmtSeg(ac.tmaSegundos) : '—' },
            { label: 'Tempo Total', icon: Phone, val: ac ? fmtSeg(ac.totalTempoSegundos) : '—' },
          ].map(({ label, icon: Icon, val }) => (
            <Card key={label} className="p-4">
              {acumulado.isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
                    <p className="text-2xl font-bold font-mono mt-0.5">{val}</p>
                  </div>
                  <Icon className="h-7 w-7 text-muted-foreground/30" />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="consultores" className="w-full">
        <TabsList className="mb-4 h-9 flex-wrap">
          <TabsTrigger value="consultores" className="text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" /> Consultores
          </TabsTrigger>
          <TabsTrigger value="infra" className="text-xs gap-1.5">
            <Monitor className="h-3.5 w-3.5" /> Infra
          </TabsTrigger>
          <TabsTrigger value="dia" className="text-xs gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Por Dia
          </TabsTrigger>
          <TabsTrigger value="clientes" className="text-xs gap-1.5">
            <UserCheck className="h-3.5 w-3.5" /> Clientes
          </TabsTrigger>
          <TabsTrigger value="sistemas-detalhe" className="text-xs gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Sistemas
          </TabsTrigger>
        </TabsList>

        {/* Tab: Consultores */}
        <TabsContent value="consultores">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Consultores Sistemas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ConsultorTable data={sistemas.data?.consultores ?? []} isLoading={sistemas.isLoading} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Registros por Consultor
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sistemas.isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : !sistemas.data?.consultores.length ? (
                  <DashboardEmptyState description="Sem registros para o período." />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...(sistemas.data.consultores)].sort((a, b) => b.totalRegistros - a.totalRegistros)}
                        layout="vertical"
                        margin={{ left: 5, right: 24 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="opacity-20" horizontal={false} />
                        <XAxis type="number" className="text-xs" tick={{ fontSize: 10 }} />
                        <YAxis
                          type="category"
                          dataKey="consultor"
                          width={90}
                          tick={{ fontSize: 11 }}
                          className="text-xs"
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12 }}
                          formatter={(v: number) => [v, 'Registros']}
                        />
                        <Bar
                          dataKey="totalRegistros"
                          name="Registros"
                          fill="hsl(var(--primary))"
                          radius={[0, 6, 6, 0]}
                          barSize={18}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Infra */}
        <TabsContent value="infra">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                Consultores Infra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ConsultorTable data={infra.data?.consultores ?? []} isLoading={infra.isLoading} />
              {infra.data && (
                <div className="mt-4 grid grid-cols-2 gap-3 pt-4 border-t border-border">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Total Registros</p>
                    <p className="text-xl font-bold font-mono">{infra.data.totalRegistros}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Tempo VDESK</p>
                    <p className="text-xl font-bold font-mono">{fmtSeg(infra.data.totalTempoSegundos)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Por Dia */}
        <TabsContent value="dia">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Produtividade por Consultor e Dia
              </CardTitle>
              <p className="text-xs text-muted-foreground">Verde ≥ 80% · Âmbar ≥ 50% · Vermelho &lt; 50%</p>
            </CardHeader>
            <CardContent>
              <PorDiaGrid data={porDia.data?.registros ?? []} isLoading={porDia.isLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Clientes */}
        <TabsContent value="clientes">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Registros por Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PorClienteList data={porCliente.data?.clientes ?? []} isLoading={porCliente.isLoading} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Flag className="h-4 w-4 text-primary" />
                  Por Bandeira
                </CardTitle>
              </CardHeader>
              <CardContent>
                {porCliente.isLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : (() => {
                  const bandeiras = new Map<string, number>();
                  (porCliente.data?.clientes ?? []).forEach((c) => {
                    const b = c.bandeira || 'Sem bandeira';
                    bandeiras.set(b, (bandeiras.get(b) ?? 0) + c.totalRegistros);
                  });
                  const bData = [...bandeiras.entries()]
                    .sort(([, a], [, b]) => b - a)
                    .map(([nome, total]) => ({ nome, total }));
                  const maxB = bData[0]?.total ?? 1;
                  return (
                    <div className="space-y-3">
                      {bData.map((b, i) => (
                        <StatusBar key={b.nome} label={b.nome} value={b.total} max={maxB} />
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Sistemas Detalhe */}
        <TabsContent value="sistemas-detalhe">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Chamados por Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PorSistemaList data={porSistema.data?.sistemas ?? []} isLoading={porSistema.isLoading} />
              {!porSistema.isLoading && (porSistema.data?.sistemas.length ?? 0) > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 px-2">Sistema</th>
                        <th className="text-right py-1.5 px-2">Registros</th>
                        <th className="text-right py-1.5 px-2">Tempo Total</th>
                        <th className="text-right py-1.5 px-2">TM por OS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...(porSistema.data?.sistemas ?? [])]
                        .sort((a, b) => b.totalRegistros - a.totalRegistros)
                        .map((s) => (
                          <tr key={s.nomeSistema} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-1.5 px-2 font-medium">{s.nomeSistema}</td>
                            <td className="py-1.5 px-2 text-right font-mono">{s.totalRegistros}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">{fmtMin(s.totalMinutos)}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-muted-foreground">{fmtMin(Math.round(s.tempoMedioMinutos))}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
