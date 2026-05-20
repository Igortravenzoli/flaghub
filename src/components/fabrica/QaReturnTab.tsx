import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, Search, ChevronLeft, ChevronRight, ExternalLink, AlertCircle,
} from 'lucide-react';
import { QaReturnOpenItem, QaReturnSummary } from '@/hooks/useQaReturnKpis';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const PAGE_SIZE = 25;

interface QaReturnTabProps {
  items: QaReturnOpenItem[];
  isLoading: boolean;
  summary?: QaReturnSummary | null;
}

function isDispatchConfirmed(item: QaReturnOpenItem): boolean {
  const status = item.alert_status?.toLowerCase();
  const validStatus = status === 'sent' || status === 'fallback_sent';
  const validChannel = item.alert_channel_type === 'teams_1on1' || item.alert_channel_type === 'teams_webhook';
  return validStatus && validChannel && Boolean(item.alert_sent_at);
}

function getAlertLabel(item: QaReturnOpenItem): string {
  if (isDispatchConfirmed(item)) {
    return item.alert_status?.toLowerCase() === 'fallback_sent' ? 'Enviado no Flaghub' : 'Enviado';
  }

  switch (item.alert_status?.toLowerCase()) {
    case 'pending':
      return 'Pendente';
    case 'failed':
      return 'Falha';
    case 'skipped':
      return 'Ignorado';
    case 'sent':
    case 'fallback_sent':
      return 'Sem confirmacao';
    default:
      return '-';
  }
}

function getStatusColor(item: QaReturnOpenItem): string {
  if (isDispatchConfirmed(item)) {
    return item.alert_status?.toLowerCase() === 'fallback_sent'
      ? 'bg-sky-100 text-sky-700 border border-sky-300'
      : 'bg-green-100 text-green-700 border border-green-300';
  }

  switch (item.alert_status?.toLowerCase()) {
    case 'sent':
    case 'fallback_sent':
      return 'bg-orange-100 text-orange-700 border border-orange-300';
    case 'pending':
      return 'bg-amber-100 text-amber-700 border border-amber-300';
    case 'failed':
      return 'bg-red-100 text-red-700 border border-red-300';
    case 'skipped':
      return 'bg-slate-100 text-slate-700 border border-slate-300';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-300';
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAlertTarget(item: QaReturnOpenItem): string {
  if (item.alert_channel_type === 'teams_webhook') return 'Canal Flaghub';
  if (item.assigned_to_email) return item.assigned_to_email;
  if (item.assigned_to_display) return item.assigned_to_display;
  return 'Destino nao identificado';
}

function AlertBadge({ item }: { item: QaReturnOpenItem }) {
  const label = getAlertLabel(item);
  const hasDispatchContext = Boolean(item.alert_sent_at || item.alert_error || item.alert_channel_type);

  if (!hasDispatchContext) {
    return <Badge className={`text-xs ${getStatusColor(item)}`}>{label}</Badge>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className={`cursor-help text-xs ${getStatusColor(item)}`}>{label}</Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] space-y-1.5 text-xs leading-relaxed">
        <p className="font-semibold text-foreground">Ultimo disparo do alerta</p>
        <p><span className="text-muted-foreground">Status:</span> {label}</p>
        <p><span className="text-muted-foreground">Enviado em:</span> {formatDateTime(item.alert_sent_at)}</p>
        <p><span className="text-muted-foreground">Canal:</span> {item.alert_channel_type === 'teams_1on1' ? 'Teams 1:1' : item.alert_channel_type === 'teams_webhook' ? 'Canal Flaghub' : 'Nao enviado'}</p>
        <p><span className="text-muted-foreground">Destino:</span> {getAlertTarget(item)}</p>
        {item.alert_error && (
          <p><span className="text-muted-foreground">Falha:</span> {item.alert_error}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function QaReturnTab({ items, isLoading, summary: summaryData }: QaReturnTabProps) {

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  const filteredItems = useMemo(() => {
    let result = items;
    if (statusFilter !== 'all') {
      result = result.filter(item => item.alert_status?.toLowerCase() === statusFilter.toLowerCase());
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(item =>
        String(item.work_item_id).includes(q) ||
        item.work_item_title?.toLowerCase().includes(q) ||
        item.assigned_to_display?.toLowerCase().includes(q) ||
        item.sprint_code?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pagedItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Métricas separadas para clareza
  const totalRetornos = summaryData?.total_events ?? items.length;
  const emAndamento = summaryData?.open_events ?? items.length;
  const encerrados = Math.max(totalRetornos - emAndamento, 0);
  const avgDays = items.length > 0
    ? (items.reduce((sum, i) => sum + (i.days_since_return || 0), 0) / items.length).toFixed(1)
    : '0';
  const maxDays = items.length > 0
    ? Math.max(...items.map(i => i.days_since_return || 0))
    : 0;


  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Total de Retornos QA (abertos + encerrados)</p>
            <p className="text-2xl font-bold text-foreground">{totalRetornos}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Em andamento</p>
            <p className={`text-2xl font-bold ${emAndamento > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>{emAndamento}</p>
            <p className="text-[11px] text-muted-foreground mt-1">retornos QA abertos</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Encerrados</p>
            <p className={`text-2xl font-bold ${encerrados > 0 ? 'text-blue-700' : 'text-muted-foreground'}`}>{encerrados}</p>
            <p className="text-[11px] text-muted-foreground mt-1">retornos QA fechados no período</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Média Dias (abertos)</p>
            <p className="text-2xl font-bold text-foreground">{avgDays}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Máximo Dias (abertos)</p>
            <p className={`text-2xl font-bold ${maxDays > 14 ? 'text-destructive' : 'text-foreground'}`}>{maxDays}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Detalhes dos Retornos QA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por ID, titulo, responsavel..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Alerta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="fallback_sent">Enviado no Flaghub</SelectItem>
                <SelectItem value="failed">Falha</SelectItem>
                <SelectItem value="skipped">Ignorado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <TooltipProvider>
        <Card className="overflow-hidden">
          {pagedItems.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {search || statusFilter !== 'all' ? 'Nenhum resultado encontrado' : 'Nenhum retorno QA registrado'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-semibold w-16">ID</TableHead>
                      <TableHead className="text-xs font-semibold">Titulo</TableHead>
                      <TableHead className="text-xs font-semibold w-24">Tipo</TableHead>
                      <TableHead className="text-xs font-semibold w-20">Sprint</TableHead>
                      <TableHead className="text-xs font-semibold w-32">Responsavel</TableHead>
                      <TableHead className="text-xs font-semibold w-36">Retorno</TableHead>
                      <TableHead className="text-xs font-semibold w-28">Alerta</TableHead>
                      <TableHead className="text-xs font-semibold w-12">Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map(item => (
                      <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs font-semibold">
                          {item.web_url ? (
                            <a href={item.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {item.work_item_id}
                            </a>
                          ) : (
                            <span>{item.work_item_id}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[250px] truncate">{item.work_item_title || '-'}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline">
                            {item.work_item_type === 'Product Backlog Item' ? 'PBI' : item.work_item_type || '-'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.sprint_code || '-'}</TableCell>
                        <TableCell className="text-xs">
                          {item.assigned_to_display ? (
                            <span className="truncate max-w-[120px]">{item.assigned_to_display.split(' ').slice(0, 2).join(' ')}</span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="space-y-0.5">
                            <p className="font-medium text-foreground">{formatDateTime(item.transition_date ?? item.detected_at)}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.transition_date ? 'volta para desenvolvimento' : 'deteccao sem historico da transicao'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <AlertBadge item={item} />
                        </TableCell>
                        <TableCell>
                          {item.web_url ? (
                            <a href={item.web_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground/40">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Pagina {page + 1} de {totalPages} - {filteredItems.length} item(s)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </TooltipProvider>
    </div>
  );
}
