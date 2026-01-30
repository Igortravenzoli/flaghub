import { useState, useEffect } from 'react';
import { useTicketAnalysis } from '@/hooks/useTicketAnalysis';
import { useAutoCorrelation } from '@/hooks/useAutoCorrelation';
import { HeroHeader } from '@/components/dashboard/HeroHeader';
import { ModernStatCard } from '@/components/dashboard/ModernStatCard';
import { ActionBar } from '@/components/dashboard/ActionBar';
import { CorrelationProgress } from '@/components/dashboard/CorrelationProgress';
import { CriticalAlerts } from '@/components/dashboard/CriticalAlerts';
import { RecentTickets } from '@/components/dashboard/RecentTickets';
import { KioskMode } from '@/components/dashboard/KioskMode';
import { 
  Ticket, 
  CheckCircle, 
  AlertTriangle, 
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { ticketsConsolidados, estatisticas } = useTicketAnalysis();
  const { correlateAllPending, isCorrelating, progress: correlationProgress } = useAutoCorrelation();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [kioskMode, setKioskMode] = useState(false);
  
  // Correlação automática ao carregar e a cada minuto
  useEffect(() => {
    // Executa correlação ao montar
    const runInitialCorrelation = async () => {
      try {
        console.log('[Dashboard] Executando correlação inicial...');
        await correlateAllPending();
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
  }, [correlateAllPending]);
  
  // Tickets recentes (últimos 10)
  const ticketsRecentes = ticketsConsolidados.slice(0, 10);
  
  // Tickets críticos
  const ticketsCriticos = ticketsConsolidados.filter(t => t.severidade === 'critical');
  
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

      {/* Action Bar */}
      <div className="flex items-center justify-end">
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
        />
        <ModernStatCard
          title="Tickets OK"
          value={estatisticas.ticketsOK}
          icon={CheckCircle}
          severity="success"
          subtitle="Com OS vinculada"
          trend="up"
          trendValue="+12%"
        />
        <ModernStatCard
          title="Sem OS"
          value={estatisticas.ticketsSemOS}
          icon={AlertTriangle}
          severity="critical"
          subtitle="Fora do prazo configurado"
          trend="down"
          trendValue="-5%"
        />
        <ModernStatCard
          title="Em Observação"
          value={estatisticas.ticketsObservacao}
          icon={Eye}
          severity="warning"
          subtitle="Requer atenção"
        />
      </div>
      
      {/* Alertas Críticos */}
      <CriticalAlerts tickets={ticketsCriticos} />
      
      {/* Tickets Recentes */}
      <RecentTickets tickets={ticketsRecentes} />
    </div>
  );
}
