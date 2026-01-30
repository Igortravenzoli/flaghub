import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function FusionText() {
  const [phase, setPhase] = useState<'initial' | 'merging' | 'final'>('initial');

  useEffect(() => {
    // Start merge animation after component mounts
    const timer1 = setTimeout(() => setPhase('merging'), 800);
    const timer2 = setTimeout(() => setPhase('final'), 2000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div className="h-8 flex items-center justify-center overflow-hidden">
      <div className="relative flex items-center justify-center">
        {/* Initial state: Ticket + OS */}
        <div 
          className={cn(
            "flex items-center gap-1 transition-all duration-700 ease-in-out absolute",
            phase === 'initial' && "opacity-100 scale-100",
            phase === 'merging' && "opacity-0 scale-95 blur-sm",
            phase === 'final' && "opacity-0 scale-90 blur-md"
          )}
        >
          <span className="text-lg font-semibold text-primary">Ticket</span>
          <span className="text-lg font-light text-muted-foreground mx-1">+</span>
          <span className="text-lg font-semibold text-primary">OS</span>
        </div>

        {/* Merging state: particles coming together */}
        <div 
          className={cn(
            "flex items-center transition-all duration-500 ease-out absolute",
            phase === 'initial' && "opacity-0",
            phase === 'merging' && "opacity-100",
            phase === 'final' && "opacity-0"
          )}
        >
          <span 
            className={cn(
              "text-lg font-semibold text-primary transition-all duration-500",
              phase === 'merging' && "animate-pulse"
            )}
          >
            Ticket
          </span>
          <span 
            className={cn(
              "text-lg font-semibold text-primary transition-all duration-500 -ml-1",
              phase === 'merging' && "translate-x-0 opacity-50"
            )}
          >
            s
          </span>
        </div>

        {/* Final state: Tickets */}
        <div 
          className={cn(
            "transition-all duration-700 ease-out",
            phase === 'initial' && "opacity-0 scale-110",
            phase === 'merging' && "opacity-0 scale-105",
            phase === 'final' && "opacity-100 scale-100"
          )}
        >
          <span className="text-lg font-bold bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-transparent">
            Tickets
          </span>
          <span className="ml-1 inline-block animate-pulse">✨</span>
        </div>
      </div>
    </div>
  );
}
