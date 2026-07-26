/**
 * Aba de Logs da Fábrica — rastreabilidade das rotinas automáticas.
 *
 * Três blocos, todos somente leitura:
 *   1. Alertas de Retorno QA  — o que a edge devops-qa-alert disparou (ou não)
 *   2. Sincronização VDESK → DevOps — execuções + rastro de cada lançamento +
 *      apontamentos sem destinatário resolvível
 *   3. Transbordo — reservado: só passa a ter conteúdo quando o botão
 *      "Migrar PBI/Bugs" existir (hoje a movimentação é feita direto no DevOps
 *      e não deixa rastro em lugar nenhum).
 *
 * Regra desta aba: falha NUNCA vira lista vazia. Uma aba de auditoria que
 * mostra "nenhum registro" quando na verdade a consulta falhou faz o leitor
 * concluir que a automação não rodou — o pior erro possível aqui. Por isso
 * cada bloco distingue erro, vazio e lista truncada.
 */
import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertTriangle, ExternalLink, RefreshCw, SendHorizonal,
  ShieldAlert, Timer, ArrowRightLeft, XCircle,
} from 'lucide-react';
import {
  useQaAlertLog, useVdeskSyncRunLog, useTimelogPostLog, useApontamentosSemEmail,
  filtrarLancamentos, alertaSemAviso,
  LOG_PERIOD_OPTIONS, type LogPeriodDays, type QaAlertStatus,
} from '@/hooks/useFabricaLogs';
import { TransbordoAcoesTab } from '@/components/fabrica/TransbordoAcoesTab';

// ─── Formatação ──────────────────────────────────────────────────────────────

/** timestamptz → "17/07/2026 14:32" */
function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Coluna DATE ("2026-07-17") → "17/07/2026" por split de string.
 * NUNCA usar new Date aqui: em BRT o parse UTC volta um dia (bug conhecido).
 */
function fmtData(logDate: string | null): string {
  if (!logDate) return '—';
  const [y, m, d] = logDate.split('-');
  return `${d}/${m}/${y}`;
}

/** Minutos → "84:22" (formato da planilha do gestor). */
function fmtHM(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function fmtDuracao(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Vocabulário de status ───────────────────────────────────────────────────

const NEUTRO = 'bg-muted text-muted-foreground border-border';

const QA_ALERT_STATUS: Record<QaAlertStatus, { label: string; className: string }> = {
  sent:          { label: 'Enviado',            className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  fallback_sent: { label: 'Canal (falha 1:1)',  className: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
  failed:        { label: 'Falhou',             className: 'bg-red-500/10 text-red-700 border-red-500/30' },
  skipped:       { label: 'Não enviado',        className: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  pending:       { label: 'Pendente',           className: NEUTRO },
};

const POST_STATUS: Record<string, { label: string; className: string }> = {
  posted:     { label: 'Lançado',   className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  approved:   { label: 'Aprovado',  className: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  pending:    { label: 'Pendente',  className: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  posting:    { label: 'Enviando',  className: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
  error:      { label: 'Erro',      className: 'bg-red-500/10 text-red-700 border-red-500/30' },
  rejected:   { label: 'Rejeitado', className: NEUTRO },
  duplicated: { label: 'Duplicado', className: 'bg-orange-500/10 text-orange-700 border-orange-500/30' },
  skipped:    { label: 'Ignorado',  className: NEUTRO },
};

/** Status desconhecido aparece cru — rotulá-lo como algo benigno esconderia a novidade. */
function rotuloStatus(
  mapa: Record<string, { label: string; className: string }>,
  valor: string,
): { label: string; className: string } {
  return mapa[valor] ?? { label: valor, className: NEUTRO };
}

const CANAL_LABEL: Record<string, string> = {
  teams_1on1: 'Teams 1:1',
  teams_webhook: 'Webhook do canal',
  none: 'Nenhum',
};

// ─── Blocos de estado ────────────────────────────────────────────────────────

function EstadoVazio({ mensagem }: { mensagem: string }) {
  return <p className="text-xs text-muted-foreground text-center py-6">{mensagem}</p>;
}

function EstadoErro({ erro }: { erro: unknown }) {
  const msg = erro instanceof Error ? erro.message : String(erro);
  const semPermissao = /permission denied|42501|row-level security/i.test(msg);
  return (
    <div className="flex items-start gap-2 rounded border border-red-300 bg-red-500/10 p-3 text-xs text-red-700">
      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">
          {semPermissao
            ? 'Sem permissão para ler este log.'
            : 'Não foi possível carregar este log.'}
        </p>
        <p className="text-red-700/80">
          {semPermissao
            ? 'Seu usuário não tem acesso aprovado a esta base. Isto NÃO significa que não há registros.'
            : msg}
        </p>
      </div>
    </div>
  );
}

function AvisoTruncado({ total }: { total: number }) {
  return (
    <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
      Lista truncada nos {total} registros mais recentes — há mais no período. Reduza o período para ver o resto.
    </p>
  );
}

// ─── Abas laterais ───────────────────────────────────────────────────────────

export type LogAba = 'retornos' | 'vdesk' | 'transbordo';

/**
 * Botão de aba lateral. O contador fica no próprio rótulo para o problema
 * aparecer sem precisar entrar na aba — é o que compensa ver um bloco por vez.
 */
function AbaLateral({
  ativa, onClick, icone, rotulo, contador,
}: {
  ativa: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  rotulo: string;
  contador?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativa ? 'page' : undefined}
      className={`w-full text-left flex items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors border ${
        ativa
          ? 'bg-background border-border shadow-sm font-semibold text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-background/60'
      }`}
    >
      {icone}
      <span className="flex-1 truncate">{rotulo}</span>
      {contador}
    </button>
  );
}

function TituloBloco({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
      {children}
    </h3>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function LogsTab({ abaInicial = 'retornos' }: { abaInicial?: LogAba }) {
  const [dias, setDias] = useState<LogPeriodDays>(30);
  const [aba, setAba] = useState<LogAba>(abaInicial);

  const [qaSoProblema, setQaSoProblema] = useState(false);
  const [postStatus, setPostStatus] = useState<string>('');
  const [postBusca, setPostBusca] = useState('');

  const qa = useQaAlertLog(dias);
  const runs = useVdeskSyncRunLog(30);
  const posts = useTimelogPostLog(dias);
  const semEmail = useApontamentosSemEmail(dias);

  // Contadores do cabeçalho sempre sobre o PERÍODO — nunca sobre a visão
  // filtrada, senão o resumo muda de sentido quando o usuário clica num filtro.
  const qaTodos = useMemo(() => qa.data?.rows ?? [], [qa.data]);
  const qaSemAviso = qaTodos.filter(alertaSemAviso).length;
  const qaAvisados = qaTodos.length - qaSemAviso;
  const qaVisiveis = qaSoProblema ? qaTodos.filter(alertaSemAviso) : qaTodos;

  const postTodos = useMemo(() => posts.data?.rows ?? [], [posts.data]);
  const postLancados = postTodos.filter((r) => r.status === 'posted').length;
  const postErros = postTodos.filter((r) => r.status === 'error').length;
  const postVisiveis = useMemo(
    () => filtrarLancamentos(postTodos, postBusca, postStatus),
    [postTodos, postBusca, postStatus],
  );

  const semEmailRows = semEmail.data ?? [];

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho: período ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período:</span>
        {LOG_PERIOD_OPTIONS.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={dias === d ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setDias(d)}
          >
            {d} dias
          </Button>
        ))}
        <span className="text-[11px] text-muted-foreground ml-auto">
          Registro do que as rotinas automáticas fizeram. Somente leitura.
        </span>
      </div>

      {/* ── Abas laterais + conteúdo ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <nav className="w-full sm:w-48 shrink-0 space-y-1 rounded-lg bg-muted/50 p-1.5">
          <AbaLateral
            ativa={aba === 'retornos'}
            onClick={() => setAba('retornos')}
            icone={<AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
            rotulo="Retornos"
            contador={
              qa.isError ? (
                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-700 border-red-500/30">erro</Badge>
              ) : qaSemAviso > 0 ? (
                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-700 border-red-500/30">{qaSemAviso}</Badge>
              ) : (
                <Badge variant="outline" className="text-[9px]">{qaTodos.length}</Badge>
              )
            }
          />
          <AbaLateral
            ativa={aba === 'vdesk'}
            onClick={() => setAba('vdesk')}
            icone={<SendHorizonal className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
            rotulo="Vdesk"
            contador={
              posts.isError ? (
                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-700 border-red-500/30">erro</Badge>
              ) : postErros > 0 ? (
                <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-700 border-red-500/30">{postErros}</Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">{postLancados}</Badge>
              )
            }
          />
          <AbaLateral
            ativa={aba === 'transbordo'}
            onClick={() => setAba('transbordo')}
            icone={<ArrowRightLeft className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
            rotulo="Transbordo"
          />
        </nav>

        <div className="flex-1 min-w-0 w-full">
      {/* ── Retornos ──────────────────────────────────────────────────────── */}
      {aba === 'retornos' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TituloBloco>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />Alertas de Retorno QA
            </TituloBloco>
            {!qa.isError && !qa.isLoading && (
              <>
                <Badge variant="outline" className="text-[10px]">{qaTodos.length} detectados</Badge>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                  {qaAvisados} avisados
                </Badge>
                {qaSemAviso > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-700 border-red-500/30">
                    {qaSemAviso} sem aviso
                  </Badge>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={qaSoProblema ? 'default' : 'outline'}
              className="h-7 text-xs gap-1.5"
              onClick={() => setQaSoProblema((v) => !v)}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Só quem não recebeu aviso
            </Button>
            <p className="text-[11px] text-muted-foreground">
              O alerta vai para o responsável pelo item no DevOps, via Teams 1:1; se o
              destinatário não for resolvido, cai no webhook do canal.
            </p>
          </div>

          {qa.data?.truncated && <AvisoTruncado total={qaTodos.length} />}

          {qa.isError ? (
            <EstadoErro erro={qa.error} />
          ) : qa.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : qaVisiveis.length === 0 ? (
            <EstadoVazio
              mensagem={
                qaSoProblema && qaTodos.length > 0
                  ? 'Todos os alertas do período chegaram ao destinatário.'
                  : 'Nenhum retorno de QA detectado no período.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Detectado em</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Sprint</TableHead>
                    <TableHead>Detecção</TableHead>
                    <TableHead>Aviso</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qaVisiveis.map((r) => {
                    const cfg = rotuloStatus(QA_ALERT_STATUS, r.alert_status);
                    return (
                      <TableRow key={r.id} className="text-xs">
                        <TableCell className="whitespace-nowrap">{fmtDataHora(r.detected_at)}</TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="flex items-center gap-1">
                            {r.web_url ? (
                              <a
                                href={r.web_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono text-primary hover:underline inline-flex items-center gap-0.5"
                              >
                                #{r.work_item_id}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            ) : (
                              <span className="font-mono">#{r.work_item_id}</span>
                            )}
                            <span className="truncate text-muted-foreground" title={r.work_item_title ?? ''}>
                              {r.work_item_title ?? '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell title={r.assigned_to_email ?? ''}>{r.assigned_to_display ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.sprint_code ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap" title={r.detected_tags ?? ''}>
                          {r.detection_method ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${cfg.className}`} title={r.alert_error ?? ''}>
                            {cfg.label}
                          </Badge>
                          {r.alert_sent_at && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDataHora(r.alert_sent_at)}</div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {CANAL_LABEL[r.alert_channel_type ?? ''] ?? r.alert_channel_type ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.is_open ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                              Em aberto
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Resolvido {fmtDataHora(r.resolved_at)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ── Vdesk ─────────────────────────────────────────────────────────── */}
      {aba === 'vdesk' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <TituloBloco>
              <SendHorizonal className="h-3.5 w-3.5 text-orange-500" />Sincronização VDESK → DevOps
            </TituloBloco>
            {!posts.isError && !posts.isLoading && (
              <>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                  {postLancados} lançados
                </Badge>
                {postErros > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-700 border-red-500/30">
                    {postErros} com erro
                  </Badge>
                )}
                {semEmailRows.length > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                    {semEmailRows.length} sem e-mail
                  </Badge>
                )}
              </>
            )}
          </div>
          {/* 2a. Execuções do sync */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />Execuções do sync VDESK
            </h4>
            {runs.isError ? (
              <EstadoErro erro={runs.error} />
            ) : runs.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (runs.data?.rows ?? []).length === 0 ? (
              <EstadoVazio mensagem="Nenhuma execução registrada." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Início</TableHead>
                      <TableHead>Janela consultada</TableHead>
                      <TableHead className="text-right">Buscados</TableHead>
                      <TableHead className="text-right">Gravados</TableHead>
                      <TableHead className="text-right">Páginas</TableHead>
                      <TableHead className="text-right">Duração</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(runs.data?.rows ?? []).map((r) => (
                      <TableRow key={r.id} className="text-xs">
                        <TableCell className="whitespace-nowrap">{fmtDataHora(r.started_at)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {fmtData(r.from_date)} → {fmtData(r.to_date)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{r.rows_fetched}</TableCell>
                        <TableCell className="text-right font-mono">{r.rows_inserted}</TableCell>
                        <TableCell className="text-right font-mono">{r.pages_fetched}</TableCell>
                        <TableCell className="text-right font-mono">{fmtDuracao(r.duration_ms)}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.triggered_by}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              r.status === 'ok'
                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                                : r.status === 'running'
                                  ? 'bg-sky-500/10 text-sky-700 border-sky-500/30'
                                  : 'bg-red-500/10 text-red-700 border-red-500/30'
                            }`}
                            title={r.error_message ?? ''}
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* 2b. Rastro por lançamento */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />Lançamentos enviados ao DevOps
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Buscar por pessoa, task ou id do DevOps…"
                value={postBusca}
                onChange={(e) => setPostBusca(e.target.value)}
                className="h-7 text-xs max-w-xs"
              />
              {['', 'posted', 'error', 'pending', 'approved'].map((s) => (
                <Button
                  key={s || 'todos'}
                  size="sm"
                  variant={postStatus === s ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setPostStatus(s)}
                >
                  {s === '' ? 'Todos' : POST_STATUS[s]?.label ?? s}
                </Button>
              ))}
            </div>

            {posts.data?.truncated && <AvisoTruncado total={postTodos.length} />}

            {posts.isError ? (
              <EstadoErro erro={posts.error} />
            ) : posts.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : postVisiveis.length === 0 ? (
              <EstadoVazio
                mensagem={
                  postTodos.length > 0
                    ? 'Nenhum lançamento corresponde ao filtro.'
                    : 'Nenhum lançamento no período.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Dia apontado</TableHead>
                      <TableHead>Pessoa</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead className="text-right">Tempo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Lançado em</TableHead>
                      <TableHead>ID no DevOps</TableHead>
                      <TableHead className="text-right">Tentativas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postVisiveis.map((r) => {
                      const cfg = rotuloStatus(POST_STATUS, r.status);
                      return (
                        <TableRow key={r.id} className="text-xs">
                          <TableCell className="whitespace-nowrap">{fmtData(r.log_date)}</TableCell>
                          <TableCell title={r.target_user_email ?? 'sem e-mail mapeado'}>
                            {r.target_user_display ?? r.vdesk_user_name}
                            {!r.target_user_email && (
                              <span className="text-amber-600 italic ml-1">(sem e-mail)</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono">#{r.task_devops}</TableCell>
                          <TableCell className="text-right font-mono">{fmtHM(r.time_minutes)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${cfg.className}`} title={r.error_message ?? ''}>
                              {cfg.label}
                            </Badge>
                            {r.dry_run && (
                              <Badge variant="outline" className={`text-[10px] ml-1 ${NEUTRO}`}>
                                simulação
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDataHora(r.posted_at)}</TableCell>
                          <TableCell className="font-mono text-[10px] max-w-[180px] truncate" title={r.devops_entry_id ?? ''}>
                            {r.devops_entry_id ?? '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono">{r.attempt_count}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* 2c. Exceções: apontamento sem destinatário resolvível */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" />Apontamentos que não podem ser lançados
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Pessoas sem e-mail do DevOps no mapa de colaboradores: o lançamento não tem
              destinatário e fica parado. Resolve-se cadastrando o e-mail no mapa.
            </p>
            {semEmail.isError ? (
              <EstadoErro erro={semEmail.error} />
            ) : semEmail.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : semEmailRows.length === 0 ? (
              <EstadoVazio mensagem="Todos os apontamentos do período têm e-mail mapeado." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>Usuário VDESK</TableHead>
                      <TableHead className="text-right">Apontamentos</TableHead>
                      <TableHead className="text-right">Tempo parado</TableHead>
                      <TableHead>Primeiro</TableHead>
                      <TableHead>Último</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {semEmailRows.map((r) => (
                      <TableRow key={r.usuario_vdesk} className="text-xs">
                        <TableCell className="font-medium text-amber-700">{r.usuario_vdesk}</TableCell>
                        <TableCell className="text-right font-mono">{r.apontamentos}</TableCell>
                        <TableCell className="text-right font-mono">{fmtHM(r.minutos)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtData(r.primeira_data)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtData(r.ultima_data)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transbordo ────────────────────────────────────────────────────── */}
      {/* A tela completa (trava, Classificar, Aplicar e histórico) vive aqui —
          não há mais menu isolado. O histórico segue o período selecionado. */}
      {aba === 'transbordo' && <TransbordoAcoesTab dias={dias} />}
        </div>
      </div>
    </div>
  );
}
