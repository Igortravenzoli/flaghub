import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Phase = 'start' | 'enter' | 'meet' | 'fuse' | 'done';

export function FusionText() {
  const [phase, setPhase] = useState<Phase>('start');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('enter'), 300);
    const t2 = setTimeout(() => setPhase('meet'), 1100);
    const t3 = setTimeout(() => setPhase('fuse'), 1600);
    const t4 = setTimeout(() => setPhase('done'), 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  return (
    <div className="h-10 flex items-center justify-center overflow-hidden my-1">
      <div className="relative w-48 h-10 flex items-center justify-center">
        
        {/* Ticket - slides from left, stops before center */}
        <span
          className={cn(
            "absolute left-0 font-semibold text-lg text-primary",
            "transition-all ease-out",
            phase === 'start' && "opacity-0 -translate-x-8 duration-300",
            phase === 'enter' && "opacity-100 translate-x-6 duration-700",
            phase === 'meet' && "opacity-100 translate-x-10 duration-400",
            phase === 'fuse' && "opacity-0 translate-x-12 blur-md scale-90 duration-400",
            phase === 'done' && "opacity-0 hidden"
          )}
        >
          Ticket
        </span>

        {/* OS - slides from right, stops before center */}
        <span
          className={cn(
            "absolute right-0 font-semibold text-lg text-primary",
            "transition-all ease-out",
            phase === 'start' && "opacity-0 translate-x-8 duration-300",
            phase === 'enter' && "opacity-100 -translate-x-6 duration-700",
            phase === 'meet' && "opacity-100 -translate-x-10 duration-400",
            phase === 'fuse' && "opacity-0 -translate-x-12 blur-md scale-90 duration-400",
            phase === 'done' && "opacity-0 hidden"
          )}
        >
          OS
        </span>

        {/* Fusion glow effect - appears when they meet */}
        <div
          className={cn(
            "absolute w-20 h-10 rounded-full bg-primary/40 blur-xl",
            "transition-all ease-out",
            (phase === 'start' || phase === 'enter') && "opacity-0 scale-50 duration-300",
            phase === 'meet' && "opacity-100 scale-100 duration-300",
            phase === 'fuse' && "opacity-60 scale-125 duration-400",
            phase === 'done' && "opacity-0 scale-150 duration-500"
          )}
        />

        {/* Tickets - emerges from fusion */}
        <span
          className={cn(
            "absolute font-bold text-xl text-primary",
            "transition-all ease-out",
            (phase === 'start' || phase === 'enter') && "opacity-0 scale-50 blur-lg duration-300",
            phase === 'meet' && "opacity-0 scale-75 blur-md duration-300",
            phase === 'fuse' && "opacity-80 scale-95 blur-[1px] duration-400",
            phase === 'done' && "opacity-100 scale-100 blur-0 duration-500"
          )}
          style={{
            textShadow: phase === 'done' ? '0 0 24px hsl(var(--primary) / 0.5)' : 'none',
          }}
        >
          Tickets
        </span>
      </div>
    </div>
  );
}
