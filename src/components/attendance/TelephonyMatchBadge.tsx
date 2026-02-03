import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Phone, Circle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type TelephonyState = 'LIVRE' | 'EM_CHAMADA' | 'NAO_ATENDIDA' | 'PAUSA';

interface TelephonyMatchBadgeProps {
  state?: TelephonyState;
  hasMatch: boolean;
}

export function TelephonyMatchBadge({ state, hasMatch }: TelephonyMatchBadgeProps) {
  if (!hasMatch) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[10px] text-muted-foreground border-muted">
            <AlertCircle className="h-3 w-3" />
            Sem telefonia
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Sem correspondência com dados de telefonia</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (state === 'EM_CHAMADA') {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge 
            variant="outline" 
            className="gap-1 px-2 py-0.5 text-[10px] bg-purple-500/10 border-purple-500/50 text-purple-700 dark:text-purple-400"
          >
            <Phone className="h-3 w-3" />
            Em chamada (Telefonia)
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Agente em chamada ativa conforme dados de telefonia</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (state === 'LIVRE') {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge 
            variant="outline" 
            className="gap-1 px-2 py-0.5 text-[10px] bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400"
          >
            <Circle className="h-3 w-3" />
            Livre (Telefonia)
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Agente livre conforme dados de telefonia</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
