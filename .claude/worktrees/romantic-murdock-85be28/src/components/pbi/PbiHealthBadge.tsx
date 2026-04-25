import { Badge } from '@/components/ui/badge';
import type { PbiHealthStatus } from '@/types/pbi';
import { HEALTH_COLORS } from '@/lib/pbiStageConfig';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

interface PbiHealthBadgeProps {
  status: PbiHealthStatus | null | undefined;
  compact?: boolean;
  className?: string;
  indicatorMode?: 'default' | 'fabrica-abc';
}

const HEALTH_ICONS: Record<PbiHealthStatus, React.ComponentType<{ className?: string }>> = {
  verde: ShieldCheck,
  amarelo: AlertTriangle,
  vermelho: AlertTriangle,
};

export function PbiHealthBadge({ status, compact = false, className, indicatorMode = 'default' }: PbiHealthBadgeProps) {
  if (!status) {
    return <Badge variant="outline" className={className}>Sem saúde</Badge>;
  }

  const theme = HEALTH_COLORS[status];
  const Icon = HEALTH_ICONS[status];

  return (
    <Badge className={`${theme.bg} ${theme.text} border ${theme.border} gap-1.5 ${className || ''}`}>
      <Icon className="h-3.5 w-3.5" />
      {!compact && <span>{theme.label}</span>}
    </Badge>
  );
}
