import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface IntegrationHealthBadgeProps {
  name: string;
  isHealthy: boolean;
  className?: string;
}

export function IntegrationHealthBadge({ name, isHealthy, className }: IntegrationHealthBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 px-2.5 py-1",
            isHealthy 
              ? "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400" 
              : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400",
            className
          )}
        >
          {isHealthy ? (
            <CheckCircle className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          <span className="text-xs font-medium">
            {name} {isHealthy ? 'OK' : 'Indisponível'}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {isHealthy 
            ? `Integração com ${name} funcionando normalmente` 
            : `Sem conexão com ${name}`}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
