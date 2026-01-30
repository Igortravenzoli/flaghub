import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Link2, Database, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CorrelationProgressProps {
  progress: number;
  isCorrelating: boolean;
}

export function CorrelationProgress({ progress, isCorrelating }: CorrelationProgressProps) {
  if (!isCorrelating) return null;

  return (
    <Card className={cn(
      "relative overflow-hidden",
      "bg-gradient-to-r from-primary/10 via-card to-card",
      "border-primary/30"
    )}>
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.1),transparent)] animate-[shimmer_2s_infinite]" 
          style={{ backgroundSize: '200% 100%' }} 
        />
      </div>

      <CardContent className="relative py-4">
        <div className="flex items-center gap-4">
          {/* Animated icon */}
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-md animate-pulse" />
            <div className="relative p-2 rounded-full bg-primary/20">
              <Link2 className="h-5 w-5 text-primary animate-pulse" />
            </div>
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Correlacionando tickets com VDESK...
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary">{progress}%</span>
                {progress === 100 && (
                  <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
                )}
              </div>
            </div>
            
            <div className="relative">
              <Progress 
                value={progress} 
                className="h-2 bg-muted/50"
              />
              {/* Glow on progress */}
              <div 
                className="absolute top-0 h-2 bg-primary/50 blur-sm rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
