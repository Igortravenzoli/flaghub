import { useState, useEffect } from 'react';
import { useTicketAnalysis } from '@/hooks/useTicketAnalysis';
import { useAutoCorrelation } from '@/hooks/useAutoCorrelation';
import { useAuth } from '@/hooks/useAuth';
import { HeroHeader } from '@/components/dashboard/HeroHeader';
import { ModernStatCard } from '@/components/dashboard/ModernStatCard';
import { ActionBar } from '@/components/dashboard/ActionBar';
import { CorrelationProgress } from '@/components/dashboard/CorrelationProgress';
import { CriticalAlerts } from '@/components/dashboard/CriticalAlerts';
import { RecentTickets } from '@/components/dashboard/RecentTickets';
import { KioskMode } from '@/components/dashboard/KioskMode';
import { DashboardExport } from '@/components/dashboard/DashboardExport';
import { Badge } from '@/components/ui/badge';
import { 
  Ticket, 
  CheckCircle, 
  AlertTriangle, 
  Eye,
  X,
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
    // Aguardar autenticação
    if (isAuthLoading || !networkId) {
      console.log('[Dashboard] Aguardando autenticação...', { isAuthLoading, networkId });
      return;
    }
    
    // Executa correlação ao montar
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
    
    // Auto-refresh e correlação a cada 60 segundos
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
  
  // Filtrar tickets por status selecionado
  const ticketsFiltrados = ticketsConsolidados.filter(t => {
    switch (statusFilter) {
      case 'ok':
        // Tickets OK = info ou success (com OS vinculada)
        return t.severidade === 'info' || t.severidade === 'success';
      case 'semOS':
        return t.severidade === 'critical';
      case 'observacao':
        return t.severidade === 'warning';
      default:
        return true;
    }
  });
  
  // Tickets recentes (últimos 10, respeitando filtro)
  const ticketsRecentes = ticketsFiltrados.slice(0, 10);
  
  // Tickets críticos (para alertas, sempre mostra todos os críticos)
  const ticketsCriticos = ticketsConsolidados.filter(t => t.severidade === 'critical');
  
  // Função para alternar filtro (clique novamente remove filtro)
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
    <div className="min-h-screen p-6 lg:p-8 space-y-6">
      {/* Hero Header */}
      <HeroHeader lastUpdate={lastUpdate} />

      {/* Action Bar + Export */}
      <div className="flex items-center justify-end gap-2">
        <DashboardExport estatisticas={estatisticas} tickets={ticketsConsolidados} />
        <ActionBar 
          onRefresh={handleRefresh}
          onKioskMode={() => setKioskMode(true)}
          isCorrelating={isCorrelating}
        />
      </div>
      
      {/* Progress de correlação */}
      <CorrelationProgress 
        progress={correlationProgress} 
        isCorrelating={isCorrelating} 
      />
      
      {/* Stats Cards - Grid moderno */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <ModernStatCard
          title="Total de Tickets"
          value={estatisticas.totalTickets}
          icon={Ticket}
          subtitle="Tickets ativos no sistema"
          trend="neutral"
          onClick={() => handleFilterClick('all')}
          isActive={statusFilter === 'all'}
        />
        <ModernStatCard
          title="Tickets OK"
          value={estatisticas.ticketsOK}
          icon={CheckCircle}
          severity="success"
          subtitle="Com OS vinculada"
          trend="up"
          trendValue="+12%"
          onClick={() => handleFilterClick('ok')}
          isActive={statusFilter === 'ok'}
        />
        <ModernStatCard
          title="Sem OS"
          value={estatisticas.ticketsSemOS}
          icon={AlertTriangle}
          severity="critical"
          subtitle="Fora do prazo configurado"
          trend="down"
          trendValue="-5%"
          onClick={() => handleFilterClick('semOS')}
          isActive={statusFilter === 'semOS'}
        />
        <ModernStatCard
          title="Em Observação"
          value={estatisticas.ticketsObservacao}
          icon={Eye}
          severity="warning"
          subtitle="Requer atenção"
          onClick={() => handleFilterClick('observacao')}
          isActive={statusFilter === 'observacao'}
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
