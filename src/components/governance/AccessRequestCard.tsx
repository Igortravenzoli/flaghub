import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, CheckCircle, Clock } from 'lucide-react';
import type { HubArea } from '@/hooks/useHubAreas';

interface AccessRequestCardProps {
  area: HubArea;
  isPending: boolean;
  onRequest: (areaId: string) => void;
  isRequesting: boolean;
}

export function AccessRequestCard({ area, isPending, onRequest, isRequesting }: AccessRequestCardProps) {
  return (
    <Card className="p-5 flex items-center justify-between gap-4">
      <div>
        <h3 className="font-semibold text-foreground">{area.name}</h3>
        <p className="text-xs text-muted-foreground">Área: {area.key}</p>
      </div>
      {isPending ? (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" /> Pendente
        </Badge>
      ) : (
        <Button size="sm" onClick={() => onRequest(area.id)} disabled={isRequesting} className="gap-1">
          <Send className="h-3 w-3" /> Solicitar Acesso
        </Button>
      )}
    </Card>
  );
}
