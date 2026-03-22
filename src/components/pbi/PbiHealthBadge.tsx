import { Badge } from '@/components/ui/badge';
import type { PbiHealthStatus } from '@/types/pbi';
import { HEALTH_COLORS } from '@/lib/pbiStageConfig';

interface PbiHealthBadgeProps {
  status: PbiHealthStatus | null | undefined;
  compact?: boolean;
  className?: string;
  indicatorMode?: 'default' | 'fabrica-abc';
}

export function PbiHealthBadge({ status, compact = false, className, indicatorMode = 'default' }: PbiHealthBadgeProps) {
  if (!status) {
    return <Badge variant="outline" className={className}>Sem saúde</Badge>;
  }

  const theme = HEALTH_COLORS[status];
  const badgeLabel = compact
    ? theme.icon
    : `${theme.icon} ${theme.label}`;

  return (
    <Badge className={`${theme.bg} ${theme.text} border ${theme.border} ${className || ''}`}>
      {badgeLabel}
    </Badge>
  );
}
