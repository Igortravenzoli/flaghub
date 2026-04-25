import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Phone, PhoneOff, Pause, PhoneIncoming, PhoneOutgoing, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

type AgentState = 'LIVRE' | 'EM_CHAMADA' | 'NAO_ATENDIDA' | 'PAUSA';

interface AgentStateBadgeProps {
  state: AgentState;
  timer?: string;
  showTimer?: boolean;
  size?: 'sm' | 'md';
}

const stateConfig: Record<AgentState, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
}> = {
  LIVRE: {
    label: 'Livre',
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-500/10 border-green-500/50',
    icon: Circle,
    tooltip: 'Agente disponível para receber chamadas',
  },
  EM_CHAMADA: {
    label: 'Em Chamada',
    color: 'text-purple-700 dark:text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/50',
    icon: Phone,
    tooltip: 'Agente em atendimento telefônico',
  },
  NAO_ATENDIDA: {
    label: 'Não Atendida',
    color: 'text-yellow-700 dark:text-yellow-500',
    bgColor: 'bg-yellow-500/10 border-yellow-500/50',
    icon: PhoneOff,
    tooltip: 'Chamada não atendida recentemente',
  },
  PAUSA: {
    label: 'Pausa',
    color: 'text-orange-700 dark:text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/50',
    icon: Pause,
    tooltip: 'Agente em pausa',
  },
};

export function AgentStateBadge({ state, timer, showTimer = true, size = 'md' }: AgentStateBadgeProps) {
  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 font-medium",
            config.bgColor,
            config.color,
            size === 'sm' ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
          )}
        >
          <Icon className={cn(size === 'sm' ? "h-3 w-3" : "h-3.5 w-3.5")} />
          <span>{config.label}</span>
          {showTimer && timer && (
            <span className="font-mono opacity-80">({timer})</span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{config.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function DirectionIcon({ direction }: { direction: 'inbound' | 'outbound' | 'idle' }) {
  if (direction === 'inbound') {
    return (
      <Tooltip>
        <TooltipTrigger>
          <PhoneIncoming className="h-4 w-4 text-blue-500" />
        </TooltipTrigger>
        <TooltipContent>Chamada receptiva</TooltipContent>
      </Tooltip>
    );
  }
  if (direction === 'outbound') {
    return (
      <Tooltip>
        <TooltipTrigger>
          <PhoneOutgoing className="h-4 w-4 text-green-500" />
        </TooltipTrigger>
        <TooltipContent>Chamada ativa</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <Circle className="h-4 w-4 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent>Sem chamada ativa</TooltipContent>
    </Tooltip>
  );
}
