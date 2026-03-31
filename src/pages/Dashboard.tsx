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
import { Card, CardContent } from '@/components/ui/card';
import { 
  Ticket, 
  AlertTriangle, 
  RefreshCw,
  Loader2,
  FileWarning,
  Clock,
  CheckCircle2,
  X,
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
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [slaFilter, setSlaFilter] = useState<string | null>(null);
  const [osFilter, setOsFilter] = useState<'all' | 'semOS' | 'comOS' | null>(null);

  // Classify tickets by type
  const ticketsByType = useMemo(() => {
    const counts = { incident: 0, problem: 0, request: 0 };
    const slaBreaches = { incident: 0, problem: 0, request: 0 };
    const ticketsByTypeMap: Record<string, typeof ticketsConsolidados> = { incident: [], problem: [], request: [] };
    const slaBreachTickets: Record<string, typeof ticketsConsolidados> = { incident: [], problem: [], request: [] };
    
    for (const tc of ticketsConsolidados) {
      const type = tc.ticket.type || 'incident';
      if (type in counts) {
        counts[type as keyof typeof counts]++;
        ticketsByTypeMap[type].push(tc);
        
        const daysOpen = calcDaysOpen(tc.ticket.opened_at);
        const slaLimit = SLA_DAYS[type] || 5;
        if (daysOpen !== null && daysOpen > slaLimit) {
          slaBreaches[type as keyof typeof slaBreaches]++;
          slaBreachTickets[type].push(tc);
        }
      }
    }
    
    return { counts, slaBreaches, ticketsByTypeMap, slaBreachTickets };
  }, [ticketsConsolidados]);

  // Separate tickets: without OS vs with OS
  const { ticketsSemOS, ticketsComOS } = useMemo(() => {
    const semOS: typeof ticketsConsolidados = [];
    const comOS: typeof ticketsConsolidados = [];
    
    for (const tc of ticketsConsolidados) {
      if (!tc.osVinculada) {
        semOS.push(tc);
      } else {
        comOS.push(tc);
      }
    }
    
    return { ticketsSemOS: semOS, ticketsComOS: comOS };
  }, [ticketsConsolidados]);

  // Displayed tickets based on toggle + type/sla/os filter
  const displayedTickets = useMemo(() => {
    if (slaFilter) {
      return ticketsByType.slaBreachTickets[slaFilter] || [];
    }
    if (typeFilter) {
      return ticketsByType.ticketsByTypeMap[typeFilter] || [];
    }
    if (osFilter === 'all') return ticketsConsolidados;
    if (osFilter === 'semOS') return ticketsSemOS;
    if (osFilter === 'comOS') return ticketsComOS;
    return showWithOS ? ticketsComOS : ticketsSemOS;
  }, [showWithOS, ticketsComOS, ticketsSemOS, typeFilter, slaFilter, ticketsByType, osFilter, ticketsConsolidados]);

  const activeFilterLabel = useMemo(() => {
    if (slaFilter) return `SLA Estourado — ${TYPE_LABELS[slaFilter]}`;
    if (typeFilter) return TYPE_LABELS[typeFilter];
    if (osFilter === 'all') return 'Todos os Tickets';
    if (osFilter === 'semOS') return 'Tickets Sem OS';
    if (osFilter === 'comOS') return 'Tickets Com OS';
    return null;
  }, [slaFilter, typeFilter, osFilter]);

  const handleOsFilterClick = (filter: 'all' | 'semOS' | 'comOS') => {
    setTypeFilter(null);
    setSlaFilter(null);
    setOsFilter(prev => prev === filter ? null : filter);
  };

  const handleTypeClick = (type: string) => {
    setSlaFilter(null);
    setOsFilter(null);
    setTypeFilter(prev => prev === type ? null : type);
  };

  const handleSlaClick = (type: string) => {
    setTypeFilter(null);
    setOsFilter(null);
    setSlaFilter(prev => prev === type ? null : type);
  };

  const clearFilters = () => {
    setTypeFilter(null);
    setSlaFilter(null);
  };

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

      {/* Main KPI: Total + Sem OS + Com OS */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
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
      </div>

      {/* INC / RITM / PRB counters with SLA alerts — clickable */}
      <div className="grid grid-cols-3 gap-3">
        {(['incident', 'problem', 'request'] as const).map(type => {
          const count = ticketsByType.counts[type];
          const breaches = ticketsByType.slaBreaches[type];
          const sla = SLA_DAYS[type];
          const isTypeActive = typeFilter === type;
          const isSlaActive = slaFilter === type;
          return (
            <Card
              key={type}
              className={`relative overflow-hidden cursor-pointer transition-all hover:shadow-md ${isTypeActive ? 'ring-2 ring-primary' : ''}`}
              onClick={() => handleTypeClick(type)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">{TYPE_LABELS[type]}</p>
                    <p className="text-2xl font-bold text-foreground">{count}</p>
                    <p className="text-[10px] text-muted-foreground">SLA: {sla} dias</p>
                  </div>
                  {breaches > 0 && (
                    <button
                      className={`flex flex-col items-center gap-1 transition-all ${isSlaActive ? 'scale-110' : 'hover:scale-105'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSlaClick(type);
                      }}
                    >
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-md border ${isSlaActive ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-destructive/10 border-destructive/20'}`}>
                        <Clock className={`h-3 w-3 ${isSlaActive ? 'text-destructive-foreground' : 'text-destructive'}`} />
                        <span className={`text-xs font-bold ${isSlaActive ? 'text-destructive-foreground' : 'text-destructive'}`}>{breaches}</span>
                      </div>
                      <span className="text-[9px] text-destructive">SLA estourado</span>
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Active filter indicator */}
      {activeFilterLabel && (
        <div className="flex items-center justify-between bg-primary/10 rounded-lg px-4 py-2.5 border border-primary/20">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs">{activeFilterLabel}</Badge>
            <span className="text-xs text-muted-foreground">{displayedTickets.length} ticket(s)</span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearFilters}>
            <X className="h-3 w-3" /> Limpar filtro
          </Button>
        </div>
      )}

      {/* Toggle: Show with/without OS (hidden when type/sla filter active) */}
      {!activeFilterLabel && (
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
      )}

      {/* Tickets List */}
      <RecentTickets tickets={displayedTickets.slice(0, 50)} />
    </div>
  );
}
