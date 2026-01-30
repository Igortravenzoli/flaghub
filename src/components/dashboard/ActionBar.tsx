import { Button } from '@/components/ui/button';
import { RefreshCw, Maximize2, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionBarProps {
  onRefresh: () => void;
  onKioskMode: () => void;
  isCorrelating: boolean;
}

export function ActionBar({ onRefresh, onKioskMode, isCorrelating }: ActionBarProps) {
  return (
    <div className="flex items-center gap-3">
      <Button 
        variant="outline" 
        size="sm"
        className={cn(
          "relative overflow-hidden group",
          "bg-card/50 border-border/50 hover:border-primary/50",
          "transition-all duration-300"
        )}
        onClick={onRefresh}
        disabled={isCorrelating}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {isCorrelating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin text-primary" />
            <span className="relative">Sincronizando...</span>
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2 group-hover:text-primary transition-colors" />
            <span className="relative">Sincronizar</span>
            <Sparkles className="h-3 w-3 ml-2 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          </>
        )}
      </Button>

      <Button 
        variant="outline" 
        size="sm"
        className={cn(
          "relative overflow-hidden group",
          "bg-card/50 border-border/50 hover:border-primary/50",
          "transition-all duration-300"
        )}
        onClick={onKioskMode}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <Maximize2 className="h-4 w-4 mr-2 group-hover:text-primary transition-colors" />
        <span className="relative">Modo TV</span>
      </Button>
    </div>
  );
}
