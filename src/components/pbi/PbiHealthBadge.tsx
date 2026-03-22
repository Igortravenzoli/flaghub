import { Badge } from '@/components/ui/badge';
import type { PbiHealthStatus } from '@/types/pbi';
import { HEALTH_COLORS } from '@/lib/pbiStageConfig';

interface PbiHealthBadgeProps {
  status: PbiHealthStatus | null | undefined;
  compact?: boolean;
  className?: string;
  indicatorMode?: 'default' | 'fabrica-abc';
}

const FABRICA_HEALTH_LABELS: Record<PbiHealthStatus, { compact: string; full: string }> = {
  verde: { compact: 'B', full: '(B) Verde' },
  amarelo: { compact: 'A', full: '(A) Amarelo' },
  vermelho: { compact: 'C', full: '(C) Vermelho' },
};

export function PbiHealthBadge({ status, compact = false, className, indicatorMode = 'default' }: PbiHealthBadgeProps) {
  if (!status) {
    return <Badge variant="outline" className={className}>Sem saúde</Badge>;
  }

  const theme = HEALTH_COLORS[status];
  const fabricaLabel = FABRICA_HEALTH_LABELS[status];
  const badgeLabel = indicatorMode === 'fabrica-abc'
    ? (compact ? fabricaLabel.compact : fabricaLabel.full)
    : (compact ? status.toUpperCase().slice(0, 1) : theme.label);

  return (
    <Badge className={`${theme.bg} ${theme.text} border ${theme.border} ${className || ''}`}>
      {badgeLabel}
    </Badge>
  );
}
