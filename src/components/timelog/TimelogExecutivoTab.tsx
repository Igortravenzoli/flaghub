import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Download, FileSpreadsheet, FileText, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useHorasNegocio, calcularKpis, serieDiaria, montarArvore, ordenarArvore,
  ranking, mesFechadoAnterior,
  SEM_CLIENTE, SEM_PRODUTO, SEM_COLABORADOR, SEM_TASK,
  type Dimensao, type Conciliacao, type HoraNegocioRow,
} from '@/hooks/useHorasNegocio';
import { exportarCsv, exportarExcel, exportarPdf } from '@/lib/exportHorasNegocio';
import { GraficoDiario } from './executivo/GraficoDiario';
import { RankCard } from './executivo/RankCard';
import { AlertasSino, type AcaoAlerta } from './executivo/AlertasSino';
import { GridAnalitico, type OrdemGrid } from './executivo/GridAnalitico';

/**
 * TimeLog Executivo — horas da operação correlacionadas com cliente e produto.
 *
 * O período corta por DATA DE LANÇAMENTO e nasce no mês fechado anterior. Não
 * corta por sprint de propósito: as sprints atravessam o mês (99% das horas de
 * julho/2026 vieram de sprints com horas noutros meses), então sprint e mês
 * fiscal não são reconciliáveis, e misturar os dois recortes produz número
 * errado nas duas pontas.
 *
 * Um filtro só governa a tela inteira: KPIs, gráficos, grid e exportação. Por
 * isso o estado dele vive aqui e desce por props, e a barra que o mostra fica
 * acima dos KPIs, não dentro do grid.
 */

const DIMENSOES: Array<{ valor: Dimensao; rotulo: string }> = [
  { valor: 'cliente', rotulo: 'Cliente' },
  { valor: 'produto', rotulo: 'Produto' },
  { valor: 'colaborador', rotulo: 'Colaborador' },
  // Task não agrupa, achata: é a lista corrida do período, para procurar item.
  { valor: 'task', rotulo: 'Task' },
];

const ROTULO_CONCILIACAO: Record<Conciliacao, string> = {
  match: 'Sincronizadas', divergent: 'Divergentes',
  only_vdesk: 'Só VDESK', only_devops: 'Só DevOps',
};

const COR_CHIP: Record<Conciliacao, string> = {
  match: 'text-emerald-700', divergent: 'text-amber-700',
  only_vdesk: 'text-teal-700', only_devops: 'text-purple-700',
};

const fmt = (n: number) =>
  n.toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Últimos 6 meses fechados, para o atalho de período. */
function mesesRecentes(hoje = new Date()) {
  const opcoes: Array<{ valor: string; rotulo: string }> = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const nome = d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    opcoes.push({ valor, rotulo: i === 1 ? `${nome} — mês fechado anterior` : nome });
  }
  return opcoes;
}

function ultimoDiaDoMes(ym: string) {
  const [ano, mes] = ym.split('-').map(Number);
  return String(new Date(ano, mes, 0).getDate()).padStart(2, '0');
}

export default function TimelogExecutivoTab() {
  const padrao = useMemo(() => mesFechadoAnterior(), []);
  const opcoesMes = useMemo(() => mesesRecentes(), []);

  const [periodo, setPeriodo] = useState(padrao);
  const [mesAtalho, setMesAtalho] = useState<string>(padrao.dateFrom.slice(0, 7));
  const [dimensao, setDimensao] = useState<Dimensao>('cliente');
  const [conciliacao, setConciliacao] = useState<Conciliacao | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [origemFiltro, setOrigemFiltro] = useState<'tag' | null>(null);
  const [soNaoClassificados, setSoNaoClassificados] = useState(false);
  const [chaveSelecionada, setChaveSelecionada] = useState<string | null>(null);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<OrdemGrid>({ coluna: 3, dir: 'desc' });
  const [colabExpandido, setColabExpandido] = useState(false);

  const { data: rows = [], isLoading, isError, error, refetch, isFetching } =
    useHorasNegocio(periodo);

  // Os KPIs macro descrevem o PERÍODO, não o recorte: o filtro serve para
  // investigar dentro dele, e um KPI que muda a cada clique deixa de ser régua.
  const kpis = useMemo(() => calcularKpis(rows), [rows]);

  const filtradas = useMemo(() => {
    const chaveDe = (r: HoraNegocioRow) =>
      dimensao === 'cliente' ? (r.cliente ?? SEM_CLIENTE)
        : dimensao === 'produto' ? (r.produto ?? SEM_PRODUTO)
          : dimensao === 'task' ? (r.work_item_id ? String(r.work_item_id) : SEM_TASK)
            : (r.colaborador ?? SEM_COLABORADOR);

    return rows.filter((r) => {
      if (conciliacao && r.conciliacao !== conciliacao) return false;
      if (dia && r.log_date !== dia) return false;
      if (origemFiltro) {
        const o = dimensao === 'produto' ? r.produto_origem : r.cliente_origem;
        if (o !== origemFiltro) return false;
      }
      if (soNaoClassificados && r.cliente && r.produto) return false;
      if (chaveSelecionada && chaveDe(r) !== chaveSelecionada) return false;
      if (excluidos.size > 0 && excluidos.has(chaveDe(r))) return false;
      return true;
    });
  }, [rows, dimensao, conciliacao, dia, origemFiltro, soNaoClassificados, chaveSelecionada, excluidos]);

  const serie = useMemo(() => serieDiaria(rows), [rows]);
  const arvore = useMemo(
    () => ordenarArvore(montarArvore(filtradas, dimensao), ordem.coluna, ordem.dir),
    [filtradas, dimensao, ordem]
  );
  const rankCliente = useMemo(() => ranking(filtradas, 'cliente'), [filtradas]);
  const rankProduto = useMemo(() => ranking(filtradas, 'produto'), [filtradas]);
  const rankColaborador = useMemo(() => ranking(filtradas, 'colaborador', 30), [filtradas]);
  const totalFiltrado = useMemo(() => filtradas.reduce((s, r) => s + r.horas, 0), [filtradas]);

  const valoresFunil = useMemo(
    () => [...new Set(arvore.map((n) => n.chave))].sort((a, b) => a.localeCompare(b, 'pt')),
    [arvore]
  );

  const filtrosAtivos = [
    conciliacao && ROTULO_CONCILIACAO[conciliacao],
    dia,
    origemFiltro && `origem ${origemFiltro}`,
    soNaoClassificados && 'não classificados',
    chaveSelecionada,
    excluidos.size > 0 && 'funil',
  ].filter(Boolean) as string[];

  const limpar = () => {
    setConciliacao(null); setDia(null); setOrigemFiltro(null);
    setSoNaoClassificados(false); setChaveSelecionada(null); setExcluidos(new Set());
  };

  const aplicarPeriodo = (ym: string) => {
    setMesAtalho(ym);
    if (ym === 'livre') return;
    setPeriodo({ dateFrom: `${ym}-01`, dateTo: `${ym}-${ultimoDiaDoMes(ym)}` });
    limpar();
  };

  const aplicarAlerta = (tipo: AcaoAlerta) => {
    limpar();
    if (tipo === 'only_vdesk') setConciliacao('only_vdesk');
    if (tipo === 'tag') setOrigemFiltro('tag');
    if (tipo === 'sem_classificacao') setSoNaoClassificados(true);
  };

  const exportar = (formato: 'csv' | 'excel' | 'pdf') => {
    if (arvore.length === 0) {
      toast.error('Nada para exportar com os filtros actuais');
      return;
    }
    // A exportação obedece ao filtro aplicado: leva `filtradas`, não `rows`.
    const ctx = {
      dim: dimensao,
      linhas: arvore.map((n) => ({
        chave: n.chave, horas: n.horas, horasPorCampo: n.horasPorCampo,
        horasPorTag: n.horasPorTag, registos: n.registos,
        semClassificacao: n.semClassificacao,
      })),
      detalhe: filtradas,
      periodo: { de: periodo.dateFrom, ate: periodo.dateTo },
    };
    try {
      if (formato === 'csv') exportarCsv(ctx);
      else if (formato === 'excel') exportarExcel(ctx);
      else exportarPdf(ctx);
      toast.success(`Exportação ${formato.toUpperCase()} gerada`);
    } catch (e) {
      toast.error(`Falha ao gerar ${formato.toUpperCase()}: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho: sino acima, controlos abaixo ── */}
      <div className="flex flex-col items-end gap-2">
        <AlertasSino kpis={kpis} onAplicarFiltro={aplicarAlerta} />

        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <div className="mr-auto flex overflow-hidden rounded-md border">
            {DIMENSOES.map((d) => (
              <button
                key={d.valor}
                type="button"
                aria-pressed={dimensao === d.valor}
                onClick={() => {
                  setDimensao(d.valor);
                  setChaveSelecionada(null);
                  setExcluidos(new Set());
                  setOrdem({ coluna: 3, dir: 'desc' });
                }}
                className={`border-l px-3 py-1.5 text-xs first:border-l-0 ${
                  dimensao === d.valor
                    ? 'bg-flag-gold/10 font-semibold text-flag-gold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {d.rotulo}
              </button>
            ))}
          </div>

          <Select value={mesAtalho} onValueChange={aplicarPeriodo}>
            <SelectTrigger className="w-56 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {opcoesMes.map((o) => (
                <SelectItem key={o.valor} value={o.valor} className="text-xs">{o.rotulo}</SelectItem>
              ))}
              <SelectItem value="livre" className="text-xs">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            De
            <Input
              type="date" value={periodo.dateFrom} className="h-8 w-36"
              onChange={(e) => { setPeriodo((p) => ({ ...p, dateFrom: e.target.value })); setMesAtalho('livre'); }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Até
            <Input
              type="date" value={periodo.dateTo} className="h-8 w-36"
              onChange={(e) => { setPeriodo((p) => ({ ...p, dateTo: e.target.value })); setMesAtalho('livre'); }}
            />
          </label>

          <div className="flex gap-1.5 border-l pl-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportar('csv')}>
              <Download className="h-3.5 w-3.5" />CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportar('excel')}>
              <FileSpreadsheet className="h-3.5 w-3.5" />Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportar('pdf')}>
              <FileText className="h-3.5 w-3.5" />PDF
            </Button>
          </div>
        </div>
      </div>

      {/* ── Estado do filtro: governa KPIs, gráficos, grid e exportação ── */}
      <Card className={filtrosAtivos.length > 0 ? 'border-flag-gold/40 bg-flag-gold/5' : ''}>
        <CardContent className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs text-muted-foreground">
          {filtrosAtivos.length > 0 ? (
            <>
              <span>
                <strong className="text-foreground">Filtrando</strong> — {filtradas.length} de {rows.length} apontamentos,
                em gráficos, grid e exportação:
              </span>
              {filtrosAtivos.map((f) => (
                <Badge key={f} variant="outline" className="border-flag-gold/40 text-flag-gold">{f}</Badge>
              ))}
              <Button variant="outline" size="sm" className="ml-auto h-6 px-2 text-[11px]" onClick={limpar}>
                Limpar tudo
              </Button>
            </>
          ) : (
            <span>
              Sem filtro — <strong className="text-foreground">{rows.length} apontamentos</strong> entre{' '}
              {periodo.dateFrom} e {periodo.dateTo}, agrupados por {dimensao}
            </span>
          )}
        </CardContent>
      </Card>

      {/*
        ── KPIs macro ──
        A grade quebra em `xl`, não em `md`: cada card carrega TRÊS métricas, e a
        partir de 768px elas ficariam com ~90px cada e o rótulo quebraria em três
        linhas. Abaixo disso os cards ocupam a largura toda, que é legível.
      */}
      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Azure DevOps
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Metrica rotulo="Total de horas" valor={fmt(kpis.horasDevops)} pe="no período" />
                <Metrica rotulo="PBIs" valor={String(kpis.pbis)} pe="no período" />
                <Metrica rotulo="Tasks" valor={String(kpis.tasks)} pe="no período" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                VDESK
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Metrica rotulo="Total de horas" valor={fmt(kpis.horasVdesk)} pe="no período" />
                <Metrica rotulo="Registos" valor={String(kpis.registosVdesk)} pe="lançamentos" />
                <div>
                  <span className="mb-0.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Sincronizados
                  </span>
                  <span className="block text-xl font-semibold tabular-nums">
                    {kpis.registosSincronizados} / {kpis.registosVdesk}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {kpis.pctSincronizado}% chegaram ao DevOps
                  </span>
                  {/* Bloco, e não span inline: como inline a altura não aplica
                      e o preenchimento escapa do card. */}
                  <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full bg-teal-600"
                      style={{ width: `${kpis.pctSincronizado}%` }}
                    />
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Classificação · atenção
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Metrica rotulo="PBIs sem cliente" valor={String(kpis.pbisSemCliente)}
                  pe={`de ${kpis.pbis} no período`} alerta />
                <Metrica rotulo="PBIs sem produto" valor={String(kpis.pbisSemProduto)}
                  pe={`${kpis.pbisSemAmbos} sem nenhum dos dois`} alerta />
                <Metrica rotulo="PBIs só por tag" valor={String(kpis.pbisSoPorTag)}
                  pe={kpis.pbis > 0 ? `${Math.round((kpis.pbisSoPorTag / kpis.pbis) * 100)}% sem campo no Azure` : '—'}
                  alerta />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Conciliação + série diária ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="grid gap-2">
          {(Object.keys(ROTULO_CONCILIACAO) as Conciliacao[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={conciliacao === s}
              onClick={() => { setConciliacao(conciliacao === s ? null : s); }}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                conciliacao === s ? 'border-current shadow-[inset_3px_0_0_currentColor]' : 'hover:border-muted-foreground/30'
              } ${COR_CHIP[s]}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
              <span className="flex-1 text-xs text-foreground">{ROTULO_CONCILIACAO[s]}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {kpis.conciliacao[s]}
              </span>
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold">Horas lançadas por dia</h3>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                clique numa barra para filtrar o dia
              </span>
            </div>
            {isLoading
              ? <Skeleton className="h-40 w-full" />
              : <GraficoDiario serie={serie} diaSelecionado={dia} onSelecionarDia={setDia} />}
          </CardContent>
        </Card>
      </div>

      {/* ── Rankings ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard
          titulo="Cliente × horas" dimensao="cliente" itens={rankCliente} total={totalFiltrado}
          selecionado={dimensao === 'cliente' ? chaveSelecionada : null}
          onSelecionar={(c) => { setDimensao('cliente'); setChaveSelecionada(c); }}
        />
        <RankCard
          titulo="Produto × horas" dimensao="produto" itens={rankProduto} total={totalFiltrado}
          selecionado={dimensao === 'produto' ? chaveSelecionada : null}
          onSelecionar={(c) => { setDimensao('produto'); setChaveSelecionada(c); }}
        />
        <RankCard
          titulo="Colaborador × horas" dimensao="colaborador" itens={rankColaborador} total={totalFiltrado}
          selecionado={dimensao === 'colaborador' ? chaveSelecionada : null}
          onSelecionar={(c) => { setDimensao('colaborador'); setChaveSelecionada(c); }}
          expandido={colabExpandido}
          onAlternarExpansao={() => setColabExpandido((v) => !v)}
        />
      </div>

      {/* ── Analítico ── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Analítico</h3>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {arvore.length} {dimensao}{arvore.length === 1 ? '' : 's'}
              {dimensao !== 'task' && ` · ${arvore.reduce((s, n) => s + n.pbis.length, 0)} PBIs`}
              {' '}· {fmt(totalFiltrado)} h
            </span>
          </div>

          {isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Não foi possível carregar as horas</p>
                <p className="mt-1 text-xs text-muted-foreground">{(error as Error)?.message}</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Tentar de novo
              </Button>
            </div>
          )}

          {!isLoading && !isError && (
            <GridAnalitico
              dimensao={dimensao}
              nos={arvore}
              ordem={ordem}
              onOrdenar={(coluna) =>
                setOrdem((o) => (o.coluna === coluna
                  ? { coluna, dir: o.dir === 'asc' ? 'desc' : 'asc' }
                  : { coluna, dir: 'asc' }))}
              valoresFunil={valoresFunil}
              excluidos={excluidos}
              onAlternarExcluido={(v) => setExcluidos((prev) => {
                const proximo = new Set(prev);
                if (proximo.has(v)) proximo.delete(v);
                else proximo.add(v);
                return proximo;
              })}
              onLimparFunil={(marcarTodos) =>
                setExcluidos(marcarTodos ? new Set() : new Set(valoresFunil))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metrica({
  rotulo, valor, pe, alerta,
}: { rotulo: string; valor: string; pe: string; alerta?: boolean }) {
  return (
    <div>
      <span className="mb-0.5 block text-xs uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <span className={`block text-xl font-semibold tabular-nums ${alerta ? 'text-amber-700' : ''}`}>
        {valor}
      </span>
      <span className="block text-xs text-muted-foreground">{pe}</span>
    </div>
  );
}
