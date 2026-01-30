import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Ticket, 
  CheckCircle, 
  AlertTriangle, 
  Eye,
  Monitor,
  Minimize2,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface KioskModeProps {
  estatisticas: {
    totalTickets: number;
    ticketsOK: number;
    ticketsSemOS: number;
    ticketsObservacao: number;
  };
  ticketsCriticos: any[];
  lastUpdate: Date;
  onExit: () => void;
}

export function KioskMode({ estatisticas, ticketsCriticos, lastUpdate, onExit }: KioskModeProps) {
  return (
    <div className="fixed inset-0 z-50 bg-background p-8 overflow-auto">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] bg-[hsl(var(--info))]/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-6">
            {/* Animated icon */}
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 rounded-2xl blur-xl animate-pulse" />
              <div className="relative p-5 rounded-2xl bg-gradient-to-br from-primary to-[hsl(var(--info))]">
                <Activity className="h-12 w-12 text-primary-foreground" />
              </div>
            </div>
            
            <div>
              <h1 className="text-5xl font-bold tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground">
                  Central de Operações
                </span>
              </h1>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--success))] opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[hsl(var(--success))]" />
                  </div>
                  <span className="text-lg text-muted-foreground">Sistema Ativo</span>
                </div>
                <span className="text-lg text-muted-foreground">•</span>
                <span className="text-lg text-muted-foreground">
                  Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
                </span>
              </div>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            size="lg"
            onClick={onExit}
            className="bg-card/50 border-border/50 hover:bg-primary/10 hover:border-primary/50"
          >
            <Minimize2 className="h-5 w-5 mr-2" />
            Sair do Modo TV
          </Button>
        </div>
        
        {/* Cards grandes para TV */}
        <div className="grid grid-cols-4 gap-6 mb-10">
          <StatCard
            title="Total de Tickets"
            value={estatisticas.totalTickets}
            icon={Ticket}
            className="text-2xl bg-card/80 backdrop-blur-sm border-border/50"
          />
          <StatCard
            title="Tickets OK"
            value={estatisticas.ticketsOK}
            icon={CheckCircle}
            severity="success"
            className="text-2xl bg-card/80 backdrop-blur-sm"
          />
          <StatCard
            title="Sem OS (Crítico)"
            value={estatisticas.ticketsSemOS}
            icon={AlertTriangle}
            severity="critical"
            className="text-2xl bg-card/80 backdrop-blur-sm"
          />
          <StatCard
            title="Em Observação"
            value={estatisticas.ticketsObservacao}
            icon={Eye}
            severity="warning"
            className="text-2xl bg-card/80 backdrop-blur-sm"
          />
        </div>
        
        {/* Lista simplificada de críticos */}
        {ticketsCriticos.length > 0 && (
          <Card className={cn(
            "relative overflow-hidden",
            "bg-gradient-to-br from-[hsl(var(--critical))]/20 via-card/90 to-card/90",
            "border-[hsl(var(--critical))]/30 backdrop-blur-sm"
          )}>
            {/* Glow */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-[hsl(var(--critical))]/20 rounded-full blur-3xl" />
            
            <CardHeader className="relative pb-2">
              <CardTitle className="text-3xl flex items-center gap-4 text-[hsl(var(--critical))]">
                <div className="p-3 rounded-xl bg-[hsl(var(--critical))]/20">
                  <AlertTriangle className="h-8 w-8" />
                </div>
                Tickets Críticos - Sem OS
                <span className="ml-auto text-4xl font-bold">
                  {ticketsCriticos.length}
                </span>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="relative">
              <div className="space-y-3">
                {ticketsCriticos.slice(0, 6).map(tc => (
                  <div 
                    key={tc.ticket.number} 
                    className={cn(
                      "flex items-center justify-between p-5 rounded-xl",
                      "bg-card/60 backdrop-blur-sm border border-border/30",
                      "hover:border-[hsl(var(--critical))]/50 transition-all"
                    )}
                  >
                    <span className="font-mono text-2xl font-bold text-foreground">
                      {tc.ticket.number}
                    </span>
                    <span className="text-xl text-muted-foreground flex-1 mx-8 truncate">
                      {tc.ticket.short_description || 'Sem descrição'}
                    </span>
                    <div className="flex items-center gap-2 text-[hsl(var(--critical))]">
                      <span className="text-2xl font-bold">
                        {tc.horasSemOS}h
                      </span>
                      <span className="text-lg">sem OS</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {ticketsCriticos.length > 6 && (
                <div className="mt-6 text-center text-xl text-muted-foreground">
                  +{ticketsCriticos.length - 6} tickets adicionais
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
