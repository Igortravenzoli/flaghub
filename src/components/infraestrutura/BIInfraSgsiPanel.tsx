import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useBIInfraSgsi, NameValue, SimNao } from '@/hooks/useBIInfra';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  ShieldCheck, RefreshCw, Flame, AlertTriangle, FileWarning, KeyRound,
  Lightbulb, CalendarCheck, Search, X, Copy, Check, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Seções da Gestão SG — o seletor fica nas pills do próprio painel; o dropdown
// da aba "Gestão SG" (InfraestruturaDashboard) apenas semeia a seção inicial.
export const SGSI_SECOES = [
  { value: 'mudancas', label: 'Mudanças', badge: '010', Icon: RefreshCw },
  { value: 'incidentes', label: 'Incidentes', badge: '017', Icon: Flame },
  { value: 'riscos', label: 'Riscos', badge: '012', Icon: AlertTriangle },
  { value: 'conformidade', label: 'NC & Melhorias', badge: '018/011', Icon: Lightbulb },
  { value: 'acessos', label: 'Acessos', badge: '014', Icon: KeyRound },
] as const;

// ── Constantes ────────────────────────────────────────────────────────
// Espelho refatorado do Power BI "SG-LST Usecase 1.04" (8 páginas → 5 visões).

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const STATUS_COLORS: Record<string, string> = {
  'Concluído': '#10b981', 'Concedido': '#10b981', 'Tratado': '#10b981', 'Encerrada': '#10b981', 'Implementada': '#10b981', 'Resolvido': '#10b981', 'Dentro do SLA': '#10b981',
  'Pendente': '#f59e0b', 'Em análise': '#f59e0b', 'Em tratamento': '#f59e0b', 'Em andamento': '#f59e0b', 'Contornado': '#f59e0b', 'Avaliação': '#f59e0b',
  'Aguardando Gestor': '#8b5cf6', 'Aguardando TI': '#3b82f6', 'Revogado': '#64748b', 'Aceito': '#06b6d4', 'Revisão': '#06b6d4',
  'Ativo': '#ef4444', 'Aberta': '#ef4444', 'Novo': '#ef4444', 'Fora do SLA': '#ef4444', 'Backlog': '#64748b',
};

function colorFor(name: string, i: number) {
  return STATUS_COLORS[name] ?? PALETTE[i % PALETTE.length];
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // texto livre (ex.: "Dia: 09/10/2023 - 06h27")
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function pct(parte: number, todo: number) {
  return todo > 0 ? Math.round((parte / todo) * 100) : 0;
}

/** Normaliza para busca: minúsculas, sem acentos. */
function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** true se a query casa com qualquer um dos campos (busca acento-insensível). */
function hit(q: string, ...parts: (string | number | null | undefined)[]): boolean {
  if (!q) return true;
  const nq = norm(q);
  return parts.some((p) => p != null && p !== '' && norm(String(p)).includes(nq));
}

// ── Building blocks ───────────────────────────────────────────────────

/** Realça o trecho que casa com a busca dentro de um texto curto. */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q || !text) return <>{text}</>;
  const idx = norm(text).indexOf(norm(q));
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/25 text-foreground px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function KpiTile({ label, value, sub, color, onClick, active }: {
  label: string; value: ReactNode; sub?: ReactNode; color?: string;
  onClick?: () => void; active?: boolean;
}) {
  const className = `text-left w-full rounded-xl border bg-card px-4 py-3 space-y-1 ${onClick ? 'transition-colors hover:bg-muted/30 cursor-pointer' : ''} ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border'}`;
  const inner = (
    <>
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono leading-none" style={color ? { color } : undefined}>{value}</p>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={className}>{inner}</button>
    : <div className={className}>{inner}</div>;
}

/** Métrica secundária compacta (strip abaixo dos KPIs primários). */
function MiniStat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <span className="text-sm font-bold font-mono shrink-0" style={tone ? { color: tone } : undefined}>{value}</span>
    </div>
  );
}

function MiniDonut({ title, data, isLoading }: { title: string; data?: NameValue[]; isLoading: boolean }) {
  const total = (data ?? []).reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {!isLoading && <p className="text-xs text-muted-foreground">{total} registros</p>}
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {isLoading || !data ? <Skeleton className="h-36 w-full" /> : (
          <div className="flex items-center gap-4">
            <div className="h-36 flex-1 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={3} dataKey="value" nameKey="name">
                    {data.map((e, i) => <Cell key={e.name} fill={colorFor(e.name, i)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 text-xs shrink-0 max-w-[55%]">
              {data.map((e, i) => (
                <div key={e.name} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colorFor(e.name, i) }} />
                  <span className="text-muted-foreground truncate">{e.name}</span>
                  <span className="font-bold font-mono ml-auto pl-2">{e.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Barras horizontais: mostra top-N e expande (com rolagem) o restante. */
function MiniBars({ title, data, isLoading, topN = 5 }: {
  title: string; data?: NameValue[]; isLoading: boolean; topN?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = data ?? [];
  const max = Math.max(1, ...rows.map(d => d.value));
  const overflow = rows.length - topN;
  const visible = expanded ? rows : rows.slice(0, topN);
  useEffect(() => { setExpanded(false); }, [title, rows.length]);

  const Bar = ({ d, i }: { d: NameValue; i: number }) => (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground truncate pr-2">{d.name}</span>
        <span className="font-bold font-mono">{d.value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(3, pct(d.value, max))}%`, background: PALETTE[i % PALETTE.length] }} />
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {!isLoading && rows.length > 0 && (
          <span className="text-[11px] text-muted-foreground">top {Math.min(topN, rows.length)} de {rows.length}</span>
        )}
      </CardHeader>
      <CardContent className="pt-2 pb-4 space-y-2.5">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">sem dados</p>
        ) : (
          <>
            {!expanded && visible.map((d, i) => <Bar key={d.name} d={d} i={i} />)}
            {expanded && (
              <ScrollArea className="max-h-52 pr-2">
                <div className="space-y-2.5">
                  {rows.map((d, i) => <Bar key={d.name} d={d} i={i} />)}
                </div>
              </ScrollArea>
            )}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline pt-0.5"
              >
                <ChevronsUpDown className="h-3 w-3" />
                {expanded ? 'Recolher' : `Mostrar todos (+${overflow})`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SimNaoTile({ label, valor, isLoading }: { label: string; valor?: SimNao; isLoading: boolean }) {
  const total = valor ? valor.sim + valor.nao : 0;
  const p = valor ? pct(valor.sim, total) : 0;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
      {isLoading || !valor ? <Skeleton className="h-10 w-full" /> : (
        <>
          <div className="flex items-end justify-between mb-1.5">
            <span className={`text-2xl font-bold font-mono leading-none ${p >= 80 ? 'text-emerald-500' : p >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{p}%</span>
            <span className="text-[11px] text-muted-foreground">{valor.sim} sim · {valor.nao} não</span>
          </div>
          <div className="h-1.5 rounded-full bg-red-500/25 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${p}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

/** Colapsável para gráficos secundários — reduz o ruído da visão principal. */
function MaisAnalises({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Menos análises' : 'Mais análises'}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface SgColumn<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
}

/** Célula "OS" — identificador destacado, monoespaçado, com cópia rápida. */
function OsCell({ value, q }: { value: string; q: string }) {
  const [copied, setCopied] = useState(false);
  const clean = value && value !== '—' ? value : '';
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!clean) return;
    navigator.clipboard?.writeText(clean).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };
  return (
    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-primary">
      <Highlight text={value || '—'} q={q} />
      {clean && (
        <button type="button" onClick={copy} aria-label="Copiar OS" className="text-muted-foreground/50 hover:text-primary transition-colors">
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </span>
  );
}

function SgTable<T extends { id: number }>({ title, columns, rows, isLoading, onRowClick }: {
  title: string; columns: SgColumn<T>[]; rows?: T[]; isLoading: boolean;
  onRowClick?: (row: T) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {!isLoading && rows && <p className="text-xs text-muted-foreground">{rows.length} itens{onRowClick ? ' · clique para detalhes' : ''}</p>}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading || !rows ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">Nenhum registro para o filtro/busca atual.</p>
        ) : (
          <ScrollArea className="max-h-80">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border z-10">
                <tr className="text-muted-foreground text-[11px]">
                  {columns.map(c => <th key={c.key} className={`py-2 px-3 text-left font-medium ${c.className ?? ''}`}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-b border-border/40 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-primary/5' : 'hover:bg-muted/30'}`}
                  >
                    {columns.map(c => (
                      <td key={c.key} className={`py-2 px-3 ${c.className ?? ''}`}>
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#64748b';
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `${color}20`, color }}>
      {status}
    </span>
  );
}

// ── Detalhe do registro (drawer) ──────────────────────────────────────

interface RecordDetail {
  os: string;
  titulo: string;
  origem: string;
  campos: { label: string; value: ReactNode }[];
}

function RecordSheet({ detail, onClose }: { detail: RecordDetail | null; onClose: () => void }) {
  return (
    <Sheet open={!!detail} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        {detail && (
          <>
            <SheetHeader className="border-b border-border p-5 space-y-1 text-left">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{detail.origem}</p>
              <SheetTitle className="font-mono text-primary text-base">{detail.os}</SheetTitle>
              <p className="text-sm text-foreground leading-snug">{detail.titulo}</p>
            </SheetHeader>
            <dl className="divide-y divide-border/60">
              {detail.campos.map(({ label, value }) => (
                <div key={label} className="grid grid-cols-[130px_1fr] gap-3 px-5 py-2.5">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground pt-0.5">{label}</dt>
                  <dd className="text-xs text-foreground break-words">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Painel principal ──────────────────────────────────────────────────

export function BIInfraSgsiPanel({ dateFrom, dateTo, secao = 'mudancas', onSecaoChange }: {
  dateFrom?: Date; dateTo?: Date;
  /** Seção inicial — semeada pelo dropdown da aba Gestão SG no dashboard */
  secao?: string;
  /** Mantém o dropdown da aba em sincronia quando as pills trocam de seção */
  onSecaoChange?: (secao: string) => void;
}) {
  const { data, isLoading, isError, refetch } = useBIInfraSgsi(dateFrom, dateTo);

  // Seção controlada pelo painel (pills); semeada e sincronizada com o prop.
  const [activeSecao, setActiveSecao] = useState(secao);
  useEffect(() => { setActiveSecao(secao); }, [secao]);
  const gotoSecao = (s: string) => { setActiveSecao(s); onSecaoChange?.(s); };

  // Busca global (OS/chamado/protocolo/solicitante/ambiente/…) em todas as seções
  const [q, setQ] = useState('');
  // Drill-through: clique nos KPIs filtra a tabela analítica do bloco
  const [drill, setDrill] = useState<string | null>(null);
  const toggleDrill = (k: string) => setDrill((p) => (p === k ? null : k));
  useEffect(() => { setDrill(null); }, [activeSecao]);

  // Registro aberto no drawer
  const [detail, setDetail] = useState<RecordDetail | null>(null);

  const d = data;

  // ── Filtros por seção: drill (KPI) + busca global ──
  const mudItens = (d?.mudancas.itens ?? []).filter((i) => {
    const drillOk = (() => {
      switch (drill) {
        case 'mud:concluidas': return /realizado|conclu/i.test(i.status);
        case 'mud:pendentes': return !/realizado|conclu|rejeitad/i.test(i.status);
        default: return true;
      }
    })();
    return drillOk && hit(q, i.chamado, i.ambiente, i.tipoMudanca, i.categoria, i.motivo, i.status, i.solicitante, i.aprovadorTI, i.risco);
  });
  const incItens = (d?.incidentes.itens ?? []).filter((i) => {
    const drillOk = (() => {
      switch (drill) {
        case 'inc:ativos': return /ativo|aberto|andamento/i.test(i.status);
        case 'inc:resolvidos': return /resolv|encerr|conclu/i.test(i.status);
        default: return true;
      }
    })();
    return drillOk && hit(q, i.protocolo, i.titulo, i.ativo, i.motivo, i.priorizacao, i.status, i.tipo, i.sla, i.categoria);
  });
  const riscoItens = (d?.riscos.itens ?? []).filter((i) => {
    const drillOk = drill === 'risco:abertos' ? !/tratad|encerr|conclu|finaliz|rejeitad/i.test(i.status) : true;
    return drillOk && hit(q, i.id, i.descricao, i.cid, i.categoriaAmeaca, i.tipoAmeaca, i.ativoAfetado, i.status, i.responsavelAjuste);
  });
  const ncItens = (d?.naoConformidades.itens ?? []).filter((i) => {
    const drillOk = drill === 'nc:recorrentes' ? i.recorrente : true;
    return drillOk && hit(q, i.processo, i.detalhes, i.causaRaiz, i.status, i.solicitante);
  });
  const omItens = (d?.melhorias.itens ?? []).filter((i) =>
    hit(q, i.oportunidade, i.processo, i.beneficios, i.status, i.solicitante),
  );
  const acessoItens = (d?.acessos.itens ?? []).filter((i) => {
    const drillOk = (() => {
      switch (drill) {
        case 'acs:pendentes': return /pendente|aguard|análise|analise/i.test(i.status);
        case 'acs:admin': return i.permissoesAdmin;
        default: return true;
      }
    })();
    return drillOk && hit(q, i.titulo, i.descricao, i.tipo, i.projeto, i.solicitante, i.status);
  });

  // ── Contadores da busca por seção (ignora drill) — para os chips cross-seção ──
  const searchCounts = useMemo(() => {
    if (!q || !d) return null;
    return {
      mudancas: d.mudancas.itens.filter((i) => hit(q, i.chamado, i.ambiente, i.tipoMudanca, i.categoria, i.motivo, i.status, i.solicitante, i.aprovadorTI, i.risco)).length,
      incidentes: d.incidentes.itens.filter((i) => hit(q, i.protocolo, i.titulo, i.ativo, i.motivo, i.priorizacao, i.status, i.tipo, i.sla, i.categoria)).length,
      riscos: d.riscos.itens.filter((i) => hit(q, i.id, i.descricao, i.cid, i.categoriaAmeaca, i.tipoAmeaca, i.ativoAfetado, i.status, i.responsavelAjuste)).length,
      conformidade:
        d.naoConformidades.itens.filter((i) => hit(q, i.processo, i.detalhes, i.causaRaiz, i.status, i.solicitante)).length +
        d.melhorias.itens.filter((i) => hit(q, i.oportunidade, i.processo, i.beneficios, i.status, i.solicitante)).length,
      acessos: d.acessos.itens.filter((i) => hit(q, i.titulo, i.descricao, i.tipo, i.projeto, i.solicitante, i.status)).length,
    } as Record<string, number>;
  }, [q, d]);
  const totalHits = searchCounts ? Object.values(searchCounts).reduce((s, n) => s + n, 0) : 0;

  const drillBadge = drill ? ' · filtro do KPI ativo' : '';

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  if (d && d.totalItensBase === 0) {
    return (
      <DashboardEmptyState description="Nenhum dado SGSI sincronizado ainda — use 'Sincronizar SGSI (SharePoint)' no menu de sincronização do setor para espelhar as listas do site PORTALSGSI." />
    );
  }

  const diasSemCards = [
    { label: 'Dias sem incidentes', value: d?.diasSem.incidentes, icon: Flame, color: '#10b981' },
    { label: 'Dias sem riscos novos', value: d?.diasSem.riscos, icon: AlertTriangle, color: '#3b82f6' },
    { label: 'Dias sem não conformidades', value: d?.diasSem.naoConformidades, icon: FileWarning, color: '#8b5cf6' },
    { label: 'Dias sem atualização malsucedida', value: d?.diasSem.attMalSucedidas, icon: RefreshCw, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho: título + atualização + busca global ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-base font-bold tracking-tight uppercase whitespace-nowrap">Gestão SG · Listas SharePoint</h2>
          {d && (
            <span className="text-[11px] text-muted-foreground ml-1 hidden xl:inline-flex items-center gap-1 whitespace-nowrap">
              <CalendarCheck className="h-3 w-3" /> atualizado em {fmtDate(d.atualizadoEm)}
              {dateFrom && dateTo
                ? <> · {d.totalItens} de {d.totalItensBase} itens</>
                : <> · {d.totalItensBase} itens</>}
            </span>
          )}
        </div>
        <div className="relative w-full lg:w-80 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar OS, chamado, protocolo, solicitante…"
            className="h-9 pl-9 pr-9 text-sm"
            aria-label="Busca global na Gestão SG"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Resultados cross-seção da busca ── */}
      {q && searchCounts && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {totalHits > 0 ? `${totalHits} resultado${totalHits > 1 ? 's' : ''} para “${q}”:` : `Nada encontrado para “${q}”.`}
          </span>
          {SGSI_SECOES.map(({ value, label }) => {
            const n = searchCounts[value] ?? 0;
            if (n === 0) return null;
            return (
              <button
                key={value}
                type="button"
                onClick={() => gotoSecao(value)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${activeSecao === value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/40'}`}
              >
                {label}
                <span className="font-mono font-bold">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Gestão à vista — dias sem ocorrências ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {diasSemCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1 rounded-md" style={{ background: `${color}15` }}>
                <Icon className="h-3 w-3" style={{ color }} />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            </div>
            {isLoading ? <Skeleton className="h-8 w-16" /> : (
              <span className="text-3xl font-bold font-mono" style={{ color }}>{value ?? '—'}</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Seletor de seções (pills) ── */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/30 p-1.5">
        {SGSI_SECOES.map(({ value, label, badge, Icon }) => {
          const on = activeSecao === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => gotoSecao(value)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`font-mono text-[10px] ${on ? 'text-primary' : 'text-muted-foreground/60'}`}>{badge}</span>
            </button>
          );
        })}
      </div>

      {d && d.totalItens === 0 && d.totalItensBase > 0 ? (
        <DashboardEmptyState description={`Nenhuma atividade SG no período selecionado (${d.totalItensBase} itens no histórico). Selecione "Todas as Sprints" para ver o panorama completo.`} />
      ) : (
      <Tabs value={activeSecao}>

        {/* ── Mudanças (SG-LST-010) ── */}
        <TabsContent value="mudancas" className="space-y-3 mt-0">
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label="Solicitações" value={d?.mudancas.total ?? '—'} onClick={() => setDrill(null)} active={!drill} />
            <KpiTile label="Concluídas" value={d ? `${pct(d.mudancas.concluidos, d.mudancas.total)}%` : '—'} sub={d && `${d.mudancas.concluidos} itens`} color="#10b981" onClick={() => toggleDrill('mud:concluidas')} active={drill === 'mud:concluidas'} />
            <KpiTile label="Pendentes" value={d ? `${pct(d.mudancas.pendentes, d.mudancas.total)}%` : '—'} sub={d && `${d.mudancas.pendentes} itens`} color="#f59e0b" onClick={() => toggleDrill('mud:pendentes')} active={drill === 'mud:pendentes'} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <MiniStat label="Aguardando Gestor" value={d?.mudancas.aguardandoGestor ?? '—'} tone="#8b5cf6" />
            <MiniStat label="Aguardando TI" value={d?.mudancas.aguardandoTI ?? '—'} tone="#3b82f6" />
            <MiniStat label="Atualização OK" value={d ? `${pct(d.mudancas.atualizacoesBemSucedidas.sim, d.mudancas.atualizacoesBemSucedidas.sim + d.mudancas.atualizacoesBemSucedidas.nao)}%` : '—'} tone="#10b981" />
            <MiniStat label="Validação e testes" value={d ? `${pct(d.mudancas.validacaoTestes.sim, d.mudancas.validacaoTestes.sim + d.mudancas.validacaoTestes.nao)}%` : '—'} tone="#10b981" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniDonut title="Por status" data={d?.mudancas.porStatus} isLoading={isLoading} />
            <MiniBars title="Por ambiente" data={d?.mudancas.porAmbiente} isLoading={isLoading} />
          </div>
          <MaisAnalises>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniDonut title="Por risco" data={d?.mudancas.porRisco} isLoading={isLoading} />
              <MiniBars title="Por categoria" data={d?.mudancas.porCategoria} isLoading={isLoading} />
            </div>
          </MaisAnalises>
          <SgTable
            title={`Mudanças e atualizações${drillBadge}`}
            isLoading={isLoading}
            rows={mudItens}
            onRowClick={(r) => setDetail({
              os: r.chamado, titulo: r.motivo !== '—' ? r.motivo : r.tipoMudanca, origem: 'SG-LST-010 · Mudança',
              campos: [
                { label: 'Ambiente', value: r.ambiente }, { label: 'Tipo', value: r.tipoMudanca },
                { label: 'Categoria', value: r.categoria }, { label: 'Risco', value: r.risco },
                { label: 'Status', value: <StatusBadge status={r.status} /> }, { label: 'Solicitante', value: r.solicitante },
                { label: 'Aprovador TI', value: r.aprovadorTI }, { label: 'Motivo', value: r.motivo },
                { label: 'Modificado', value: fmtDate(r.modificado) },
              ],
            })}
            columns={[
              { key: 'chamado', header: 'OS / Chamado', render: r => <OsCell value={r.chamado} q={q} /> },
              { key: 'ambiente', header: 'Ambiente' },
              { key: 'tipoMudanca', header: 'Tipo' },
              { key: 'risco', header: 'Risco', render: r => <Badge variant={r.risco === 'Alto' ? 'destructive' : 'outline'} className="text-[10px]">{r.risco}</Badge> },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'solicitante', header: 'Solicitante' },
              { key: 'modificado', header: 'Modificado', render: r => fmtDate(r.modificado) },
            ]}
          />
        </TabsContent>

        {/* ── Incidentes (SG-LST-017) ── */}
        <TabsContent value="incidentes" className="space-y-3 mt-0">
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label="Incidentes" value={d?.incidentes.total ?? '—'} onClick={() => setDrill(null)} active={!drill} />
            <KpiTile label="Ativos" value={d?.incidentes.ativos ?? '—'} sub={d && `${pct(d.incidentes.ativos, d.incidentes.total)}% do total`} color="#ef4444" onClick={() => toggleDrill('inc:ativos')} active={drill === 'inc:ativos'} />
            <KpiTile label="Resolvidos" value={d?.incidentes.resolvidos ?? '—'} sub={d && `${pct(d.incidentes.resolvidos, d.incidentes.total)}% do total`} color="#10b981" onClick={() => toggleDrill('inc:resolvidos')} active={drill === 'inc:resolvidos'} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Contornados" value={d?.incidentes.contornados ?? '—'} tone="#f59e0b" />
            <MiniStat label="Dentro do SLA" value={d?.incidentes.pctDentroSla != null ? `${d.incidentes.pctDentroSla}%` : '—'} tone="#10b981" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniDonut title="SLA" data={d?.incidentes.porSLA} isLoading={isLoading} />
            <MiniDonut title="Por categoria" data={d?.incidentes.porCategoria} isLoading={isLoading} />
          </div>
          <SgTable
            title={`Incidentes${drillBadge}`}
            isLoading={isLoading}
            rows={incItens}
            onRowClick={(r) => setDetail({
              os: r.protocolo, titulo: r.titulo, origem: 'SG-LST-017 · Incidente',
              campos: [
                { label: 'Ativo', value: r.ativo }, { label: 'Tipo', value: r.tipo },
                { label: 'Prioridade', value: r.priorizacao }, { label: 'SLA', value: <StatusBadge status={r.sla} /> },
                { label: 'Status', value: <StatusBadge status={r.status} /> },
                { label: 'Downtime', value: r.downtimeHoras > 0 ? `${r.downtimeHoras.toFixed(1)}h` : '—' },
                { label: 'Motivo', value: r.motivo }, { label: 'Início', value: fmtDate(r.inicio) },
              ],
            })}
            columns={[
              { key: 'protocolo', header: 'OS / Protocolo', render: r => <OsCell value={r.protocolo} q={q} /> },
              { key: 'titulo', header: 'Título', className: 'max-w-[220px] truncate', render: r => <Highlight text={r.titulo} q={q} /> },
              { key: 'ativo', header: 'Ativo' },
              { key: 'priorizacao', header: 'Prioridade', render: r => <Badge variant={r.priorizacao === 'Alta' ? 'destructive' : 'outline'} className="text-[10px]">{r.priorizacao}</Badge> },
              { key: 'sla', header: 'SLA', render: r => <StatusBadge status={r.sla} /> },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'inicio', header: 'Início', render: r => fmtDate(r.inicio) },
            ]}
          />
        </TabsContent>

        {/* ── Riscos (SG-LST-012) ── */}
        <TabsContent value="riscos" className="space-y-3 mt-0">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiTile label="Riscos mapeados" value={d?.riscos.total ?? '—'} onClick={() => setDrill(null)} active={!drill} />
            <KpiTile label="Em aberto" value={d?.riscos.abertos ?? '—'} color="#f59e0b" onClick={() => toggleDrill('risco:abertos')} active={drill === 'risco:abertos'} />
            <SimNaoTile label="Plano de tratamento eficaz" valor={d?.riscos.tratamentoEficaz} isLoading={isLoading} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniDonut title="Por status" data={d?.riscos.porStatus} isLoading={isLoading} />
            <MiniBars title="Por ambiente" data={d?.riscos.porAmbiente} isLoading={isLoading} />
          </div>
          <MaisAnalises>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <MiniDonut title="CID afetado" data={d?.riscos.porCID} isLoading={isLoading} />
              <MiniDonut title="Categoria da ameaça" data={d?.riscos.porCategoriaAmeaca} isLoading={isLoading} />
              <MiniDonut title="Tipo de ameaça" data={d?.riscos.porTipoAmeaca} isLoading={isLoading} />
              <MiniBars title="O que o risco afeta" data={d?.riscos.porAtivoAfetado} isLoading={isLoading} />
            </div>
          </MaisAnalises>
          <SgTable
            title={`Análises de risco${drillBadge}`}
            isLoading={isLoading}
            rows={riscoItens}
            onRowClick={(r) => setDetail({
              os: `#${r.id}`, titulo: r.descricao, origem: 'SG-LST-012 · Risco',
              campos: [
                { label: 'CID', value: r.cid }, { label: 'Categoria', value: r.categoriaAmeaca },
                { label: 'Tipo ameaça', value: r.tipoAmeaca }, { label: 'Ativo/afeta', value: r.ativoAfetado },
                { label: 'Ambiente', value: r.ambiente }, { label: 'Status', value: <StatusBadge status={r.status} /> },
                { label: 'Responsável', value: r.responsavelAjuste }, { label: 'Limite', value: fmtDate(r.dataLimite) },
                { label: 'Eficaz?', value: r.eficaz },
              ],
            })}
            columns={[
              { key: 'id', header: 'ID', render: r => <OsCell value={`#${r.id}`} q={q} /> },
              { key: 'descricao', header: 'Risco', className: 'max-w-[240px] truncate', render: r => <Highlight text={r.descricao} q={q} /> },
              { key: 'cid', header: 'CID' },
              { key: 'categoriaAmeaca', header: 'Categoria' },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'responsavelAjuste', header: 'Responsável' },
              { key: 'dataLimite', header: 'Limite', render: r => fmtDate(r.dataLimite) },
            ]}
          />
        </TabsContent>

        {/* ── NC & Melhorias (SG-LST-018 / SG-LST-011) ── */}
        <TabsContent value="conformidade" className="space-y-3 mt-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-bold uppercase tracking-tight">Não conformidades (018)</h3>
              <div className="grid grid-cols-2 gap-3">
                <KpiTile label="Total NC" value={d?.naoConformidades.total ?? '—'} onClick={() => setDrill(null)} active={!drill} />
                <KpiTile label="Recorrentes" value={d?.naoConformidades.recorrentes ?? '—'} color="#ef4444" onClick={() => toggleDrill('nc:recorrentes')} active={drill === 'nc:recorrentes'} />
              </div>
              <SimNaoTile label="Tratamento eficaz" valor={d?.naoConformidades.tratamentoEficaz} isLoading={isLoading} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MiniDonut title="Por status" data={d?.naoConformidades.porStatus} isLoading={isLoading} />
                <MiniBars title="Causa raiz" data={d?.naoConformidades.porCausaRaiz} isLoading={isLoading} />
              </div>
              <SgTable
                title={`NC${drillBadge}`}
                isLoading={isLoading}
                rows={ncItens}
                onRowClick={(r) => setDetail({
                  os: r.processo, titulo: r.detalhes, origem: 'SG-LST-018 · Não conformidade',
                  campos: [
                    { label: 'Processo', value: r.processo }, { label: 'Causa raiz', value: r.causaRaiz },
                    { label: 'Recorrente', value: r.recorrente ? 'Sim' : 'Não' }, { label: 'Ação', value: r.acao },
                    { label: 'Status', value: <StatusBadge status={r.status} /> }, { label: 'Eficaz?', value: r.eficaz },
                    { label: 'Solicitante', value: r.solicitante }, { label: 'Criado', value: fmtDate(r.criado) },
                  ],
                })}
                columns={[
                  { key: 'processo', header: 'Processo', render: r => <span className="font-medium"><Highlight text={r.processo} q={q} /></span> },
                  { key: 'causaRaiz', header: 'Causa raiz', className: 'max-w-[160px] truncate' },
                  { key: 'recorrente', header: 'Recorrente', render: r => r.recorrente ? <Badge variant="destructive" className="text-[10px]">Sim</Badge> : 'Não' },
                  { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
                  { key: 'criado', header: 'Criado', render: r => fmtDate(r.criado) },
                ]}
              />
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <h3 className="text-sm font-bold uppercase tracking-tight">Oportunidades de melhoria (011)</h3>
              <div className="grid grid-cols-2 gap-3">
                <KpiTile label="Total OM" value={d?.melhorias.total ?? '—'} />
                <KpiTile label="Eficazes" value={d?.melhorias.eficazes ?? '—'} sub={d && `${pct(d.melhorias.eficazes, d.melhorias.total)}% do total`} color="#10b981" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <MiniDonut title="Por status" data={d?.melhorias.porStatus} isLoading={isLoading} />
                <MiniBars title="Processo afetado" data={d?.melhorias.porAmbiente} isLoading={isLoading} />
              </div>
              <SgTable
                title="OM recentes"
                isLoading={isLoading}
                rows={omItens}
                onRowClick={(r) => setDetail({
                  os: `OM #${r.id}`, titulo: r.oportunidade, origem: 'SG-LST-011 · Melhoria',
                  campos: [
                    { label: 'Processo', value: r.processo }, { label: 'Benefícios', value: r.beneficios },
                    { label: 'Status', value: <StatusBadge status={r.status} /> }, { label: 'Eficaz?', value: r.eficaz },
                    { label: 'Solicitante', value: r.solicitante },
                  ],
                })}
                columns={[
                  { key: 'oportunidade', header: 'Oportunidade', className: 'max-w-[200px] truncate', render: r => <Highlight text={r.oportunidade} q={q} /> },
                  { key: 'processo', header: 'Processo' },
                  { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
                  { key: 'solicitante', header: 'Solicitante' },
                ]}
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Acessos (SG-LST-014) ── */}
        <TabsContent value="acessos" className="space-y-3 mt-0">
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label="Solicitações" value={d?.acessos.total ?? '—'} onClick={() => setDrill(null)} active={!drill} />
            <KpiTile label="Pendentes" value={d?.acessos.pendentes ?? '—'} color="#f59e0b" onClick={() => toggleDrill('acs:pendentes')} active={drill === 'acs:pendentes'} />
            <KpiTile label="Permissões admin" value={d?.acessos.permissoesAdmin.sim ?? '—'} sub="exigem revisão" color="#ef4444" onClick={() => toggleDrill('acs:admin')} active={drill === 'acs:admin'} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Acesso DevOps" value={d?.acessos.acessoDevOps.sim ?? '—'} tone="#3b82f6" />
            <MiniStat label="Acesso TS" value={d?.acessos.acessoTS.sim ?? '—'} tone="#8b5cf6" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <MiniDonut title="Por status" data={d?.acessos.porStatus} isLoading={isLoading} />
            <MiniBars title="Tipo de solicitação" data={d?.acessos.porTipo} isLoading={isLoading} />
            <MiniBars title="Por projeto" data={d?.acessos.porProjeto} isLoading={isLoading} />
          </div>
          <SgTable
            title={`Solicitações de acesso${drillBadge}`}
            isLoading={isLoading}
            rows={acessoItens}
            onRowClick={(r) => setDetail({
              os: r.titulo, titulo: r.descricao, origem: 'SG-LST-014 · Acesso',
              campos: [
                { label: 'Tipo', value: r.tipo }, { label: 'Projeto', value: r.projeto },
                { label: 'Solicitante', value: r.solicitante }, { label: 'Acesso DevOps', value: r.acessoDevOps ? 'Sim' : 'Não' },
                { label: 'Acesso TS', value: r.acessoTS ? 'Sim' : 'Não' }, { label: 'Admin', value: r.permissoesAdmin ? 'Sim' : 'Não' },
                { label: 'Status', value: <StatusBadge status={r.status} /> }, { label: 'Descrição', value: r.descricao },
                { label: 'Última revisão', value: fmtDate(r.ultimaRevisao) },
              ],
            })}
            columns={[
              { key: 'titulo', header: 'OS / Solicitação', render: r => <OsCell value={r.titulo} q={q} /> },
              { key: 'tipo', header: 'Tipo' },
              { key: 'projeto', header: 'Projeto' },
              { key: 'solicitante', header: 'Solicitante' },
              { key: 'permissoesAdmin', header: 'Admin', render: r => r.permissoesAdmin ? <Badge variant="destructive" className="text-[10px]">Sim</Badge> : 'Não' },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'ultimaRevisao', header: 'Última revisão', render: r => fmtDate(r.ultimaRevisao) },
            ]}
          />
        </TabsContent>
      </Tabs>
      )}

      <RecordSheet detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
