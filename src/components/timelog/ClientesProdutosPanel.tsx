import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Building2, Package, Users, FileSpreadsheet, FileText, Download,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useHorasNegocio, agregarPorDimensao, resumirCobertura,
  type Dimensao,
} from '@/hooks/useHorasNegocio';
import { exportarCsv, exportarExcel, exportarPdf } from '@/lib/exportHorasNegocio';

/**
 * Esforço por cliente, produto e colaborador — a base da visão financeira.
 *
 * A coluna de ORIGEM (campo do DevOps ou tag) fica visível na tela, não só na
 * exportação: a cobertura muda por período, e um total sem procedência não é
 * auditável. Hora sem classificação aparece como "Sem cliente" somando junto,
 * porque esconder o não classificado é o jeito mais fácil de o relatório
 * mentir para baixo.
 */

const DIMENSOES: { valor: Dimensao; rotulo: string; icone: React.ElementType }[] = [
  { valor: 'cliente',     rotulo: 'Cliente',     icone: Building2 },
  { valor: 'produto',     rotulo: 'Produto',     icone: Package },
  { valor: 'colaborador', rotulo: 'Colaborador', icone: Users },
];

function fmtHoras(h: number): string {
  return h.toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function BarraOrigem({ campo, tag, total }: { campo: number; tag: number; total: number }) {
  if (total <= 0) return null;
  const pctCampo = (campo / total) * 100;
  const pctTag = (tag / total) * 100;
  const pctSem = Math.max(0, 100 - pctCampo - pctTag);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/*
          Justificativa escrita para o `style` inline, exigida pela regra 1 do
          DESIGN-SYSTEM.md: a largura é o DADO, não decisão de layout. Classe
          Tailwind não expressa proporção contínua, e montar classe em runtime é
          proibido pela mesma regra (o purge a poda em silêncio). Cor, altura e
          raio continuam vindo de token.
        */}
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500/70" style={{ width: `${pctCampo}%` }} />
          <div className="bg-amber-500/70" style={{ width: `${pctTag}%` }} />
          <div className="bg-muted-foreground/20" style={{ width: `${pctSem}%` }} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>Campo DevOps: {fmtHoras(campo)}h</p>
        <p>Tag: {fmtHoras(tag)}h</p>
        <p>Não classificado: {fmtHoras(Math.max(0, total - campo - tag))}h</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function ClientesProdutosPanel({
  dateFrom, dateTo, onPeriodChange,
}: {
  dateFrom: string;
  dateTo: string;
  onPeriodChange: (campo: 'dateFrom' | 'dateTo', valor: string) => void;
}) {
  const [dim, setDim] = useState<Dimensao>('cliente');

  const { data: rows = [], isLoading, isError, error, refetch, isFetching } =
    useHorasNegocio({ dateFrom, dateTo });

  const linhas = useMemo(() => agregarPorDimensao(rows, dim), [rows, dim]);
  const resumo = useMemo(() => resumirCobertura(rows), [rows]);

  const ctx = { dim, linhas, detalhe: rows, periodo: { de: dateFrom, ate: dateTo } };

  const exportar = (formato: 'csv' | 'excel' | 'pdf') => {
    if (linhas.length === 0) {
      toast.error('Nada para exportar no período seleccionado');
      return;
    }
    try {
      if (formato === 'csv') exportarCsv(ctx);
      else if (formato === 'excel') exportarExcel(ctx);
      else exportarPdf(ctx);
      toast.success(`Exportação ${formato.toUpperCase()} gerada`);
    } catch (e) {
      toast.error(`Falha ao gerar ${formato.toUpperCase()}: ${(e as Error).message}`);
    }
  };

  const totalHoras = linhas.reduce((s, l) => s + l.horas, 0);
  const rotuloDim = DIMENSOES.find(d => d.valor === dim)!.rotulo;

  return (
    <div className="space-y-4">
      {/* ── Filtro de período + dimensão + exportação ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">De</label>
                <Input
                  type="date" value={dateFrom}
                  onChange={e => onPeriodChange('dateFrom', e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Até</label>
                <Input
                  type="date" value={dateTo}
                  onChange={e => onPeriodChange('dateTo', e.target.value)}
                  className="w-40"
                />
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {DIMENSOES.map(d => {
                const Icone = d.icone;
                return (
                  <Button
                    key={d.valor}
                    variant={dim === d.valor ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDim(d.valor)}
                    className="gap-1.5"
                  >
                    <Icone className="h-3.5 w-3.5" />
                    {d.rotulo}
                  </Button>
                );
              })}
            </div>

            <div className="flex gap-2 flex-wrap lg:ml-auto">
              <Button variant="outline" size="sm" onClick={() => exportar('csv')} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportar('excel')} className="gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" />Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportar('pdf')} className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Cobertura ── */}
      {!isLoading && !isError && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Horas no período</span>
              <div className="text-2xl font-bold tabular-nums">{fmtHoras(resumo.horasTotal)}h</div>
              <div className="text-xs text-muted-foreground mt-0.5">{resumo.colaboradores} colaboradores</div>
            </CardContent>
          </Card>
          <Card className={resumo.pctCliente >= 80 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
            <CardContent className="p-4">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Com cliente</span>
              <div className="text-2xl font-bold tabular-nums">{resumo.pctCliente}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">{resumo.clientes} clientes distintos</div>
            </CardContent>
          </Card>
          <Card className={resumo.pctProduto >= 80 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}>
            <CardContent className="p-4">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Com produto</span>
              <div className="text-2xl font-bold tabular-nums">{resumo.pctProduto}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">{resumo.produtos} produtos distintos</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Sem cliente</span>
              <div className="text-2xl font-bold tabular-nums">
                {fmtHoras(resumo.horasTotal - resumo.horasComCliente)}h
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">horas não atribuíveis</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tabela ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Horas por {rotuloDim.toLowerCase()}</CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500/70" />campo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500/70" />tag
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/20" />sem
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Estado 1: carregando */}
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}

          {/* Estado 2: erro, com ação */}
          {isError && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Não foi possível carregar as horas</p>
                <p className="text-xs text-muted-foreground mt-1">{(error as Error)?.message}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Tentar de novo
              </Button>
            </div>
          )}

          {/* Estado 3: vazio, com instrução */}
          {!isLoading && !isError && linhas.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Building2 className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">Nenhuma hora lançada no período</p>
              <p className="text-xs text-muted-foreground">
                Alargue o intervalo de datas acima. A colecta dos campos de cliente e produto
                cobre de forma fiável a partir de abril de 2026.
              </p>
            </div>
          )}

          {!isLoading && !isError && linhas.length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs uppercase tracking-wide">{rotuloDim}</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide w-40">Origem</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">Horas</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">% do total</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-right">Registos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(l => (
                    <TableRow key={l.chave} className={l.semClassificacao ? 'bg-muted/40' : undefined}>
                      <TableCell className="font-medium">
                        {l.semClassificacao ? (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            {l.chave}
                            <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-700 bg-amber-500/5">
                              não atribuível
                            </Badge>
                          </span>
                        ) : l.chave}
                      </TableCell>
                      <TableCell>
                        <BarraOrigem campo={l.horasPorCampo} tag={l.horasPorTag} total={l.horas} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtHoras(l.horas)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {totalHoras > 0 ? ((l.horas / totalHoras) * 100).toFixed(1) : '0,0'}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{l.registos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!isLoading && !isError && linhas.length > 0 && (
            <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
              <span>
                {linhas.length} {rotuloDim.toLowerCase()}
                {linhas.length === 1 ? '' : 's'} · {rows.length} registos
                {resumo.horasAmbiguas > 0 && (
                  <> · {fmtHoras(resumo.horasAmbiguas)}h com classificação ambígua por tag</>
                )}
              </span>
              <span className="tabular-nums font-medium text-foreground">
                Total {fmtHoras(totalHoras)}h
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
