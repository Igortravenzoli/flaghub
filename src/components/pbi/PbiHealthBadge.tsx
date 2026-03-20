import { Badge } from '@/components/ui/badge';
import type { PbiHealthStatus } from '@/types/pbi';
import { HEALTH_COLORS } from '@/lib/pbiStageConfig';

interface PbiHealthBadgeProps {
  status: PbiHealthStatus | null | undefined;
  compact?: boolean;
  className?: string;
}

export function PbiHealthBadge({ status, compact = false, className }: PbiHealthBadgeProps) {
  if (!status) {
    return <Badge variant="outline" className={className}>Sem saúde</Badge>;
  }

  const theme = HEALTH_COLORS[status];

  return (
    <Badge className={`${theme.bg} ${theme.text} border ${theme.border} ${className || ''}`}>
      {compact ? status.toUpperCase().slice(0, 1) : theme.label}
    </Badge>
  );
}
