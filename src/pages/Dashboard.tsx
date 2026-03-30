import { useState, useEffect } from 'react';
import { useTicketAnalysis } from '@/hooks/useTicketAnalysis';
import { useAutoCorrelation } from '@/hooks/useAutoCorrelation';
import { useAuth } from '@/hooks/useAuth';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { CorrelationProgress } from '@/components/dashboard/CorrelationProgress';
import { CriticalAlerts } from '@/components/dashboard/CriticalAlerts';
import { RecentTickets } from '@/components/dashboard/RecentTickets';
import { KioskMode } from '@/components/dashboard/KioskMode';
import { DashboardExport } from '@/components/dashboard/DashboardExport';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Ticket, 
  CheckCircle, 
  AlertTriangle, 
  Eye,
  X,
  RefreshCw,
  Maximize2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'ok' | 'semOS' | 'observacao';

export default function Dashboard() {
  const { networkId, isLoading: isAuthLoading } = useAuth();
  const { ticketsConsolidados, estatisticas } = useTicketAnalysis();
  const { correlateAllPending, isCorrelating, progress: correlationProgress } = useAutoCorrelation();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [kioskMode, setKioskMode] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  
  // Correlação automática ao carregar (somente quando autenticado)
  useEffect(() => {
    if (isAuthLoading || !networkId) {
      console.log('[Dashboard] Aguardando autenticação...', { isAuthLoading, networkId });
      return;
    }
    
    const runInitialCorrelation = async () => {
      try {
        console.log('[Dashboard] Executando correlação inicial para network:', networkId);
        const result = await correlateAllPending();
        console.log('[Dashboard] Correlação inicial concluída:', result);
      } catch (error) {
        console.error('[Dashboard] Erro na correlação inicial:', error);
      }
    };
    
    runInitialCorrelation();
    
    const interval = setInterval(async () => {
      setLastUpdate(new Date());
      try {
        await correlateAllPending();
      } catch (error) {
        console.error('[Dashboard] Erro na correlação automática:', error);
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, [correlateAllPending, networkId, isAuthLoading]);
  
  const ticketsFiltrados = ticketsConsolidados.filter(t => {
    switch (statusFilter) {
      case 'ok':
        return !!t.osVinculada;
      case 'semOS':
        return !t.osVinculada;
      case 'observacao':
        return t.severidade === 'warning' && !!t.osVinculada;
      default:
        return true;
    }
  });
  
  const ticketsRecentes = ticketsFiltrados.slice(0, 10);
  const ticketsCriticos = ticketsConsolidados.filter(t => !t.osVinculada);
  
  const handleFilterClick = (filter: StatusFilter) => {
    setStatusFilter(prev => prev === filter ? 'all' : filter);
  };
  
  const handleRefresh = async () => {
    setLastUpdate(new Date());
    
    try {
      toast.info('Sincronizando...', { 
        description: 'Consultando VDESK para correlação de tickets',
        icon: '🔄'
      });
      
      const result = await correlateAllPending();
      
      if (result.total === 0) {
        toast.success('Atualizado!', { 
          description: 'Nenhum ticket pendente de correlação',
          icon: '✨'
        });
      } else {
        toast.success('Correlação concluída!', { 
          description: `${result.correlated} com OS • ${result.notFound} sem OS`,
          icon: '🎯'
        });
      }
    } catch (error) {
      toast.error('Erro na correlação', { 
        description: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  };
  
  if (kioskMode) {
    return (
      <KioskMode 
        estatisticas={estatisticas}
        ticketsCriticos={ticketsCriticos}
        lastUpdate={lastUpdate}
        onExit={() => setKioskMode(false)}
      />
    );
  }
  
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top bar: sync badge + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DashboardLastSyncBadge
          syncedAt={lastUpdate.toISOString()}
          status="ok"
        />
        <div className="flex items-center gap-2">
          <DashboardExport 
            estatisticas={estatisticas} 
            tickets={ticketsFiltrados} 
            filterLabel={statusFilter === 'ok' ? 'Tickets OK' : statusFilter === 'semOS' ? 'Sem OS' : statusFilter === 'observacao' ? 'Em Observação' : undefined}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            onClick={handleRefresh}
            disabled={isCorrelating}
          >
            {isCorrelating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isCorrelating ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8"
            onClick={() => setKioskMode(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Modo TV
          </Button>
        </div>
      </div>

      {/* Progress de correlação */}
      <CorrelationProgress 
        progress={correlationProgress} 
        isCorrelating={isCorrelating} 
      />
      
      {/* KPI Cards — padrão setorial */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardKpiCard
          label="Total de Tickets"
          value={estatisticas.totalTickets}
          icon={Ticket}
          onClick={() => handleFilterClick('all')}
          active={statusFilter === 'all'}
          tooltipDescription="Tickets ativos no sistema"
        />
        <DashboardKpiCard
          label="Tickets OK"
          value={estatisticas.ticketsOK}
          icon={CheckCircle}
          accent="bg-[hsl(var(--success))]"
          onClick={() => handleFilterClick('ok')}
          active={statusFilter === 'ok'}
          tooltipDescription="Com OS vinculada"
        />
        <DashboardKpiCard
          label="Sem OS"
          value={estatisticas.ticketsSemOS}
          icon={AlertTriangle}
          accent="bg-[hsl(var(--critical))]"
          onClick={() => handleFilterClick('semOS')}
          active={statusFilter === 'semOS'}
          tooltipDescription="Fora do prazo configurado"
        />
        <DashboardKpiCard
          label="Em Observação"
          value={estatisticas.ticketsObservacao}
          icon={Eye}
          accent="bg-[hsl(var(--warning))]"
          onClick={() => handleFilterClick('observacao')}
          active={statusFilter === 'observacao'}
          tooltipDescription="Requer atenção"
        />
      </div>
      
      {/* Alertas Críticos */}
      <CriticalAlerts tickets={ticketsCriticos} />
      
      {/* Indicador de filtro ativo */}
      {statusFilter !== 'all' && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="flex items-center gap-1 px-3 py-1">
            Filtro: {statusFilter === 'ok' ? 'Tickets OK' : statusFilter === 'semOS' ? 'Sem OS' : 'Em Observação'}
            <button onClick={() => setStatusFilter('all')} className="ml-1 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
          <span className="text-xs text-muted-foreground">
            {ticketsFiltrados.length} ticket(s) encontrado(s)
          </span>
        </div>
      )}

      {/* Tickets Recentes */}
      <RecentTickets tickets={ticketsRecentes} />
    </div>
  );
}
