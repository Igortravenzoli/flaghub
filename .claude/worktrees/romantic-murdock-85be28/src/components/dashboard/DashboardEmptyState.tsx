import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Inbox, RefreshCw, AlertCircle } from 'lucide-react';

interface DashboardEmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onRetry?: () => void;
  variant?: 'empty' | 'error';
}

export function DashboardEmptyState({
  title,
  description,
  icon: Icon,
  onRetry,
  variant = 'empty',
}: DashboardEmptyStateProps) {
  const DefaultIcon = variant === 'error' ? AlertCircle : Inbox;
  const FinalIcon = Icon || DefaultIcon;

  return (
    <Card className="p-8 flex flex-col items-center justify-center text-center animate-fade-in">
      <div className={`p-4 rounded-full mb-4 ${variant === 'error' ? 'bg-destructive/10' : 'bg-muted'}`}>
        <FinalIcon className={`h-8 w-8 ${variant === 'error' ? 'text-destructive' : 'text-muted-foreground'}`} />
      </div>
      <h3 className="font-semibold text-foreground mb-1">
        {title || (variant === 'error' ? 'Erro ao carregar dados' : 'Nenhum dado disponível')}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        {description || (variant === 'error'
          ? 'Ocorreu um erro ao buscar os dados. Tente novamente.'
          : 'Os dados ainda não foram sincronizados ou não há registros para o período selecionado.')}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      )}
    </Card>
  );
}
