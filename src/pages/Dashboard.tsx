import { useState, useMemo } from 'react';
import { useTicketAnalysis } from '@/hooks/useTicketAnalysis';
import { useAutoCorrelation } from '@/hooks/useAutoCorrelation';
import { useAuth } from '@/hooks/useAuth';
import { DashboardKpiCard } from '@/components/dashboard/DashboardKpiCard';
import { DashboardLastSyncBadge } from '@/components/dashboard/DashboardLastSyncBadge';
import { CorrelationProgress } from '@/components/dashboard/CorrelationProgress';
import { RecentTickets } from '@/components/dashboard/RecentTickets';
import { DashboardExport } from '@/components/dashboard/DashboardExport';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Ticket, 
  AlertTriangle, 
  RefreshCw,
  Loader2,
  FileWarning,
  Clock,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

// SLA definitions in days
const SLA_DAYS: Record<string, number> = {
  incident: 5,    // INC = 5 dias
  problem: 30,    // PRB = 30 dias
  request: 60,    // RITM = 60 dias
};

const TYPE_LABELS: Record<string, string> = {
  incident: 'Incidentes (INC)',
  problem: 'Problemas (PRB)',
  request: 'Requisições (RITM)',
};

const TYPE_SHORT: Record<string, string> = {
  incident: 'INC',
  problem: 'PRB',
  request: 'RITM',
};

function calcDaysOpen(openedAt: string | null): number | null {
  if (!openedAt) return null;
  const match = openedAt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  let opened: Date;
  if (match) {
    const [, day, month, year] = match;
    opened = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    opened = new Date(openedAt);
  }
  if (isNaN(opened.getTime())) return null;
  return Math.floor((Date.now() - opened.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  const { networkId, isLoading: isAuthLoading } = useAuth();
  const { ticketsConsolidados, estatisticas } = useTicketAnalysis();
  const { correlateAllPending, isCorrelating, progress: correlationProgress } = useAutoCorrelation();
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [showWithOS, setShowWithOS] = useState(false);

  // Classify tickets by type
  const ticketsByType = useMemo(() => {
    const counts = { incident: 0, problem: 0, request: 0 };
    const slaBreaches = { incident: 0, problem: 0, request: 0 };
    
    for (const tc of ticketsConsolidados) {
      const type = tc.ticket.type || 'incident';
      if (type in counts) {
        counts[type as keyof typeof counts]++;
        
        const daysOpen = calcDaysOpen(tc.ticket.opened_at);
        const slaLimit = SLA_DAYS[type] || 5;
        if (daysOpen !== null && daysOpen > slaLimit) {
          slaBreaches[type as keyof typeof slaBreaches]++;
        }
      }
    }
    
    return { counts, slaBreaches };
  }, [ticketsConsolidados]);

  // Separate tickets: without OS vs with OS (closed)
  const { ticketsSemOS, ticketsComOSEncerrada, ticketsComOS } = useMemo(() => {
    const semOS: typeof ticketsConsolidados = [];
    const comOSEncerrada: typeof ticketsConsolidados = [];
    const comOS: typeof ticketsConsolidados = [];
    
    for (const tc of ticketsConsolidados) {
      if (!tc.osVinculada) {
        semOS.push(tc);
      } else {
        comOS.push(tc);
        // Check if OS is "closed" but ticket is still open in ServiceNow
        // Ticket is open (in ServiceNow) if it was imported (all imported tickets are "open")
        // OS is closed if there's a vdesk record
        if (tc.osVinculada && tc.severidade !== 'critical') {
          comOSEncerrada.push(tc);
        }
      }
    }
    
    return { ticketsSemOS: semOS, ticketsComOSEncerrada: comOSEncerrada, ticketsComOS: comOS };
  }, [ticketsConsolidados]);

  // Displayed tickets based on toggle
  const displayedTickets = showWithOS ? ticketsComOS : ticketsSemOS;

  const handleRefresh = async () => {
    setLastUpdate(new Date());
    try {
      toast.info('Sincronizando...', { description: 'Correlacionando tickets com VDESK', icon: '🔄' });
      const result = await correlateAllPending();
      if (result.total === 0) {
        toast.success('Atualizado!', { description: 'Nenhum ticket pendente', icon: '✨' });
      } else {
        toast.success('Correlação concluída!', { 
          description: `${result.correlated} com OS • ${result.notFound} sem OS`, icon: '🎯' 
        });
      }
    } catch (error) {
      toast.error('Erro na correlação', { 
        description: error instanceof Error ? error.message : 'Erro desconhecido' 
      });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DashboardLastSyncBadge syncedAt={lastUpdate.toISOString()} status="ok" />
        <div className="flex items-center gap-2">
          <DashboardExport estatisticas={estatisticas} tickets={displayedTickets} />
          <Button
            variant="outline" size="sm" className="gap-1.5 h-8"
            onClick={handleRefresh} disabled={isCorrelating}
          >
            {isCorrelating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isCorrelating ? 'Sincronizando...' : 'Correlacionar'}
          </Button>
        </div>
      </div>

      <CorrelationProgress progress={correlationProgress} isCorrelating={isCorrelating} />

      {/* Main KPI: Total + Sem OS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardKpiCard
          label="Total Importados"
          value={estatisticas.totalTickets}
          icon={Ticket}
          tooltipDescription="Tickets importados (abertos no ServiceNow)"
        />
        <DashboardKpiCard
          label="Sem OS"
          value={ticketsSemOS.length}
          icon={AlertTriangle}
          accent="bg-destructive"
          tooltipDescription="Tickets sem OS vinculada no VDESK"
        />
        <DashboardKpiCard
          label="Com OS"
          value={ticketsComOS.length}
          icon={CheckCircle2}
          accent="bg-[hsl(var(--chart-2))]"
          tooltipDescription="Tickets com OS encontrada no VDESK"
        />
        {ticketsComOSEncerrada.length > 0 && (
          <DashboardKpiCard
            label="Aberto c/ OS Encerrada"
            value={ticketsComOSEncerrada.length}
            icon={ShieldAlert}
            accent="bg-orange-500"
            tooltipDescription="Ticket aberto no ServiceNow mas OS já encerrada no VDESK — possível problema operacional"
          />
        )}
      </div>

      {/* INC / RITM / PRB counters with SLA alerts */}
      <div className="grid grid-cols-3 gap-3">
        {(['incident', 'problem', 'request'] as const).map(type => {
          const count = ticketsByType.counts[type];
          const breaches = ticketsByType.slaBreaches[type];
          const sla = SLA_DAYS[type];
          return (
            <Card key={type} className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{TYPE_LABELS[type]}</p>
                    <p className="text-2xl font-bold text-foreground">{count}</p>
                    <p className="text-[10px] text-muted-foreground">SLA: {sla} dias</p>
                  </div>
                  {breaches > 0 && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 border border-destructive/20">
                        <Clock className="h-3 w-3 text-destructive" />
                        <span className="text-xs font-bold text-destructive">{breaches}</span>
                      </div>
                      <span className="text-[9px] text-destructive">SLA estourado</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Toggle: Show with/without OS */}
      <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-3">
          <FileWarning className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {showWithOS ? 'Tickets com OS vinculada' : 'Tickets sem OS vinculada'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {showWithOS 
                ? `${ticketsComOS.length} tickets com OS encontrada no VDESK` 
                : `${ticketsSemOS.length} tickets aguardando vinculação de OS`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Exibir com OS</span>
          <Switch checked={showWithOS} onCheckedChange={setShowWithOS} />
        </div>
      </div>

      {/* Tickets List */}
      <RecentTickets tickets={displayedTickets.slice(0, 50)} />
    </div>
  );
}