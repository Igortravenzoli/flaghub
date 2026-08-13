import { Fragment, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronRight, Filter, ArrowUp } from 'lucide-react';
import type { Conciliacao, Dimensao, NoDimensao } from '@/hooks/useHorasNegocio';

/**
 * Analítico do TimeLog Executivo.
 *
 * Drill de quatro níveis — dimensão → PBI → task → lançamento —, ordenação por
 * qualquer coluna, funil por valor e largura arrastável. Escrito à mão em vez
 * de trazer uma biblioteca de grid: são ~200 linhas, o comportamento já está
 * fechado, e uma dependência nova precisaria de decisão de arquitetura que
 * ninguém tomou. Se a tela ganhar paginação ou coluna dinâmica, o caminho é
 * `@tanstack/react-table`, previsto no DataTable do design system.
 */

const DEVOPS_ORG_URL = 'https://dev.azure.com/FlagIW/Flag.Planejamento/_workitems/edit';

const ROTULO_CONCILIACAO: Record<Conciliacao, string> = {
  match: 'Sincronizada',
  divergent: 'Divergente',
  only_vdesk: 'Só VDESK',
  only_devops: 'Só DevOps',
};

const COR_CONCILIACAO: Record<Conciliacao, string> = {
  match: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
  divergent: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  only_vdesk: 'border-teal-500/30 bg-teal-500/10 text-teal-700',
  only_devops: 'border-purple-500/30 bg-purple-500/10 text-purple-700',
};

const NOME_DIMENSAO: Record<Dimensao, string> = {
  cliente: 'Cliente', produto: 'Produto', colaborador: 'Colaborador', task: 'Task',
};

/**
 * A lista de tasks é plana e responde outra pergunta — "onde está este item" —,
 * então troca as colunas do meio: em vez de contar PBIs e mostrar a origem da
 * classificação, mostra a que cliente e produto a task pertence.
 */
const COLUNAS_TASK = ['Task', 'Cliente', 'Produto', 'Horas', '% do total', 'Registos'];

const LARGURAS_INICIAIS = ['38%', '16%', '14%', '12%', '10%', '10%'];

function fmt(n: number) {
  return n.toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function PillOrigem({ campo, tag }: { campo: number; tag: number }) {
  const origem = campo >= tag ? (campo > 0 ? 'campo' : 'sem') : 'tag';
  const estilo = {
    campo: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
    tag: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
    sem: 'border-border bg-muted text-muted-foreground',
  }[origem];
  const rotulo = { campo: 'Campo DevOps', tag: 'Tag', sem: 'Não classificado' }[origem];
  return <Badge variant="outline" className={`${estilo} text-xs font-normal`}>{rotulo}</Badge>;
}

export interface OrdemGrid {
  coluna: number;
  dir: 'asc' | 'desc';
}

export function GridAnalitico({
  dimensao, nos, ordem, onOrdenar, valoresFunil, excluidos, onAlternarExcluido, onLimparFunil,
}: {
  dimensao: Dimensao;
  nos: NoDimensao[];
  ordem: OrdemGrid;
  onOrdenar: (coluna: number) => void;
  valoresFunil: string[];
  excluidos: Set<string>;
  onAlternarExcluido: (valor: string) => void;
  onLimparFunil: (marcarTodos: boolean) => void;
}) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [larguras, setLarguras] = useState<string[]>(LARGURAS_INICIAIS);
  const tabelaRef = useRef<HTMLTableElement>(null);

  const alternar = (chave: string) =>
    setAbertos((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });

  const iniciarResize = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const cabecalhos = tabelaRef.current?.querySelectorAll('th');
    const larguraInicial = cabecalhos?.[i]?.offsetWidth ?? 120;
    const xInicial = e.clientX;

    const mover = (ev: MouseEvent) => {
      const nova = Math.max(80, larguraInicial + (ev.clientX - xInicial));
      setLarguras((prev) => prev.map((l, idx) => (idx === i ? `${nova}px` : l)));
    };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };

  const total = nos.reduce((s, n) => s + n.horas, 0);
  const ehTask = dimensao === 'task';
  const colunas = ehTask
    ? COLUNAS_TASK
    : [NOME_DIMENSAO[dimensao], 'PBIs', 'Origem', 'Horas', '% do total', 'Registos'];

  const pct = (h: number) => (total > 0 ? ((h / total) * 100).toFixed(1) : '0,0');

  if (nos.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium">Nenhum apontamento com os filtros actuais</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Limpe o filtro acima, ou escolha outro dia no gráfico.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table ref={tabelaRef} className="min-w-[880px] table-fixed">
        <colgroup>
          {larguras.map((l, i) => <col key={i} style={{ width: l }} />)}
        </colgroup>
        <TableHeader>
          <TableRow>
            {colunas.map((rotulo, i) => (
              <TableHead
                key={rotulo}
                className={`relative select-none text-xs uppercase tracking-wide ${i >= 3 ? 'text-right' : ''}`}
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => onOrdenar(i)}
                >
                  {rotulo}
                  {ordem.coluna === i && (
                    <ArrowUp
                      className={`h-3 w-3 text-flag-gold transition-transform ${
                        ordem.dir === 'desc' ? 'rotate-180' : ''
                      }`}
                    />
                  )}
                </button>

                {/* Sem funil na lista de tasks: os valores da coluna seriam
                    centenas de ids de work item, que ninguém filtra por
                    checkbox. Para estreitar ali, usa-se a chave Cliente ou o
                    clique no ranking. */}
                {i === 0 && !ehTask && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Filtrar ${rotulo}`}
                        className={`ml-1.5 rounded p-0.5 align-middle hover:bg-muted ${
                          excluidos.size > 0 ? 'text-flag-gold' : 'text-muted-foreground'
                        }`}
                      >
                        <Filter className="h-3 w-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 p-2">
                      <div className="max-h-56 overflow-auto">
                        {valoresFunil.map((v) => (
                          <label
                            key={v}
                            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs font-normal normal-case tracking-normal hover:bg-muted"
                          >
                            <Checkbox
                              checked={!excluidos.has(v)}
                              onCheckedChange={() => onAlternarExcluido(v)}
                            />
                            <span className="truncate" title={v}>{v}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-1.5 border-t pt-2">
                        <Button variant="outline" size="sm" className="h-6 flex-1 text-[11px]"
                          onClick={() => onLimparFunil(true)}>Marcar todos</Button>
                        <Button variant="outline" size="sm" className="h-6 flex-1 text-[11px]"
                          onClick={() => onLimparFunil(false)}>Limpar</Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Puxador de largura. `-right-1` para a área de arraste cobrir
                    a borda entre as duas colunas, que é onde a mão vai. */}
                <span
                  role="presentation"
                  onMouseDown={(e) => iniciarResize(e, i)}
                  className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-flag-gold/40"
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {/* ── Lista plana de tasks: um nível, abrindo direto nos lançamentos ── */}
          {ehTask && nos.map((n1) => {
            const k1 = `t:${n1.chave}`;
            const aberto = abertos.has(k1);
            const info = n1.task;
            return (
              <Fragment key={k1}>
                <TableRow className="cursor-pointer" onClick={() => alternar(k1)}>
                  <TableCell className="truncate" title={info?.titulo ?? ''}>
                    <ChevronRight
                      className={`mr-1 inline h-3 w-3 text-muted-foreground transition-transform ${
                        aberto ? 'rotate-90 text-flag-gold' : ''
                      }`}
                    />
                    {info?.workItemId ? (
                      <a
                        href={`${DEVOPS_ORG_URL}/${info.workItemId}`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >#{info.workItemId}</a>
                    ) : (
                      <Badge variant="outline" className="border-teal-500/30 bg-teal-500/10 text-xs font-normal text-teal-700">
                        VDESK
                      </Badge>
                    )}
                    <span className="ml-2 text-muted-foreground">
                      {info?.titulo ?? 'lançamento sem task no DevOps'}
                    </span>
                  </TableCell>
                  <TableCell className="truncate">
                    {info?.cliente ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="truncate">
                    {info?.produto ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(n1.horas)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{pct(n1.horas)}%</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{n1.registos}</TableCell>
                </TableRow>

                {aberto && info?.lancamentos.map((l, i) => (
                  <TableRow key={`${k1}|l:${i}`} className="bg-muted/40">
                    <TableCell className="pl-10 font-mono text-xs text-muted-foreground">{l.log_date}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.colaborador ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.sprint_code ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmt(l.horas)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {l.minutes_vdesk > 0 && l.minutes_devops > 0
                        ? 'ambos' : l.minutes_vdesk > 0 ? 'VDESK' : 'DevOps'}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">1</TableCell>
                  </TableRow>
                ))}
              </Fragment>
            );
          })}

          {!ehTask && nos.map((n1) => {
            const k1 = `d:${n1.chave}`;
            const aberto1 = abertos.has(k1);
            return (
              <Fragment key={k1}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => alternar(k1)}
                >
                  <TableCell className="truncate font-medium" title={n1.chave}>
                    <ChevronRight
                      className={`mr-1 inline h-3 w-3 text-muted-foreground transition-transform ${
                        aberto1 ? 'rotate-90 text-flag-gold' : ''
                      }`}
                    />
                    <span className={n1.semClassificacao ? 'text-muted-foreground' : ''}>
                      {n1.chave}
                    </span>
                    {n1.semClassificacao && (
                      <Badge variant="outline" className="ml-2 border-amber-500/30 bg-amber-500/5 text-xs font-normal text-amber-700">
                        não atribuível
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{n1.pbis.length}</TableCell>
                  <TableCell><PillOrigem campo={n1.horasPorCampo} tag={n1.horasPorTag} /></TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(n1.horas)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {total > 0 ? ((n1.horas / total) * 100).toFixed(1) : '0,0'}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{n1.registos}</TableCell>
                </TableRow>

                {aberto1 && n1.pbis.map((n2) => {
                  const k2 = `${k1}|p:${n2.pbiId ?? 'sem'}`;
                  const aberto2 = abertos.has(k2);
                  return (
                    <Fragment key={k2}>
                      <TableRow className="cursor-pointer bg-muted/40" onClick={() => alternar(k2)}>
                        <TableCell className="truncate pl-8" title={n2.titulo ?? ''}>
                          <ChevronRight
                            className={`mr-1 inline h-3 w-3 text-muted-foreground transition-transform ${
                              aberto2 ? 'rotate-90 text-flag-gold' : ''
                            }`}
                          />
                          {n2.pbiId ? (
                            <a
                              href={`${DEVOPS_ORG_URL}/${n2.pbiId}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >#{n2.pbiId}</a>
                          ) : <span className="text-muted-foreground">sem PBI</span>}
                          <span className="ml-2 text-muted-foreground">{n2.titulo ?? '—'}</span>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{n2.tasks.length} itens</TableCell>
                        <TableCell />
                        <TableCell className="text-right tabular-nums">{fmt(n2.horas)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {total > 0 ? ((n2.horas / total) * 100).toFixed(1) : '0,0'}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{n2.registos}</TableCell>
                      </TableRow>

                      {aberto2 && n2.tasks.map((n3, i3) => {
                        const k3 = `${k2}|t:${n3.workItemId ?? 'vdesk'}:${i3}`;
                        const aberto3 = abertos.has(k3);
                        return (
                          <Fragment key={k3}>
                            <TableRow className="cursor-pointer bg-muted/40" onClick={() => alternar(k3)}>
                              <TableCell className="truncate pl-14 text-muted-foreground" title={n3.titulo ?? ''}>
                                <ChevronRight
                                  className={`mr-1 inline h-3 w-3 transition-transform ${
                                    aberto3 ? 'rotate-90 text-flag-gold' : ''
                                  }`}
                                />
                                {n3.workItemId ? (
                                  <a
                                    href={`${DEVOPS_ORG_URL}/${n3.workItemId}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >#{n3.workItemId}</a>
                                ) : (
                                  <Badge variant="outline" className="border-teal-500/30 bg-teal-500/10 text-xs font-normal text-teal-700">
                                    VDESK
                                  </Badge>
                                )}
                                <span className="ml-2">{n3.titulo ?? 'lançamento sem task no DevOps'}</span>
                              </TableCell>
                              <TableCell className="truncate text-muted-foreground">{n3.colaborador ?? '—'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`${COR_CONCILIACAO[n3.conciliacao]} text-xs font-normal`}>
                                  {ROTULO_CONCILIACAO[n3.conciliacao]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(n3.horas)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {total > 0 ? ((n3.horas / total) * 100).toFixed(1) : '0,0'}%
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {n3.lancamentos.length}
                              </TableCell>
                            </TableRow>

                            {/* Quarto e último nível: o lançamento em si. É onde
                                o financeiro confere quando desconfia do total. */}
                            {aberto3 && n3.lancamentos.map((l, i4) => (
                              <TableRow key={`${k3}|l:${i4}`} className="bg-background hover:bg-background">
                                <TableCell className="pl-20 font-mono text-xs text-muted-foreground">
                                  {l.log_date}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{l.colaborador ?? '—'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {l.sprint_code ?? '—'}
                                </TableCell>
                                <TableCell className="text-right text-xs tabular-nums">{fmt(l.horas)}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                                  {l.minutes_vdesk > 0 && l.minutes_devops > 0
                                    ? 'ambos'
                                    : l.minutes_vdesk > 0 ? 'VDESK' : 'DevOps'}
                                </TableCell>
                                <TableCell className="text-right text-xs tabular-nums text-muted-foreground">1</TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
