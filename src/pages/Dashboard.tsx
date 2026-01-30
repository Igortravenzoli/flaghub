import { useState, useEffect } from 'react';
import { useTicketAnalysis } from '@/hooks/useTicketAnalysis';
import { useAutoCorrelation } from '@/hooks/useAutoCorrelation';
import { StatCard } from '@/components/dashboard/StatCard';
import { TicketsTable } from '@/components/dashboard/TicketsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Ticket, 
  CheckCircle, 
  AlertTriangle, 
  Eye, 
  RefreshCw,
  Monitor,
  Maximize2,
  Minimize2,
  Loader2,
  Link2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Dashboard() {
  const { ticketsConsolidados, estatisticas } = useTicketAnalysis();
  const { correlateAllPending, isCorrelating, progress: correlationProgress, summary } = useAutoCorrelation();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [kioskMode, setKioskMode] = useState(false);
  
  // Simula auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 60000); // 1 minuto
    
    return () => clearInterval(interval);
  }, []);
  
  // Tickets recentes (últimos 10)
  const ticketsRecentes = ticketsConsolidados.slice(0, 10);
  
  // Tickets críticos
  const ticketsCriticos = ticketsConsolidados.filter(t => t.severidade === 'critical');
  
  const handleRefresh = async () => {
    setLastUpdate(new Date());
    
    // Executar correlação automática com VDESK
    try {
      toast.info('Atualizando...', { description: 'Consultando VDESK para correlação de tickets' });
      const result = await correlateAllPending();
      
      if (result.total === 0) {
        toast.success('Atualizado!', { description: 'Nenhum ticket pendente de correlação' });
      } else {
        toast.success('Correlação concluída!', { 
          description: `${result.correlated} tickets com OS, ${result.notFound} sem OS no VDESK` 
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
      <div className="min-h-screen bg-background p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Monitor className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-4xl font-bold">Painel Operacional</h1>
              <p className="text-xl text-muted-foreground">
                Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => setKioskMode(false)}
          >
            <Minimize2 className="h-5 w-5 mr-2" />
            Sair Kiosk
          </Button>
        </div>
        
        {/* Cards grandes para TV */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total de Tickets"
            value={estatisticas.totalTickets}
            icon={Ticket}
            className="text-2xl"
          />
          <StatCard
            title="Tickets OK"
            value={estatisticas.ticketsOK}
            icon={CheckCircle}
            severity="success"
            className="text-2xl"
          />
          <StatCard
            title="Sem OS (Crítico)"
            value={estatisticas.ticketsSemOS}
            icon={AlertTriangle}
            severity="critical"
            className="text-2xl"
          />
          <StatCard
            title="Em Observação"
            value={estatisticas.ticketsObservacao}
            icon={Eye}
            severity="warning"
            className="text-2xl"
          />
        </div>
        
        {/* Lista simplificada de críticos */}
        {ticketsCriticos.length > 0 && (
          <Card className="border-[hsl(var(--critical))]/30 bg-[hsl(var(--critical))]/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl flex items-center gap-2 text-[hsl(var(--critical))]">
                <AlertTriangle className="h-6 w-6" />
                Tickets Críticos - Sem OS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ticketsCriticos.slice(0, 5).map(tc => (
                  <div 
                    key={tc.ticket.number} 
                    className="flex items-center justify-between p-4 bg-background rounded-lg text-xl"
                  >
                    <span className="font-mono font-bold">{tc.ticket.number}</span>
                    <span className="text-muted-foreground">
                      {tc.ticket.short_description || 'Sem descrição'}
                    </span>
                    <span className="text-[hsl(var(--critical))] font-bold">
                      {tc.horasSemOS}h sem OS
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Operacional</h1>
          <p className="text-muted-foreground">
            Visão geral dos tickets e ordens de serviço
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isCorrelating}
          >
            {isCorrelating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            {isCorrelating ? 'Correlacionando...' : 'Atualizar'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setKioskMode(true)}>
            <Maximize2 className="h-4 w-4 mr-1" />
            Modo TV
          </Button>
        </div>
      </div>
      
      {/* Barra de progresso da correlação */}
      {isCorrelating && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Link2 className="h-5 w-5 text-primary animate-pulse" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Correlacionando tickets com VDESK...</span>
                  <span className="text-sm text-muted-foreground">{correlationProgress}%</span>
                </div>
                <Progress value={correlationProgress} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total de Tickets"
          value={estatisticas.totalTickets}
          icon={Ticket}
          subtitle="Tickets ativos no sistema"
        />
        <StatCard
          title="Tickets OK"
          value={estatisticas.ticketsOK}
          icon={CheckCircle}
          severity="success"
          subtitle="Com OS vinculada"
        />
        <StatCard
          title="Sem OS (Crítico)"
          value={estatisticas.ticketsSemOS}
          icon={AlertTriangle}
          severity="critical"
          subtitle="Fora do prazo configurado"
        />
        <StatCard
          title="Em Observação"
          value={estatisticas.ticketsObservacao}
          icon={Eye}
          severity="warning"
          subtitle="Requer atenção"
        />
      </div>
      
      {/* Alertas Críticos */}
      {ticketsCriticos.length > 0 && (
        <Card className={cn(
          "border-[hsl(var(--critical))]/30 bg-[hsl(var(--critical))]/5"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-[hsl(var(--critical))]">
              <AlertTriangle className="h-5 w-5" />
              Tickets Críticos - Sem OS ({ticketsCriticos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TicketsTable tickets={ticketsCriticos.slice(0, 5)} compact />
          </CardContent>
        </Card>
      )}
      
      {/* Tickets Recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tickets Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <TicketsTable tickets={ticketsRecentes} />
        </CardContent>
      </Card>
    </div>
  );
}
