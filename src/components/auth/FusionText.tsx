import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Phase = 'start' | 'moving' | 'fusing' | 'done';

export function FusionText() {
  const [phase, setPhase] = useState<Phase>('start');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('moving'), 400);
    const t2 = setTimeout(() => setPhase('fusing'), 1400);
    const t3 = setTimeout(() => setPhase('done'), 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <div className="h-10 flex items-center justify-center overflow-hidden my-1">
      <div className="relative w-40 h-10 flex items-center justify-center">
        
        {/* Ticket - from left */}
        <span
          className={cn(
            "absolute font-semibold text-lg text-primary",
            "transition-all ease-[cubic-bezier(0.4,0,0.2,1)]",
            phase === 'start' && "opacity-0 -translate-x-12 duration-500",
            phase === 'moving' && "opacity-100 translate-x-0 duration-700",
            phase === 'fusing' && "opacity-0 translate-x-4 blur-sm scale-95 duration-500",
            phase === 'done' && "opacity-0 translate-x-4 blur-md duration-300"
          )}
        >
          Ticket
        </span>

        {/* OS - from right */}
        <span
          className={cn(
            "absolute font-semibold text-lg text-primary",
            "transition-all ease-[cubic-bezier(0.4,0,0.2,1)]",
            phase === 'start' && "opacity-0 translate-x-12 duration-500",
            phase === 'moving' && "opacity-100 translate-x-0 duration-700",
            phase === 'fusing' && "opacity-0 -translate-x-4 blur-sm scale-95 duration-500",
            phase === 'done' && "opacity-0 -translate-x-4 blur-md duration-300"
          )}
        >
          OS
        </span>

        {/* Fusion glow */}
        <div
          className={cn(
            "absolute w-16 h-16 rounded-full bg-primary/30 blur-2xl",
            "transition-all ease-out",
            phase === 'start' && "opacity-0 scale-0 duration-300",
            phase === 'moving' && "opacity-0 scale-0 duration-300",
            phase === 'fusing' && "opacity-100 scale-100 duration-400",
            phase === 'done' && "opacity-0 scale-150 duration-500"
          )}
        />

        {/* Tickets - result */}
        <span
          className={cn(
            "absolute font-bold text-xl text-primary",
            "transition-all ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            phase === 'start' && "opacity-0 scale-0 blur-md duration-300",
            phase === 'moving' && "opacity-0 scale-0 blur-md duration-300",
            phase === 'fusing' && "opacity-50 scale-90 blur-[2px] duration-400",
            phase === 'done' && "opacity-100 scale-100 blur-0 duration-600"
          )}
          style={{
            textShadow: phase === 'done' ? '0 0 20px hsl(var(--primary) / 0.4)' : 'none',
          }}
        >
          Tickets
        </span>
      </div>
    </div>
  );
}
