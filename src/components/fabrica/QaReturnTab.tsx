import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, Search, ChevronLeft, ChevronRight, ExternalLink, Calendar, Clock, AlertCircle,
} from 'lucide-react';
import { QaReturnOpenItem } from '@/hooks/useQaReturnKpis';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const PAGE_SIZE = 25;

interface QaReturnTabProps {
  items: QaReturnOpenItem[];
  isLoading: boolean;
}

function getDaysColor(days: number): string {
  if (days < 7) return 'text-green-600 bg-green-50';
  if (days <= 14) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'open':
      return 'bg-red-100 text-red-700 border border-red-300';
    case 'resolved':
    case 'closed':
      return 'bg-green-100 text-green-700 border border-green-300';
    case 'pending':
      return 'bg-amber-100 text-amber-700 border border-amber-300';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-300';
  }
}

export function QaReturnTab({ items, isLoading }: QaReturnTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  const filteredItems = useMemo(() => {
    let result = items;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(item => item.alert_status?.toLowerCase() === statusFilter.toLowerCase());
    }

    // Search filter
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

  const summary = useMemo(() => {
    const total = items.length;
    const open = items.filter(i => i.alert_status?.toLowerCase() === 'open').length;
    const avgDays = items.length > 0
      ? (items.reduce((sum, i) => sum + (i.days_since_return || 0), 0) / items.length).toFixed(1)
      : '0';
    const maxDays = items.length > 0
      ? Math.max(...items.map(i => i.days_since_return || 0))
      : 0;

    return { total, open, avgDays, maxDays };
  }, [items]);

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
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Total Retornos</p>
            <p className="text-2xl font-bold text-foreground">{summary.total}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Abertos</p>
            <p className={`text-2xl font-bold ${summary.open > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
              {summary.open}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Média Dias</p>
            <p className="text-2xl font-bold text-foreground">{summary.avgDays}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-xs text-muted-foreground font-medium mb-1">Máximo Dias</p>
            <p className={`text-2xl font-bold ${summary.maxDays > 14 ? 'text-destructive' : 'text-foreground'}`}>
              {summary.maxDays}
            </p>
          </div>
        </Card>
      </div>

      {/* Filters & Search */}
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
                placeholder="Buscar por ID, título, responsável..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="resolved">Resolvido</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
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
                    <TableHead className="text-xs font-semibold">Título</TableHead>
                    <TableHead className="text-xs font-semibold w-24">Tipo</TableHead>
                    <TableHead className="text-xs font-semibold w-20">Sprint</TableHead>
                    <TableHead className="text-xs font-semibold w-32">Responsável</TableHead>
                    <TableHead className="text-xs font-semibold w-20">Detectado</TableHead>
                    <TableHead className="text-xs font-semibold w-20">Dias</TableHead>
                    <TableHead className="text-xs font-semibold w-20">Status</TableHead>
                    <TableHead className="text-xs font-semibold w-12">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map(item => (
                    <TableRow
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-mono text-xs font-semibold">
                        {item.web_url ? (
                          <a
                            href={item.web_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {item.work_item_id}
                          </a>
                        ) : (
                          <span>{item.work_item_id}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">
                        {item.work_item_title || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline">
                          {item.work_item_type === 'Product Backlog Item'
                            ? 'PBI'
                            : item.work_item_type || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.sprint_code || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.assigned_to_display ? (
                          <span className="truncate max-w-[120px]">{item.assigned_to_display.split(' ').slice(0, 2).join(' ')}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.detected_at
                          ? new Date(item.detected_at).toLocaleDateString('pt-BR')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs font-mono ${getDaysColor(item.days_since_return || 0)}`}>
                          {item.days_since_return ?? 0}d
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${getStatusColor(item.alert_status)}`}>
                          {item.alert_status?.charAt(0).toUpperCase() + item.alert_status?.slice(1).toLowerCase() || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.web_url ? (
                          <a
                            href={item.web_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 transition-colors"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages} • {filteredItems.length} item(s)
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
    </div>
  );
}
