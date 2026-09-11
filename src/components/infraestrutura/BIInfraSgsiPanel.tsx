import { ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { useBIInfraSgsi, NameValue, SimNao, SgMudancaItem, SgAcessoItem } from '@/hooks/useBIInfra';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  ShieldCheck, RefreshCw, Flame, AlertTriangle, KeyRound, Lightbulb,
  CalendarCheck, Search, X, Copy, Check, ChevronDown, ChevronsUpDown, Eye, EyeOff, ExternalLink,
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

/** Data sem hora (dia de calendário): usa o dia do texto, sem converter fuso —
 *  "2026-09-09T00:00:00Z" é 09/09 mesmo com o navegador em Brasília. */
function fmtDiaCalendario(iso?: string | null) {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : fmtDate(iso);
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

function KpiTile({ label, value, sub, color, onClick, active, bare }: {
  label: string; value: ReactNode; sub?: ReactNode; color?: string;
  onClick?: () => void; active?: boolean;
  /** Sem borda/fundo próprios — para uso dentro de um GroupCard consolidado. */
  bare?: boolean;
}) {
  const base = bare
    ? `text-left w-full rounded-lg px-3 py-2 space-y-1 ${onClick ? 'transition-colors hover:bg-muted/40 cursor-pointer' : ''} ${active ? 'bg-primary/5 ring-1 ring-primary/40' : ''}`
    : `text-left w-full rounded-xl border bg-card px-4 py-3 space-y-1 ${onClick ? 'transition-colors hover:bg-muted/30 cursor-pointer' : ''} ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border'}`;
  const inner = (
    <>
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono leading-none" style={color ? { color } : undefined}>{value}</p>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={!!active} className={base}>{inner}</button>
    : <div className={base}>{inner}</div>;
}

/** Card consolidado com título e uma grade de métricas internas (sem bordas duplas). */
function GroupCard({ title, cols = 3, className, children }: {
  title: string; cols?: number;
  /** Posição na grade da linha (ex.: col-span por breakpoint). */
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  // 3 tiles viram 2 colunas no celular: "AGUARDANDO" não cabe em 1/3 do card.
  const gridCols = cols === 4 ? 'grid-cols-2 lg:grid-cols-4' : cols === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';
  return (
    <Card className={`p-3 space-y-2 ${className ?? ''}`}>
      <p id={titleId} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground px-1">{title}</p>
      {/* Grupo rotulado: o leitor de tela anuncia o título antes de "Sim, 67%". */}
      <div role="group" aria-labelledby={titleId} className={`grid ${gridCols} gap-1`}>{children}</div>
    </Card>
  );
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

function MiniDonut({ title, data, isLoading, onSelect }: {
  title: string; data?: NameValue[]; isLoading: boolean;
  /** Clique numa fatia/legenda → dirige a tabela analítica abaixo. */
  onSelect?: (name: string) => void;
}) {
  const total = (data ?? []).reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {!isLoading && <p className="text-xs text-muted-foreground">{total} registros{onSelect ? ' · clique para filtrar' : ''}</p>}
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {isLoading || !data ? <Skeleton className="h-36 w-full" /> : (
          <div className="flex items-center gap-4">
            <div className="h-36 flex-1 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={3} dataKey="value" nameKey="name"
                    onClick={onSelect ? (e: { name?: string }) => e?.name && onSelect(e.name) : undefined}
                    className={onSelect ? 'cursor-pointer focus:outline-none' : undefined}>
                    {data.map((e, i) => <Cell key={e.name} fill={colorFor(e.name, i)} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 text-xs shrink-0 max-w-[55%]">
              {data.map((e, i) => {
                const row = (
                  <>
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colorFor(e.name, i) }} />
                    <span className="text-muted-foreground truncate">{e.name}</span>
                    <span className="font-bold font-mono ml-auto pl-2">{e.value}</span>
                  </>
                );
                return onSelect ? (
                  <button key={e.name} type="button" onClick={() => onSelect(e.name)}
                    className="flex w-full items-center gap-2 rounded hover:bg-muted/40 transition-colors text-left">
                    {row}
                  </button>
                ) : (
                  <div key={e.name} className="flex items-center gap-2">{row}</div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Barras horizontais: mostra top-N e expande (com rolagem) o restante. */
function MiniBars({ title, data, isLoading, topN = 5, onSelect }: {
  title: string; data?: NameValue[]; isLoading: boolean; topN?: number;
  /** Clique numa barra → dirige a tabela analítica abaixo. */
  onSelect?: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = data ?? [];
  const max = Math.max(1, ...rows.map(d => d.value));
  const overflow = rows.length - topN;
  const visible = expanded ? rows : rows.slice(0, topN);
  useEffect(() => { setExpanded(false); }, [title, rows.length]);

  const Bar = ({ d, i }: { d: NameValue; i: number }) => {
    const content = (
      <>
        <div className="flex items-center justify-between gap-2 text-xs mb-1">
          <span className="text-muted-foreground truncate pr-2">{d.name}</span>
          <span className="font-bold font-mono shrink-0">{d.value}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(3, pct(d.value, max)))}%`, background: PALETTE[i % PALETTE.length] }} />
        </div>
      </>
    );
    return onSelect ? (
      <button type="button" onClick={() => onSelect(d.name)} className="block w-full text-left rounded px-1 -mx-1 hover:bg-muted/40 transition-colors">
        {content}
      </button>
    ) : (
      <div>{content}</div>
    );
  };

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

/** Teto de linhas no DOM — a tabela não virtualiza. Filtro, contagem e drill
 *  continuam sobre a lista inteira; "Mostrar mais" monta o lote seguinte. */
const LOTE_LINHAS = 300;

function SgTable<T extends { id: number }>({ title, columns, rows, isLoading, onRowClick, headerAction }: {
  title: string; columns: SgColumn<T>[]; rows?: T[]; isLoading: boolean;
  onRowClick?: (row: T) => void;
  /** Ação extra no cabeçalho do card (ex.: toggle compacto/completo). */
  headerAction?: ReactNode;
}) {
  const total = rows?.length ?? 0;
  const [limite, setLimite] = useState(LOTE_LINHAS);
  // Filtro ou busca mudou a contagem → volta ao primeiro lote.
  useEffect(() => { setLimite(LOTE_LINHAS); }, [total]);
  const restantes = total - limite;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4 flex-row items-start justify-between space-y-0 gap-2">
        <div className="space-y-1 min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {!isLoading && rows && <p className="text-xs text-muted-foreground">{rows.length} itens{restantes > 0 ? ` · exibindo ${limite}` : ''}{onRowClick ? ' · clique para detalhes' : ''}</p>}
        </div>
        {headerAction}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading || !rows ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">Nenhum registro para o filtro/busca atual.</p>
        ) : (
          <>
          <ScrollArea className="max-h-80">
            {/* min-width quando há muitas colunas (visão completa) → rolagem
                horizontal dentro do card em vez de estourar/espremer células */}
            <table className={`w-full text-xs ${columns.length > 8 ? 'min-w-[960px]' : ''}`}>
              <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border z-10">
                <tr className="text-muted-foreground text-[11px]">
                  {columns.map(c => <th key={c.key} className={`py-2 px-3 text-left font-medium ${c.className ?? ''}`}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limite).map(row => (
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
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          {restantes > 0 && (
            <button
              type="button"
              onClick={() => setLimite((l) => l + LOTE_LINHAS)}
              className="flex w-full items-center gap-1 border-t border-border/60 px-4 py-2 text-[11px] font-medium text-primary hover:underline"
            >
              <ChevronsUpDown className="h-3 w-3" />
              Mostrar mais (+{Math.min(LOTE_LINHAS, restantes)})
            </button>
          )}
          </>
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

/** Sim/Não de campo booleano da lista — verde/vermelho; vazio fica neutro. */
function SimNaoBadge({ valor }: { valor: string }) {
  const color = valor === 'Sim' ? '#10b981' : valor === 'Não' ? '#ef4444' : undefined;
  if (!color) return <span className="text-muted-foreground">{valor || '—'}</span>;
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: `${color}20`, color }}>
      {valor}
    </span>
  );
}

/** Link para o item na lista do SharePoint; "—" sem URL. Não propaga o clique
 *  (na tabela, a linha abre o drawer). */
function LinkSharePoint({ href, texto }: { href: string; texto: string }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 whitespace-nowrap text-primary hover:underline"
    >
      <ExternalLink className="h-3 w-3" />{texto}
    </a>
  );
}

/** Revisão da TI do acesso: revisado (verde), a revisar (âmbar) ou marcado sem
 *  data (vermelho — a caixa está marcada, mas falta a evidência datada). */
/** Tons dos selos de auditoria: texto -700 no claro (contraste AA em 10–11px sobre o
 *  tint) e -400 no escuro. Classes inteiras, para o Tailwind não podar nenhuma. */
const TOM_SELO = {
  verde: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  ambar: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  azul: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  vermelho: 'bg-red-500/15 text-red-700 dark:text-red-400',
  cinza: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
} as const;

function RevisaoTIBadge({ acesso }: { acesso: Pick<SgAcessoItem, 'revisaoTI' | 'revisadoSemData'> }) {
  const [texto, tom] = acesso.revisadoSemData ? ['Revisado sem data', TOM_SELO.vermelho]
    : acesso.revisaoTI === 'Acesso Revisado' ? ['Acesso Revisado', TOM_SELO.verde] : ['A revisar', TOM_SELO.ambar];
  return (
    <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${tom}`}>
      {texto}
    </span>
  );
}

/** Tipo de liberação; no provisório, a situação da evidência de revogação. */
function LiberacaoBadge({ acesso }: { acesso: Pick<SgAcessoItem, 'tipoLiberacao' | 'evidenciaRevogacao'> }) {
  if (acesso.tipoLiberacao !== 'Provisória' || !acesso.evidenciaRevogacao) {
    return <span className="whitespace-nowrap">{acesso.tipoLiberacao}</span>;
  }
  const tom = acesso.evidenciaRevogacao === 'Com evidência' ? TOM_SELO.verde
    : acesso.evidenciaRevogacao === 'No prazo' ? TOM_SELO.azul
      : acesso.evidenciaRevogacao === 'Não se aplica' ? TOM_SELO.cinza : TOM_SELO.vermelho;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      Provisória
      <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${tom}`}>
        {acesso.evidenciaRevogacao}
      </span>
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
                  {/* min-w-0: sem ele, URL ou caminho de log sem espaço alarga a
                      trilha 1fr e o sheet inteiro rola de lado. */}
                  <dd className="min-w-0 text-xs text-foreground break-words">{value || '—'}</dd>
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

  // Tabela de mudanças: visão compacta (padrão) ↔ completa (toggle de olho)
  const [mostrarTudo, setMostrarTudo] = useState(false);

  const d = data;

  // ── Filtros por seção: drill (KPI) + busca global ──
  const mudItens = (d?.mudancas.itens ?? []).filter((i) => {
    const drillOk = (() => {
      switch (drill) {
        case 'mud:concluidas': return /realizado|conclu/i.test(i.status);
        case 'mud:pendentes': return !/realizado|conclu|rejeitad/i.test(i.status);
        case 'mud:att-sim': return i.atualizacaoBemSucedida === 'Sim';
        case 'mud:att-nao': return i.atualizacaoBemSucedida === 'Não';
        default: return true;
      }
    })();
    return drillOk && hit(q, i.chamado, i.ambiente, i.tipoMudanca, i.categoria, i.motivo, i.status, i.solicitante, i.aprovadorTI, i.aprovadorGestor, i.risco, i.justificativa);
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
      // Barra "Tipo de acesso": uma categoria, ou os itens sem nenhuma.
      if (drill?.startsWith('acs:cat:')) {
        const categoria = drill.slice('acs:cat:'.length);
        return categoria === 'Sem categoria' ? i.categorias.length === 0 : i.categorias.includes(categoria);
      }
      switch (drill) {
        case 'acs:pendentes': return /pendente|aguard|análise|analise/i.test(i.status);
        case 'acs:admin': return i.permissoesAdmin;
        // Auditoria: os mesmos campos que as contagens do hook usam.
        case 'acs:revisado': return i.revisaoTI === 'Acesso Revisado';
        case 'acs:a-revisar': return i.revisaoTI === 'A revisar';
        case 'acs:sem-data': return i.revisadoSemData;
        case 'acs:definitiva': return i.tipoLiberacao === 'Definitiva';
        case 'acs:provisoria': return i.tipoLiberacao === 'Provisória';
        case 'acs:prov-sem-evidencia': return i.evidenciaRevogacao === 'Sem evidência';
        default: return true;
      }
    })();
    return drillOk && hit(q, i.titulo, i.descricao, i.tipo, i.projeto, i.solicitante, i.aprovadorTI, i.aprovadorGestor, i.status, i.revisadoSemData ? 'Revisado sem data' : i.revisaoTI, i.tipoLiberacao, i.evidenciaRevogacao, ...i.categoriasLista);
  });

  // ── Contadores da busca por seção (ignora drill) — para os chips cross-seção ──
  const searchCounts = useMemo(() => {
    if (!q || !d) return null;
    return {
      mudancas: d.mudancas.itens.filter((i) => hit(q, i.chamado, i.ambiente, i.tipoMudanca, i.categoria, i.motivo, i.status, i.solicitante, i.aprovadorTI, i.aprovadorGestor, i.risco, i.justificativa)).length,
      incidentes: d.incidentes.itens.filter((i) => hit(q, i.protocolo, i.titulo, i.ativo, i.motivo, i.priorizacao, i.status, i.tipo, i.sla, i.categoria)).length,
      riscos: d.riscos.itens.filter((i) => hit(q, i.id, i.descricao, i.cid, i.categoriaAmeaca, i.tipoAmeaca, i.ativoAfetado, i.status, i.responsavelAjuste)).length,
      conformidade:
        d.naoConformidades.itens.filter((i) => hit(q, i.processo, i.detalhes, i.causaRaiz, i.status, i.solicitante)).length +
        d.melhorias.itens.filter((i) => hit(q, i.oportunidade, i.processo, i.beneficios, i.status, i.solicitante)).length,
      acessos: d.acessos.itens.filter((i) => hit(q, i.titulo, i.descricao, i.tipo, i.projeto, i.solicitante, i.aprovadorTI, i.aprovadorGestor, i.status, i.revisadoSemData ? 'Revisado sem data' : i.revisaoTI, i.tipoLiberacao, i.evidenciaRevogacao, ...i.categoriasLista)).length,
    } as Record<string, number>;
  }, [q, d]);
  const totalHits = searchCounts ? Object.values(searchCounts).reduce((s, n) => s + n, 0) : 0;

  const drillBadge = drill ? ' · filtro do KPI ativo' : '';

  // Atualizações bem sucedidas (Sim/Não) — a mesma contagem que o drill filtra.
  // Não% = 100 − Sim%: arredondados em separado, lado a lado somariam 101%.
  const att = d?.mudancas.atualizacoesBemSucedidas;
  const attBase = att ? att.sim + att.nao : 0;
  const attSimPct = att && attBase > 0 ? pct(att.sim, attBase) : null;

  // Justificativa da atualização (lista: "Comentário atualizações"); o texto
  // inteiro fica no title e no drawer.
  const colJustificativa: SgColumn<SgMudancaItem> = {
    key: 'justificativa', header: 'Justificativa', className: 'max-w-[280px] truncate',
    render: (r) => <span title={r.justificativa !== '—' ? r.justificativa : undefined}><Highlight text={r.justificativa} q={q} /></span>,
  };

  // Colunas da tabela de mudanças — a visão completa (olho) acrescenta as
  // datas de solicitação/conclusão e os aprovadores TI/Gestor.
  const mudColumns: SgColumn<SgMudancaItem>[] = [
    { key: 'chamado', header: 'OS / Chamado', render: (r) => <OsCell value={r.chamado} q={q} /> },
    { key: 'ambiente', header: 'Ambiente' },
    { key: 'tipoMudanca', header: 'Tipo' },
    { key: 'risco', header: 'Risco', render: (r) => <Badge variant={r.risco === 'Alto' ? 'destructive' : 'outline'} className="text-[10px]">{r.risco}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    // Filtro "Não" ligado: a justificativa entra já na visão compacta — é o que
    // se quer ler ao listar as atualizações que falharam.
    ...(drill === 'mud:att-nao' && !mostrarTudo ? [colJustificativa] : []),
    ...(mostrarTudo ? [
      { key: 'criado', header: 'Data solicitação', className: 'whitespace-nowrap', render: (r) => fmtDate(r.criado) },
      // "Data e Hora conclusão" pode ser texto livre — fmtDate devolve o
      // original quando não parseia.
      { key: 'conclusao', header: 'Conclusão', className: 'whitespace-nowrap', render: (r) => fmtDate(r.conclusao) },
      { key: 'atualizacaoBemSucedida', header: 'Bem sucedida', render: (r) => <SimNaoBadge valor={r.atualizacaoBemSucedida} /> },
      colJustificativa,
    ] as SgColumn<SgMudancaItem>[] : []),
    { key: 'solicitante', header: 'Solicitante' },
    ...(mostrarTudo ? [
      { key: 'aprovadorTI', header: 'Aprovador TI' },
      { key: 'aprovadorGestor', header: 'Aprovador Gestor' },
    ] as SgColumn<SgMudancaItem>[] : []),
    { key: 'modificado', header: 'Modificado', className: 'whitespace-nowrap', render: (r) => fmtDate(r.modificado) },
  ];

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;

  if (d && d.totalItensBase === 0) {
    return (
      <DashboardEmptyState description="Nenhum dado SGSI sincronizado ainda — use 'Sincronizar SGSI (SharePoint)' no menu de sincronização do setor para espelhar as listas do site PORTALSGSI." />
    );
  }

  // Rótulo da seção ativa (o seletor agora é o dropdown ▼ da aba "Gestão SG").
  const secaoAtiva = SGSI_SECOES.find((s) => s.value === activeSecao) ?? SGSI_SECOES[0];

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

      {/* ── Rótulo da seção ativa (troca de seção pelo dropdown ▼ da aba Gestão SG) ── */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <secaoAtiva.Icon className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-bold tracking-tight">{secaoAtiva.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground/70">SG-LST-{secaoAtiva.badge}</span>
        {activeSecao === 'acessos' && (
          <span className="text-[11px] text-muted-foreground">· base completa — o filtro de sprint não se aplica aos acessos</span>
        )}
      </div>

      {/* Acessos usa a base completa: período vazio não esconde a seção. */}
      {d && d.totalItens === 0 && d.totalItensBase > 0 && activeSecao !== 'acessos' ? (
        <DashboardEmptyState description={`Nenhuma atividade SG no período selecionado (${d.totalItensBase} itens no histórico). Selecione "Todas as Sprints" para ver o panorama completo.`} />
      ) : (
      <Tabs value={activeSecao}>

        {/* ── Mudanças (SG-LST-010) ── */}
        <TabsContent value="mudancas" className="space-y-3 mt-0">
          {/* lg: Solicitações ocupa a 1ª linha e Status divide a 2ª com o KPI de
              atualizações bem sucedidas; xl: os três lado a lado. O minmax segura
              o título do card novo numa linha com a sidebar aberta a 1280px. */}
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] xl:grid-cols-[3fr_3fr_minmax(16rem,2fr)] gap-3">
            <GroupCard title="Solicitações · Concluídas · Pendentes" cols={3} className="lg:col-span-2 xl:col-span-1">
              <KpiTile bare label="Solicitações" value={d?.mudancas.total ?? '—'} onClick={() => setDrill(null)} active={!drill} />
              <KpiTile bare label="Concluídas" value={d ? `${pct(d.mudancas.concluidos, d.mudancas.total)}%` : '—'} sub={d && `${d.mudancas.concluidos} itens`} color="#10b981" onClick={() => toggleDrill('mud:concluidas')} active={drill === 'mud:concluidas'} />
              <KpiTile bare label="Pendentes" value={d ? `${pct(d.mudancas.pendentes, d.mudancas.total)}%` : '—'} sub={d && `${d.mudancas.pendentes} itens`} color="#f59e0b" onClick={() => toggleDrill('mud:pendentes')} active={drill === 'mud:pendentes'} />
            </GroupCard>
            <GroupCard title="Status" cols={3}>
              <KpiTile bare label="Aguardando Gestor" value={d?.mudancas.aguardandoGestor ?? '—'} color="#8b5cf6" />
              <KpiTile bare label="Aguardando TI" value={d?.mudancas.aguardandoTI ?? '—'} color="#3b82f6" />
              <KpiTile bare label="Testes" value={d ? `${pct(d.mudancas.validacaoTestes.sim, d.mudancas.validacaoTestes.sim + d.mudancas.validacaoTestes.nao)}%` : '—'} color="#10b981" />
            </GroupCard>
            {/* Base do % = Sim + Não; campo vazio (mudança ainda não executada) fica fora. */}
            <GroupCard title="Atualizações bem sucedidas" cols={2}>
              <KpiTile bare label="Sim" value={attSimPct != null ? `${attSimPct}%` : '—'} sub={att && attBase > 0 ? `${att.sim} de ${attBase} itens` : undefined} color="#10b981" onClick={() => toggleDrill('mud:att-sim')} active={drill === 'mud:att-sim'} />
              <KpiTile bare label="Não" value={attSimPct != null ? `${100 - attSimPct}%` : '—'} sub={att && attBase > 0 ? `${att.nao} de ${attBase} itens` : undefined} color="#ef4444" onClick={() => toggleDrill('mud:att-nao')} active={drill === 'mud:att-nao'} />
            </GroupCard>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MiniDonut title="Por status" data={d?.mudancas.porStatus} isLoading={isLoading} onSelect={setQ} />
            <MiniBars title="Por ambiente" data={d?.mudancas.porAmbiente} isLoading={isLoading} onSelect={setQ} />
          </div>
          <MaisAnalises>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniDonut title="Por risco" data={d?.mudancas.porRisco} isLoading={isLoading} onSelect={setQ} />
              <MiniBars title="Por categoria" data={d?.mudancas.porCategoria} isLoading={isLoading} onSelect={setQ} />
            </div>
          </MaisAnalises>
          <SgTable
            title={`Mudanças e atualizações${drillBadge}`}
            isLoading={isLoading}
            rows={mudItens}
            headerAction={
              <button
                type="button"
                onClick={() => setMostrarTudo((v) => !v)}
                title={mostrarTudo ? 'Exibir visão compacta' : 'Exibir todas as informações'}
                aria-label={mostrarTudo ? 'Exibir visão compacta' : 'Exibir todas as informações'}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
              >
                {mostrarTudo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            onRowClick={(r) => setDetail({
              os: r.chamado, titulo: r.motivo !== '—' ? r.motivo : r.tipoMudanca, origem: 'SG-LST-010 · Mudança',
              campos: [
                { label: 'Ambiente', value: r.ambiente }, { label: 'Tipo', value: r.tipoMudanca },
                { label: 'Categoria', value: r.categoria }, { label: 'Risco', value: r.risco },
                { label: 'Status', value: <StatusBadge status={r.status} /> }, { label: 'Solicitante', value: r.solicitante },
                { label: 'Aprovador TI', value: r.aprovadorTI }, { label: 'Aprovador Gestor', value: r.aprovadorGestor },
                { label: 'Motivo', value: r.motivo }, { label: 'Data solicitação', value: fmtDate(r.criado) },
                { label: 'Conclusão', value: fmtDate(r.conclusao) }, { label: 'Atualização bem sucedida', value: <SimNaoBadge valor={r.atualizacaoBemSucedida} /> },
                { label: 'Justificativa', value: <span className="whitespace-pre-line">{r.justificativa}</span> },
                { label: 'Modificado', value: fmtDate(r.modificado) },
              ],
            })}
            columns={mudColumns}
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
            <MiniDonut title="SLA" data={d?.incidentes.porSLA} isLoading={isLoading} onSelect={setQ} />
            <MiniDonut title="Por categoria" data={d?.incidentes.porCategoria} isLoading={isLoading} onSelect={setQ} />
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
                { label: 'Descrição', value: r.descricao }, { label: 'Solução', value: r.solucao },
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
            <MiniDonut title="Por status" data={d?.riscos.porStatus} isLoading={isLoading} onSelect={setQ} />
            <MiniBars title="Por ambiente" data={d?.riscos.porAmbiente} isLoading={isLoading} onSelect={setQ} />
          </div>
          <MaisAnalises>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <MiniDonut title="CID afetado" data={d?.riscos.porCID} isLoading={isLoading} onSelect={setQ} />
              <MiniDonut title="Categoria da ameaça" data={d?.riscos.porCategoriaAmeaca} isLoading={isLoading} onSelect={setQ} />
              <MiniDonut title="Tipo de ameaça" data={d?.riscos.porTipoAmeaca} isLoading={isLoading} onSelect={setQ} />
              <MiniBars title="O que o risco afeta" data={d?.riscos.porAtivoAfetado} isLoading={isLoading} onSelect={setQ} />
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
                { label: 'Eficaz?', value: r.eficaz }, { label: 'Solução', value: r.solucao },
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
                <MiniDonut title="Por status" data={d?.naoConformidades.porStatus} isLoading={isLoading} onSelect={setQ} />
                <MiniBars title="Causa raiz" data={d?.naoConformidades.porCausaRaiz} isLoading={isLoading} onSelect={setQ} />
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
                <MiniDonut title="Por status" data={d?.melhorias.porStatus} isLoading={isLoading} onSelect={setQ} />
                <MiniBars title="Processo afetado" data={d?.melhorias.porAmbiente} isLoading={isLoading} onSelect={setQ} />
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
          {/* Tipo de acesso ("Categoria Liberação"); clique filtra a tabela, como os KPIs. */}
          <div role="group" aria-label="Tipo de acesso" className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">Tipo de acesso</span>
            {isLoading || !d ? <Skeleton className="h-5 w-64" /> : (
              [...d.acessos.porCategoria, ...(d.acessos.semCategoria > 0 ? [{ name: 'Sem categoria', value: d.acessos.semCategoria }] : [])].map((c) => {
                const chave = `acs:cat:${c.name}`;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => toggleDrill(chave)}
                    aria-pressed={drill === chave}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${drill === chave ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted/40'} ${c.name === 'Sem categoria' && drill !== chave ? 'text-muted-foreground' : ''}`}
                  >
                    {c.name}
                    <span className="font-mono font-bold">{c.value}</span>
                  </button>
                );
              })
            )}
          </div>
          {/* Auditoria de acessos. A caixa "<---Preenchimento TI--->" marcada, com a data da
              última revisão, é a evidência de que a TI validou o acesso (revogou, alterou ou
              manteve). Nos provisórios — a lista não tem data de revogação — ela vale como
              evidência de que foram revogados; o provisório ainda no prazo não é cobrado.
              Lado a lado só em xl: em lg, com a sidebar aberta, os tiles ficavam com ~80px. */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <GroupCard title="Revisão TI" cols={3}>
              <KpiTile bare label="Acesso revisado" value={d?.acessos.revisados ?? '—'} sub={d && `${pct(d.acessos.revisados, d.acessos.total)}% do total`} color="#10b981" onClick={() => toggleDrill('acs:revisado')} active={drill === 'acs:revisado'} />
              {/* 100 − revisados: arredondados em separado, lado a lado somariam 101%. */}
              <KpiTile bare label="A revisar" value={d?.acessos.aRevisar ?? '—'} sub={d && `${d.acessos.total > 0 ? 100 - pct(d.acessos.revisados, d.acessos.total) : 0}% do total`} color="#f59e0b" onClick={() => toggleDrill('acs:a-revisar')} active={drill === 'acs:a-revisar'} />
              <KpiTile bare label="Revisado sem data" value={d?.acessos.revisadosSemData ?? '—'} sub="caixa marcada sem data" color={d && d.acessos.revisadosSemData > 0 ? '#ef4444' : '#10b981'} onClick={() => toggleDrill('acs:sem-data')} active={drill === 'acs:sem-data'} />
            </GroupCard>
            <GroupCard title="Liberação · evidência de revogação" cols={3}>
              <KpiTile bare label="Definitivos" value={d?.acessos.definitivos ?? '—'} sub={d && `${pct(d.acessos.definitivos, d.acessos.total)}% do total`} color="#3b82f6" onClick={() => toggleDrill('acs:definitiva')} active={drill === 'acs:definitiva'} />
              {/* % sobre os provisórios que já exigiam revogação (com + sem evidência): os
                  rejeitados/aguardando nunca liberaram acesso e os no prazo ainda não venceram. */}
              <KpiTile bare label="Provisórios" value={d?.acessos.provisorios ?? '—'} sub={d && d.acessos.provisoriosComEvidencia + d.acessos.provisoriosSemEvidencia > 0 ? `${pct(d.acessos.provisoriosComEvidencia, d.acessos.provisoriosComEvidencia + d.acessos.provisoriosSemEvidencia)}% com evidência` : undefined} color="#8b5cf6" onClick={() => toggleDrill('acs:provisoria')} active={drill === 'acs:provisoria'} />
              {/* "Sem evidência" (e não "vencidos"): inclui provisório sem data fim registrada. */}
              <KpiTile bare label="Sem evidência" value={d?.acessos.provisoriosSemEvidencia ?? '—'} sub={d && `${d.acessos.provisoriosNoPrazo} no prazo · ${d.acessos.provisoriosNaoAplica} não liberados`} color={d && d.acessos.provisoriosSemEvidencia > 0 ? '#ef4444' : '#10b981'} onClick={() => toggleDrill('acs:prov-sem-evidencia')} active={drill === 'acs:prov-sem-evidencia'} />
            </GroupCard>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <MiniDonut title="Por status" data={d?.acessos.porStatus} isLoading={isLoading} onSelect={setQ} />
            <MiniBars title="Tipo de solicitação" data={d?.acessos.porTipo} isLoading={isLoading} onSelect={setQ} />
            <MiniBars title="Por projeto" data={d?.acessos.porProjeto} isLoading={isLoading} onSelect={setQ} />
          </div>
          <SgTable
            title={`Solicitações de acesso${drillBadge}`}
            isLoading={isLoading}
            rows={acessoItens}
            onRowClick={(r) => setDetail({
              os: r.titulo, titulo: r.descricao, origem: 'SG-LST-014 · Acesso',
              campos: [
                { label: 'Tipo', value: r.tipo }, { label: 'Projeto', value: r.projeto },
                { label: 'Solicitante', value: r.solicitante }, { label: 'Aprovação TI', value: r.aprovadorTI },
                { label: 'Aprovação Gestor', value: r.aprovadorGestor }, { label: 'Acesso DevOps', value: r.acessoDevOps ? 'Sim' : 'Não' },
                { label: 'Acesso TS', value: r.acessoTS ? 'Sim' : 'Não' }, { label: 'Admin', value: r.permissoesAdmin ? 'Sim' : 'Não' },
                { label: 'Status', value: <StatusBadge status={r.status} /> }, { label: 'Descrição', value: r.descricao },
                { label: 'Última revisão', value: r.revisadoSemData ? <span className="font-medium text-red-500">sem data</span> : fmtDate(r.ultimaRevisao) },
                { label: 'Revisão TI', value: <RevisaoTIBadge acesso={r} /> },
                { label: 'Liberação', value: <LiberacaoBadge acesso={r} /> },
                { label: 'Tipo de acesso', value: r.categorias.length > 0 ? r.categorias.join(', ') : '—' },
                // Texto original da lista: o agrupamento em categorias canônicas não pode esconder o que foi pedido.
                { label: 'Categoria na lista', value: r.categoriasLista.length > 0 ? r.categoriasLista.join(', ') : '—' },
                // Data de calendário (sem fuso): "até 11/06" não pode virar 10/06 no fuso de Brasília.
                ...(r.tipoLiberacao === 'Provisória' ? [{ label: 'Fim da liberação', value: fmtDiaCalendario(r.fimLiberacao) }] : []),
                { label: 'SharePoint', value: <LinkSharePoint href={r.link} texto="Abrir item na lista" /> },
              ],
            })}
            columns={[
              { key: 'titulo', header: 'OS / Solicitação', render: r => <OsCell value={r.titulo} q={q} /> },
              { key: 'tipo', header: 'Tipo' },
              { key: 'projeto', header: 'Projeto' },
              { key: 'solicitante', header: 'Solicitante' },
              { key: 'aprovadorTI', header: 'Aprovação TI' },
              { key: 'aprovadorGestor', header: 'Aprovação Gestor' },
              { key: 'permissoesAdmin', header: 'Admin', render: r => r.permissoesAdmin ? <Badge variant="destructive" className="text-[10px]">Sim</Badge> : 'Não' },
              { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
              { key: 'tipoLiberacao', header: 'Liberação', render: r => <LiberacaoBadge acesso={r} /> },
              { key: 'revisaoTI', header: 'Revisão TI', render: r => <RevisaoTIBadge acesso={r} /> },
              // Marcado como revisado sem data: a evidência de auditoria está incompleta.
              { key: 'ultimaRevisao', header: 'Última revisão', render: r => r.revisadoSemData ? <span className="font-medium text-red-500">sem data</span> : fmtDate(r.ultimaRevisao) },
              // As colunas de senha saíram do espelho — o detalhe fica no próprio item.
              { key: 'link', header: 'SharePoint', render: r => <LinkSharePoint href={r.link} texto="Abrir" /> },
            ]}
          />
        </TabsContent>
      </Tabs>
      )}

      <RecordSheet detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
