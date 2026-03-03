import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface ConfidentialGuardProps {
  hasPermission: boolean;
  isIpAllowed: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps confidential content.
 * - No permission → renders nothing.
 * - Has permission but IP blocked → dimmed card with lock.
 * - Has permission + IP OK → renders children.
 */
export function ConfidentialGuard({ hasPermission, isIpAllowed, children, className }: ConfidentialGuardProps) {
  if (!hasPermission) return null;

  if (!isIpAllowed) {
    return (
      <Card className={`relative p-6 opacity-50 pointer-events-none select-none ${className ?? ''}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-card/80 backdrop-blur-sm rounded-lg">
          <Lock className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-muted-foreground">Bloqueado: Origem não autorizada</p>
        </div>
        <div className="blur-sm">{children}</div>
      </Card>
    );
  }

  return <>{children}</>;
}
