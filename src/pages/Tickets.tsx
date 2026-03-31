import { useState } from 'react';
import { useTicketAnalysis } from '@/hooks/useTicketAnalysis';
import { TicketsTable } from '@/components/dashboard/TicketsTable';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, X, AlertTriangle, Ticket, Filter } from 'lucide-react';
import { TicketConsolidado, Severidade, StatusNormalizado } from '@/types';
import { SeverityBadge } from '@/components/ui/severity-badge';

const statusLabels: Record<StatusNormalizado, string> = {
  novo: 'Novo',
  em_andamento: 'Em Andamento',
  aguardando: 'Aguardando',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
  nao_mapeado: 'Não Mapeado'
};

export default function Tickets() {
  const { ticketsFiltrados, filtros, atualizarFiltro, limparFiltros } = useTicketAnalysis();
  const [selectedTicket, setSelectedTicket] = useState<TicketConsolidado | null>(null);
  
  const hasActiveFilters = Object.values(filtros).some(v => v !== '');
  
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Ticket className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Pesquisa de Tickets</h1>
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          Consulta e análise detalhada dos tickets Nestlé
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filtros</span>
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={limparFiltros}
                className="text-muted-foreground h-6 text-xs ml-auto"
              >
                <X className="h-3 w-3 mr-1" />
                Limpar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Busca */}
            <div className="lg:col-span-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Ticket, descrição ou OS..."
                value={filtros.busca}
                onChange={(e) => atualizarFiltro('busca', e.target.value)}
                className="pl-9 h-8 text-xs"
              />
            </div>
            
            {/* Severidade */}
            <Select
              value={filtros.severidade || 'all'}
              onValueChange={(v) => atualizarFiltro('severidade', v === 'all' ? '' : v as Severidade)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="critical">🔴 Crítico</SelectItem>
                <SelectItem value="warning">🟡 Atenção</SelectItem>
                <SelectItem value="info">🔵 Informativo</SelectItem>
                <SelectItem value="success">🟢 OK</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Status */}
            <Select
              value={filtros.status || 'all'}
              onValueChange={(v) => atualizarFiltro('status', v === 'all' ? '' : v as StatusNormalizado)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Tipo */}
            <Select
              value={filtros.tipo || 'all'}
              onValueChange={(v) => atualizarFiltro('tipo', v === 'all' ? '' : v as 'incident' | 'request')}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="incident">Incidente</SelectItem>
                <SelectItem value="request">Requisição</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {hasActiveFilters && (
            <div className="mt-3">
              <Badge variant="secondary" className="text-xs">
                {ticketsFiltrados.length} ticket(s) encontrado(s)
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Tabela de Tickets */}
      <Card>
        <CardContent className="p-0">
          <TicketsTable 
            tickets={ticketsFiltrados} 
            onViewDetails={setSelectedTicket}
          />
        </CardContent>
      </Card>
      
      {/* Modal de Detalhes */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl">
          {selectedTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono">{selectedTicket.ticket.number}</span>
                  <SeverityBadge severity={selectedTicket.severidade} size="sm" />
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Inconsistências */}
                {selectedTicket.inconsistencias.length > 0 && (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <h4 className="font-medium flex items-center gap-2 text-destructive mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      Inconsistências Detectadas
                    </h4>
                    <ul className="space-y-1">
                      {selectedTicket.inconsistencias.map((inc, i) => (
                        <li key={i} className="text-sm text-destructive">• {inc}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Dados do Ticket */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-3">Dados do Ticket (Nestlé)</h4>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Número:</dt>
                        <dd className="font-mono">{selectedTicket.ticket.number}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Tipo:</dt>
                        <dd>
                          <Badge variant="outline">
                            {selectedTicket.ticket.type === 'incident' ? 'Incidente' : 'Requisição'}
                          </Badge>
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Status Externo:</dt>
                        <dd>{selectedTicket.ticket.state}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Status Interno:</dt>
                        <dd>
                          <Badge variant="secondary">
                            {statusLabels[selectedTicket.statusNormalizado]}
                          </Badge>
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Prioridade:</dt>
                        <dd>{selectedTicket.ticket.priority}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Abertura:</dt>
                        <dd>{selectedTicket.ticket.opened_at}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Responsável:</dt>
                        <dd className="max-w-[150px] truncate">
                          {selectedTicket.ticket.assigned_to?.split(' (')[0] || '-'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-3">OS Vinculada (VDESK)</h4>
                    {selectedTicket.osVinculada ? (
                      <div className="space-y-4">
                        {(selectedTicket.osMultiplas && selectedTicket.osMultiplas.length > 0 
                          ? selectedTicket.osMultiplas 
                          : [selectedTicket.osVinculada]
                        ).map((os, osIdx) => (
                          <div key={osIdx} className={`${osIdx > 0 ? 'pt-3 border-t border-border' : ''}`}>
                            {selectedTicket.osMultiplas && selectedTicket.osMultiplas.length > 1 && (
                              <Badge variant="outline" className="mb-2 text-xs">
                                OS {osIdx + 1} de {selectedTicket.osMultiplas.length}
                              </Badge>
                            )}
                            <dl className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <dt className="text-muted-foreground">OS:</dt>
                                <dd className="font-mono text-[hsl(var(--chart-2))]">{os.os}</dd>
                              </div>
                              {os.cliente && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Cliente:</dt>
                                  <dd>{os.cliente}</dd>
                                </div>
                              )}
                              {os.bandeira && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Bandeira:</dt>
                                  <dd>{os.bandeira}</dd>
                                </div>
                              )}
                              {os.programador && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Colaborador:</dt>
                                  <dd>{os.programador}</dd>
                                </div>
                              )}
                              {os.sistema && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Sistema:</dt>
                                  <dd>{os.sistema}</dd>
                                </div>
                              )}
                              {os.componente && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Componente:</dt>
                                  <dd>{os.componente}</dd>
                                </div>
                              )}
                              {os.tipoChamado && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Tipo:</dt>
                                  <dd>{os.tipoChamado}</dd>
                                </div>
                              )}
                              {os.criticidade && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Criticidade:</dt>
                                  <dd>{os.criticidade}</dd>
                                </div>
                              )}
                              {os.dataRegistro && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Data Registro:</dt>
                                  <dd>{os.dataRegistro.split(' ')[0]}</dd>
                                </div>
                              )}
                              {os.dataHistorico && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Data Histórico:</dt>
                                  <dd>{os.dataHistorico.split(' ')[0]}</dd>
                                </div>
                              )}
                              {os.previsao && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Previsão:</dt>
                                  <dd>{os.previsao}</dd>
                                </div>
                              )}
                              {os.retorno && (
                                <div className="flex justify-between">
                                  <dt className="text-muted-foreground">Retorno:</dt>
                                  <dd>{os.retorno}</dd>
                                </div>
                              )}
                            </dl>
                            {os.descricaoOS && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                  {os.descricaoOS}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
                        <p>Nenhuma OS vinculada</p>
                        {selectedTicket.horasSemOS !== null && (
                          <p className="text-sm mt-1">
                            Há <strong>{selectedTicket.horasSemOS}h</strong> sem OS
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Descrição */}
                <div>
                  <h4 className="font-medium mb-2">Descrição</h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                    {selectedTicket.ticket.short_description || 'Sem descrição disponível'}
                  </p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
