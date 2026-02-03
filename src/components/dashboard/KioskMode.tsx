import { useState, useEffect } from 'react';
import { StatCard } from '@/components/dashboard/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Ticket, 
  CheckCircle, 
  AlertTriangle, 
  Eye,
  Minimize2,
  Activity,
  Phone,
  Users,
  Clock,
  PhoneCall,
  UserCheck,
  Pause,
  PhoneOff,
  Settings,
  Bell,
  BellRing
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  mockAgentsTelephony,
  mockQueueTelephony,
  mockActiveAttendancesVdesk,
} from '@/data/mockAttendanceData';

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

// Limite padrão para alerta de fila
const DEFAULT_QUEUE_ALERT_THRESHOLD = 3;

export function KioskMode({ estatisticas, ticketsCriticos, lastUpdate, onExit }: KioskModeProps) {
  const [queueAlertThreshold, setQueueAlertThreshold] = useState(DEFAULT_QUEUE_ALERT_THRESHOLD);
  const [showQueueAlert, setShowQueueAlert] = useState(false);

  // Calcular estatísticas de atendimento a partir dos dados mock
  const agentesLogados = mockAgentsTelephony.length;
  const agentesEmChamada = mockAgentsTelephony.filter(a => a.state === 'EM_CHAMADA').length;
  const agentesLivres = mockAgentsTelephony.filter(a => a.state === 'LIVRE').length;
  const agentesEmPausa = mockAgentsTelephony.filter(a => a.state === 'PAUSA').length;
  const agentesNaoAtendeu = mockAgentsTelephony.filter(a => a.state === 'NAO_ATENDIDA').length;
  const clientesNaFila = mockQueueTelephony.length;
  const atendimentosAtivos = mockActiveAttendancesVdesk.length;
  
  // Verificar se fila excede o limite
  const isQueueOverThreshold = clientesNaFila >= queueAlertThreshold;

  // Efeito para controlar animação do alerta
  useEffect(() => {
    if (isQueueOverThreshold) {
      setShowQueueAlert(true);
    } else {
      setShowQueueAlert(false);
    }
  }, [isQueueOverThreshold]);
  
  // Calcular TMA médio (avgTalkTime está em segundos)
  const tmaTotal = mockAgentsTelephony.reduce((sum, a) => sum + a.avgTalkTime, 0);
  const tmaMedia = agentesLogados > 0 ? Math.round(tmaTotal / agentesLogados) : 0;
  const tmaFormatado = `${Math.floor(tmaMedia / 60)}:${String(tmaMedia % 60).padStart(2, '0')}`;

  // Total de chamadas atendidas
  const totalAtendidas = mockAgentsTelephony.reduce((sum, a) => sum + a.answeredCalls, 0);

  return (
    <div className="fixed inset-0 z-50 bg-background p-6 overflow-auto">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] bg-[hsl(var(--info))]/10 rounded-full blur-[100px]" />
        
        {/* Alerta visual de fila - efeito de borda pulsante */}
        {showQueueAlert && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 border-4 border-[hsl(var(--warning))] animate-pulse opacity-50" />
          </div>
        )}
      </div>

      {/* Banner de alerta de fila */}
      {showQueueAlert && (
        <div className={cn(
          "fixed top-0 left-0 right-0 z-50",
          "bg-gradient-to-r from-[hsl(var(--warning))] to-[hsl(var(--critical))]",
          "py-3 px-6 flex items-center justify-center gap-3",
          "animate-pulse shadow-lg"
        )}>
          <BellRing className="h-6 w-6 text-white animate-bounce" />
          <span className="text-white font-bold text-lg">
            ATENÇÃO: {clientesNaFila} cliente{clientesNaFila !== 1 ? 's' : ''} na fila de espera!
          </span>
          <span className="text-white/80 text-sm">
            (Limite: {queueAlertThreshold})
          </span>
        </div>
      )}

      <div className={cn(
        "relative z-10 max-w-[1800px] mx-auto",
        showQueueAlert && "pt-12" // Espaço para o banner
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Animated icon */}
            <div className="relative">
              <div className="absolute inset-0 bg-primary/30 rounded-xl blur-xl animate-pulse" />
              <div className="relative p-4 rounded-xl bg-gradient-to-br from-primary to-[hsl(var(--info))]">
                <Activity className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground">
                  Central de Operações
                </span>
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-2">
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--success))] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--success))]" />
                  </div>
                  <span className="text-sm text-muted-foreground">Sistema Ativo</span>
                </div>
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">
                  Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Configuração de alerta */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon"
                  className={cn(
                    "bg-card/50 border-border/50 hover:bg-primary/10 hover:border-primary/50",
                    showQueueAlert && "border-[hsl(var(--warning))] text-[hsl(var(--warning))]"
                  )}
                >
                  {showQueueAlert ? (
                    <BellRing className="h-4 w-4 animate-bounce" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Configuração de Alertas
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Defina o limite para alertas de fila de espera.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="queue-threshold">Limite de clientes na fila</Label>
                    <Input
                      id="queue-threshold"
                      type="number"
                      min={1}
                      max={20}
                      value={queueAlertThreshold}
                      onChange={(e) => setQueueAlertThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Alerta será exibido quando houver {queueAlertThreshold} ou mais clientes aguardando.
                    </p>
                  </div>
                  <div className={cn(
                    "p-3 rounded-lg text-sm",
                    isQueueOverThreshold 
                      ? "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]"
                      : "bg-muted text-muted-foreground"
                  )}>
                    <div className="flex items-center gap-2">
                      {isQueueOverThreshold ? (
                        <BellRing className="h-4 w-4" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                      <span>
                        Fila atual: <strong>{clientesNaFila}</strong> cliente{clientesNaFila !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Button 
              variant="outline" 
              size="default"
              onClick={onExit}
              className="bg-card/50 border-border/50 hover:bg-primary/10 hover:border-primary/50"
            >
              <Minimize2 className="h-4 w-4 mr-2" />
              Sair do Modo TV
            </Button>
          </div>
        </div>
        
        {/* Grid principal - 2 seções lado a lado */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Coluna Esquerda - Métricas de Tickets */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Tickets ServiceNow
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                title="Total de Tickets"
                value={estatisticas.totalTickets}
                icon={Ticket}
                className="bg-card/80 backdrop-blur-sm border-border/50"
              />
              <StatCard
                title="Tickets OK"
                value={estatisticas.ticketsOK}
                icon={CheckCircle}
                severity="success"
                className="bg-card/80 backdrop-blur-sm"
              />
              <StatCard
                title="Sem OS (Crítico)"
                value={estatisticas.ticketsSemOS}
                icon={AlertTriangle}
                severity="critical"
                className="bg-card/80 backdrop-blur-sm"
              />
              <StatCard
                title="Em Observação"
                value={estatisticas.ticketsObservacao}
                icon={Eye}
                severity="warning"
                className="bg-card/80 backdrop-blur-sm"
              />
            </div>
          </div>

          {/* Coluna Direita - Métricas de Atendimento */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Atendimento / Telefonia
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                title="Agentes Logados"
                value={agentesLogados}
                icon={Users}
                className="bg-card/80 backdrop-blur-sm border-border/50"
              />
              <StatCard
                title="Em Chamada"
                value={agentesEmChamada}
                icon={PhoneCall}
                severity="info"
                className="bg-card/80 backdrop-blur-sm"
              />
              <StatCard
                title="Livres"
                value={agentesLivres}
                icon={UserCheck}
                severity="success"
                className="bg-card/80 backdrop-blur-sm"
              />
              <StatCard
                title="Na Fila"
                value={clientesNaFila}
                icon={Clock}
                severity={clientesNaFila > 3 ? "warning" : "info"}
                className="bg-card/80 backdrop-blur-sm"
              />
            </div>
          </div>
        </div>

        {/* Segunda linha - KPIs resumidos */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          <Card className="bg-card/60 backdrop-blur-sm border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(var(--info))]/20">
                <PhoneCall className="h-5 w-5 text-[hsl(var(--info))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Atendimentos Ativos</p>
                <p className="text-xl font-bold">{atendimentosAtivos}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 backdrop-blur-sm border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(var(--success))]/20">
                <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Atendidas</p>
                <p className="text-xl font-bold">{totalAtendidas}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 backdrop-blur-sm border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(var(--warning))]/20">
                <Pause className="h-5 w-5 text-[hsl(var(--warning))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Em Pausa</p>
                <p className="text-xl font-bold">{agentesEmPausa}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 backdrop-blur-sm border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(var(--critical))]/20">
                <PhoneOff className="h-5 w-5 text-[hsl(var(--critical))]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Não Atendidas</p>
                <p className="text-xl font-bold">{agentesNaoAtendeu}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 backdrop-blur-sm border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">TMA Médio</p>
                <p className="text-xl font-bold">{tmaFormatado}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 backdrop-blur-sm border-border/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                clientesNaFila === 0 ? "bg-[hsl(var(--success))]/20" : "bg-[hsl(var(--warning))]/20"
              )}>
                <Users className={cn(
                  "h-5 w-5",
                  clientesNaFila === 0 ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"
                )} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ocupação</p>
                <p className="text-xl font-bold">
                  {agentesLogados > 0 ? Math.round((agentesEmChamada / agentesLogados) * 100) : 0}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Lista simplificada de críticos */}
        {ticketsCriticos.length > 0 && (
          <Card className={cn(
            "relative overflow-hidden mt-6",
            "bg-gradient-to-br from-[hsl(var(--critical))]/20 via-card/90 to-card/90",
            "border-[hsl(var(--critical))]/30 backdrop-blur-sm"
          )}>
            {/* Glow */}
            <div className="absolute -top-20 -right-20 w-60 h-60 bg-[hsl(var(--critical))]/20 rounded-full blur-3xl" />
            
            <CardHeader className="relative pb-2">
              <CardTitle className="text-xl flex items-center gap-3 text-[hsl(var(--critical))]">
                <div className="p-2 rounded-lg bg-[hsl(var(--critical))]/20">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                Tickets Críticos - Sem OS
                <span className="ml-auto text-2xl font-bold">
                  {ticketsCriticos.length}
                </span>
              </CardTitle>
            </CardHeader>
            
            <CardContent className="relative">
              <div className="space-y-2">
                {ticketsCriticos.slice(0, 5).map(tc => (
                  <div 
                    key={tc.ticket.number} 
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg",
                      "bg-card/60 backdrop-blur-sm border border-border/30",
                      "hover:border-[hsl(var(--critical))]/50 transition-all"
                    )}
                  >
                    <span className="font-mono text-lg font-bold text-foreground">
                      {tc.ticket.number}
                    </span>
                    <span className="text-sm text-muted-foreground flex-1 mx-6 truncate">
                      {tc.ticket.short_description || 'Sem descrição'}
                    </span>
                    <div className="flex items-center gap-2 text-[hsl(var(--critical))]">
                      <span className="text-lg font-bold">
                        {tc.horasSemOS}h
                      </span>
                      <span className="text-sm">sem OS</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {ticketsCriticos.length > 5 && (
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  +{ticketsCriticos.length - 5} tickets adicionais
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
