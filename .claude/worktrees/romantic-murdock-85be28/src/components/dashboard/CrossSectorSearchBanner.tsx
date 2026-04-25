import { useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CrossSectorResult } from '@/hooks/useCrossSectorSearch';

interface Props {
  result: CrossSectorResult;
  isSearching?: boolean;
}

export function CrossSectorSearchBanner({ result, isSearching }: Props) {
  const navigate = useNavigate();

  if (isSearching) return null;
  if (!result) return null;

  const sprintLabel = result.iterationPath
    ? result.iterationPath.split('\\').pop() || result.iterationPath
    : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm animate-fade-in">
      <MapPin className="h-4 w-4 text-primary shrink-0" />
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
        <span className="font-medium text-foreground">
          PBI #{result.workItemId}
        </span>
        {result.title && (
          <span className="text-muted-foreground truncate max-w-[300px]">
            — {result.title}
          </span>
        )}
        <span className="text-muted-foreground">encontrada em</span>
        <Badge variant="secondary" className="text-xs font-semibold">
          {result.sectorLabel}
        </Badge>
        {result.state && (
          <Badge variant="outline" className="text-xs">
            {result.state}
          </Badge>
        )}
        {sprintLabel && (
          <Badge variant="outline" className="text-xs">
            {sprintLabel}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {result.webUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={() => window.open(result.webUrl!, '_blank')}
          >
            <ExternalLink className="h-3 w-3" />
            DevOps
          </Button>
        )}
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs gap-1"
          onClick={() => navigate(result.sectorPath)}
        >
          Ir para {result.sectorLabel}
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
