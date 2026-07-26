/**
 * Aba TRANSBORDO — mover PBI/Bugs não concluídos para a próxima sprint.
 *
 * Dois passos, nesta ordem:
 *   1. CLASSIFICAR — marca com a tag TRANSBORDO o que vai transbordar. É a
 *      autorização humana, dada ANTES de qualquer movimentação.
 *   2. APLICAR TRANSBORDO — move só o que está classificado, levando as tasks
 *      filhas junto.
 *
 * A trava vem do banco (rpc_transbordo_contexto): exige foto selada da sprint
 * que fechou E data posterior ao fim dela. O gate daqui é UX — a edge revalida
 * antes de escrever no DevOps.
 *
 * Nome distinto de TransbordoTab.tsx, que é um componente órfão (nunca
 * importado) e analisa transbordo pelo histórico de iterações, não pela tag.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowRightLeft, Lock, Unlock, Camera, ExternalLink, Tag, Loader2,
  AlertTriangle, CheckCircle2, History, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useTransbordoContexto, useTransbordoElegiveis, useTransbordoHistorico, useTransbordoAcao,
  type TransbordoElegivel,
} from '@/hooks/useTransbordo';

function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** DATE puro: split de string, nunca new Date (evita o -1 dia em BRT). */
function fmtData(d: string | null): string {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function LinhaItem({
  item, selecionavel, marcado, onToggle,
}: {
  item: TransbordoElegivel;
  selecionavel?: boolean;
  marcado?: boolean;
  onToggle?: (id: number) => void;
}) {
  return (
    <TableRow className="text-xs">
      {selecionavel && (
        <TableCell className="w-8">
          <Checkbox
            checked={!!marcado}
            onCheckedChange={() => onToggle?.(item.work_item_id)}
            aria-label={`Selecionar item ${item.work_item_id}`}
          />
        </TableCell>
      )}
      <TableCell className="font-mono whitespace-nowrap">
        {item.web_url ? (
          <a href={item.web_url} target="_blank" rel="noreferrer"
             className="text-primary hover:underline inline-flex items-center gap-0.5">
            #{item.work_item_id}<ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : `#${item.work_item_id}`}
      </TableCell>
      <TableCell className="max-w-[420px]">
        <span className="truncate block" title={item.title ?? ''}>{item.title ?? '—'}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap">{item.state}</TableCell>
      <TableCell className="text-right font-mono">
        {item.tasks_filhas === 0 ? (
          <span className="text-amber-700" title="PBI sem tasks filhas — migra sozinho">0</span>
        ) : item.tasks_filhas}
      </TableCell>
      <TableCell className="text-right font-mono" title="Quantas vezes já foi empurrado de sprint">
        {item.migracoes}
      </TableCell>
    </TableRow>
  );
}

export function TransbordoAcoesTab() {
  const ctxQ = useTransbordoContexto();
  const ctx = ctxQ.data ?? null;
  const elegiveisQ = useTransbordoElegiveis(ctx?.sprint_origem);
  const historicoQ = useTransbordoHistorico(90);
  const acao = useTransbordoAcao();

  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [dialogAberto, setDialogAberto] = useState(false);
  const [modoSelecao, setModoSelecao] = useState(false);

  const todos = useMemo(() => elegiveisQ.data ?? [], [elegiveisQ.data]);
  const classificados = useMemo(() => todos.filter(i => i.tem_tag), [todos]);
  const pendentes = useMemo(() => todos.filter(i => !i.tem_tag), [todos]);

  const alternar = (id: number) => setSelecionados(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const marcarTodos = () => setSelecionados(
    selecionados.size === pendentes.length ? new Set() : new Set(pendentes.map(i => i.work_item_id)),
  );

  const classificar = () => {
    if (selecionados.size === 0) return;
    acao.mutate(
      { mode: 'classify', workItemIds: [...selecionados] },
      {
        onSuccess: (r) => {
          toast.success(`${r.sucesso} item(ns) classificados como transbordo`, {
            description: r.falha > 0 ? `${r.falha} falharam — ver histórico` : 'Tag TRANSBORDO aplicada no DevOps.',
          });
          setSelecionados(new Set());
          setModoSelecao(false);
        },
        onError: (e: Error) => toast.error('Falha ao classificar', { description: e.message }),
      },
    );
  };

  const aplicarTransbordo = () => {
    acao.mutate(
      { mode: 'migrate' },
      {
        onSuccess: (r) => {
          toast.success(`${r.sucesso} item(ns) movidos para ${r.sprintDestino}`, {
            description: r.falha > 0 ? `${r.falha} falharam — ver histórico` : 'Tasks filhas acompanharam o pai.',
          });
          setDialogAberto(false);
        },
        onError: (e: Error) => toast.error('Transbordo bloqueado', { description: e.message }),
      },
    );
  };

  if (ctxQ.isLoading) return <Skeleton className="h-64 w-full" />;

  if (ctxQ.isError || !ctx) {
    return (
      <div className="flex items-start gap-2 rounded border border-red-300 bg-red-500/10 p-3 text-xs text-red-700">
        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Não foi possível carregar o contexto do transbordo. {(ctxQ.error as Error)?.message}</span>
      </div>
    );
  }

  const liberado = ctx.pode_migrar;

  return (
    <div className="space-y-4">
      {/* ── Trava ─────────────────────────────────────────────────────────── */}
      <Card className={liberado ? 'border-emerald-400/30 bg-emerald-500/5' : 'border-amber-400/30 bg-amber-500/5'}>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            {liberado ? <Unlock className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-amber-600" />}
            {liberado ? 'Transbordo liberado' : 'Transbordo bloqueado'}
            <Badge variant="outline" className="text-[10px]">
              {ctx.sprint_origem} → {ctx.sprint_destino ?? '—'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <p className="text-xs text-muted-foreground">{ctx.motivo}</p>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>Fim da sprint: <strong>{fmtData(ctx.sprint_fim)}</strong></span>
            <span className="inline-flex items-center gap-1">
              <Camera className="h-3 w-3" />
              {ctx.foto_selada
                ? <>Foto selada — corte {fmtDataHora(ctx.foto_as_of)}</>
                : <>Foto ainda não selada</>}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            A movimentação escreve no Azure DevOps e aparece no histórico do item. Reverter
            restaura a sprint de origem, mas <strong>não</strong> desfaz a contagem de
            movimentações — as revisões do DevOps são somente-acréscimo.
          </p>
        </CardContent>
      </Card>

      {/* ── 1. Classificar ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            <Tag className="h-4 w-4 text-sky-500" />
            1. Classificar
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
              {pendentes.length} pendentes
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
              {classificados.length} classificados
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Itens em <strong>New</strong> ou <strong>Em desenvolvimento</strong> que não terminaram
            na sprint. Marcar aplica a tag <strong>TRANSBORDO</strong> no DevOps — é o que autoriza
            o item a ser movido no passo 2.
          </p>

          {elegiveisQ.isError ? (
            <div className="flex items-start gap-2 rounded border border-red-300 bg-red-500/10 p-3 text-xs text-red-700">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Falha ao carregar os itens: {(elegiveisQ.error as Error)?.message}</span>
            </div>
          ) : elegiveisQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : pendentes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum item pendente de classificação.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {!modoSelecao ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                          onClick={() => setModoSelecao(true)}>
                    <Tag className="h-3.5 w-3.5" />Classificar itens
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={marcarTodos}>
                      {selecionados.size === pendentes.length ? 'Limpar seleção' : 'Selecionar todos'}
                    </Button>
                    <Button size="sm" className="h-7 text-xs gap-1.5 bg-sky-600 hover:bg-sky-700"
                            disabled={selecionados.size === 0 || acao.isPending}
                            onClick={classificar}>
                      {acao.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Tag className="h-3.5 w-3.5" />}
                      Aplicar tag em {selecionados.size}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => { setModoSelecao(false); setSelecionados(new Set()); }}>
                      Cancelar
                    </Button>
                  </>
                )}
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      {modoSelecao && <TableHead className="w-8" />}
                      <TableHead>Item</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Tasks</TableHead>
                      <TableHead className="text-right">Migrações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendentes.map(i => (
                      <LinhaItem key={i.work_item_id} item={i}
                                 selecionavel={modoSelecao}
                                 marcado={selecionados.has(i.work_item_id)}
                                 onToggle={alternar} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Aplicar transbordo ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            2. Aplicar transbordo
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
              {classificados.length} serão movidos
            </Badge>
            {classificados.some(i => i.tasks_filhas === 0) && (
              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                {classificados.filter(i => i.tasks_filhas === 0).length} sem tasks filhas
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Itens já classificados (com a tag <strong>TRANSBORDO</strong>) que serão movidos para{' '}
            <strong>{ctx.sprint_destino ?? 'a próxima sprint'}</strong>. As tasks filhas acompanham
            o item pai.
          </p>

          {elegiveisQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : classificados.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum item classificado. Use o passo 1 para marcar o que deve transbordar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Item</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tasks</TableHead>
                    <TableHead className="text-right">Migrações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classificados.map(i => (
                    <LinhaItem key={i.work_item_id} item={i} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={!liberado || acao.isPending || classificados.length === 0}
            onClick={() => setDialogAberto(true)}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Aplicar transbordo ({classificados.length})
          </Button>
          {!liberado && <p className="text-[11px] text-amber-700">{ctx.motivo}</p>}
        </CardContent>
      </Card>

      {/* ── Pop-up de confirmação ─────────────────────────────────────────── */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Você está movimentando atividades para a próxima sprint</DialogTitle>
            <DialogDescription>
              {ctx.sprint_origem} → {ctx.sprint_destino}. A mudança é escrita no Azure DevOps.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {classificados.length} item(ns) serão movidos
              </p>
              {classificados.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum item classificado — não há o que mover.
                </p>
              ) : (
                <ul className="text-xs space-y-0.5 pl-5 list-disc text-muted-foreground">
                  {classificados.map(i => (
                    <li key={i.work_item_id}>
                      <span className="font-mono">#{i.work_item_id}</span> {i.title}
                      {i.tasks_filhas === 0 && (
                        <Badge variant="outline" className="ml-1.5 text-[9px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                          sem tasks filhas
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {pendentes.length > 0 && (
              <div className="space-y-2 rounded border border-amber-300 bg-amber-500/10 p-3">
                <p className="text-xs font-semibold flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {pendentes.length} item(ns) pendentes de classificação
                </p>
                <p className="text-xs text-amber-800/90">
                  Estão em New ou Em desenvolvimento, mas não têm a tag TRANSBORDO — então
                  ficariam para trás. Deseja classificar antes?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                          onClick={() => {
                            setDialogAberto(false);
                            setModoSelecao(true);
                            setSelecionados(new Set(pendentes.map(i => i.work_item_id)));
                          }}>
                    <Tag className="h-3.5 w-3.5" />Sim, classificar
                  </Button>
                  <span className="text-[11px] text-amber-800/80 self-center">
                    Não → envia só os {classificados.length} já classificados.
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDialogAberto(false)}>Cancelar</Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={classificados.length === 0 || acao.isPending}
              onClick={aplicarTransbordo}
            >
              {acao.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Movendo…</>
                : <><ArrowRightLeft className="h-3.5 w-3.5" />Confirmar ({classificados.length})</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Histórico ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            Histórico (90 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historicoQ.isError ? (
            <div className="flex items-start gap-2 rounded border border-red-300 bg-red-500/10 p-3 text-xs text-red-700">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Falha ao carregar o histórico: {(historicoQ.error as Error)?.message}</span>
            </div>
          ) : historicoQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (historicoQ.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhuma classificação ou transbordo registrado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Quando</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Sprint</TableHead>
                    <TableHead>Executado por</TableHead>
                    <TableHead className="text-right">Itens</TableHead>
                    <TableHead className="text-right">Sucesso</TableHead>
                    <TableHead className="text-right">Falha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(historicoQ.data ?? []).map(l => (
                    <TableRow key={l.batch_id} className="text-xs">
                      <TableCell className="whitespace-nowrap">{fmtDataHora(l.executed_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {l.tipo === 'classificacao' ? 'Classificação' : 'Transbordo'}
                        </Badge>
                        {l.dry_run && (
                          <Badge variant="outline" className="text-[10px] ml-1 bg-muted text-muted-foreground">
                            simulação
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {l.sprint_origem}{l.sprint_destino ? ` → ${l.sprint_destino}` : ''}
                      </TableCell>
                      <TableCell>{l.executor ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono">{l.total_itens}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-700">{l.total_sucesso}</TableCell>
                      <TableCell className={`text-right font-mono ${l.total_falha > 0 ? 'text-red-700' : ''}`}>
                        {l.total_falha}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
