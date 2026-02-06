import { useState } from 'react';
import { useTicketAnalysis } from '@/hooks/useTicketAnalysis';
import { TicketsTable } from '@/components/dashboard/TicketsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Search, X, Filter, AlertTriangle } from 'lucide-react';
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Tickets</h1>
        <p className="text-muted-foreground">
          Consulta e análise detalhada dos tickets Nestlé
        </p>
      </div>
      
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Busca */}
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por ticket, descrição ou OS..."
                value={filtros.busca}
                onChange={(e) => atualizarFiltro('busca', e.target.value)}
                className="pl-9"
              />
            </div>
            
            {/* Severidade */}
            <Select
              value={filtros.severidade || 'all'}
              onValueChange={(v) => atualizarFiltro('severidade', v === 'all' ? '' : v as Severidade)}
            >
              <SelectTrigger>
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
              <SelectTrigger>
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
              <SelectTrigger>
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
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {ticketsFiltrados.length} ticket(s) encontrado(s)
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={limparFiltros}
                className="text-muted-foreground"
              >
                <X className="h-3 w-3 mr-1" />
                Limpar filtros
              </Button>
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
                  <div className="p-4 rounded-lg bg-[hsl(var(--critical))]/10 border border-[hsl(var(--critical))]/30">
                    <h4 className="font-medium flex items-center gap-2 text-[hsl(var(--critical))] mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      Inconsistências Detectadas
                    </h4>
                    <ul className="space-y-1">
                      {selectedTicket.inconsistencias.map((inc, i) => (
                        <li key={i} className="text-sm text-[hsl(var(--critical))]">• {inc}</li>
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
                        {/* OS principal ou múltiplas */}
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
                                <dd className="font-mono text-[hsl(var(--success))]">{os.os}</dd>
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
                            {/* Descrição da OS inline */}
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
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--critical))]" />
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
