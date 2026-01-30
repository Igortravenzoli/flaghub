import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Phase = 'hidden' | 'ticket-in' | 'os-in' | 'approach' | 'fusion' | 'reveal' | 'complete';

export function FusionText() {
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
    const sequence: { phase: Phase; delay: number }[] = [
      { phase: 'ticket-in', delay: 200 },
      { phase: 'os-in', delay: 700 },
      { phase: 'approach', delay: 1300 },
      { phase: 'fusion', delay: 1900 },
      { phase: 'reveal', delay: 2300 },
      { phase: 'complete', delay: 2800 },
    ];

    const timers = sequence.map(({ phase, delay }) =>
      setTimeout(() => setPhase(phase), delay)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  const showWords = !['fusion', 'reveal', 'complete'].includes(phase);
  const showFusion = ['fusion', 'reveal'].includes(phase);
  const showResult = ['reveal', 'complete'].includes(phase);

  return (
    <div className="h-14 flex items-center justify-center overflow-hidden my-2">
      <div className="relative flex items-center justify-center">
        
        {/* Container for the two words */}
        <div className="relative flex items-center gap-2">
          {/* Ticket */}
          <span
            className={cn(
              "font-semibold text-xl tracking-tight transition-all",
              phase === 'hidden' && "opacity-0 -translate-x-6 blur-sm duration-300",
              phase === 'ticket-in' && "opacity-100 translate-x-0 blur-0 text-primary duration-500 ease-out",
              phase === 'os-in' && "opacity-100 translate-x-0 text-primary duration-300",
              phase === 'approach' && "opacity-100 translate-x-3 text-primary duration-500 ease-in-out",
              phase === 'fusion' && "opacity-0 translate-x-6 blur-md scale-90 duration-300",
              (phase === 'reveal' || phase === 'complete') && "opacity-0 hidden"
            )}
            style={{
              textShadow: phase === 'approach' ? '0 0 12px hsl(var(--primary) / 0.6)' : 'none',
            }}
          >
            Ticket
          </span>

          {/* OS */}
          <span
            className={cn(
              "font-semibold text-xl tracking-tight transition-all",
              phase === 'hidden' && "opacity-0 translate-x-6 blur-sm duration-300",
              phase === 'ticket-in' && "opacity-0 translate-x-6 blur-sm duration-300",
              phase === 'os-in' && "opacity-100 translate-x-0 blur-0 text-primary duration-500 ease-out",
              phase === 'approach' && "opacity-100 -translate-x-3 text-primary duration-500 ease-in-out",
              phase === 'fusion' && "opacity-0 -translate-x-6 blur-md scale-90 duration-300",
              (phase === 'reveal' || phase === 'complete') && "opacity-0 hidden"
            )}
            style={{
              textShadow: phase === 'approach' ? '0 0 12px hsl(var(--primary) / 0.6)' : 'none',
            }}
          >
            OS
          </span>
        </div>

        {/* Fusion energy ring */}
        <div
          className={cn(
            "absolute w-32 h-32 rounded-full border-2 border-primary/40 transition-all",
            !showFusion && "opacity-0 scale-0 duration-200",
            phase === 'fusion' && "opacity-100 scale-100 duration-300 animate-ping",
            phase === 'reveal' && "opacity-0 scale-150 duration-500"
          )}
        />

        {/* Fusion core glow */}
        <div
          className={cn(
            "absolute w-24 h-24 rounded-full transition-all",
            "bg-gradient-to-r from-primary/50 via-primary/30 to-primary/50 blur-2xl",
            !showFusion && "opacity-0 scale-0 duration-200",
            phase === 'fusion' && "opacity-100 scale-100 duration-400",
            phase === 'reveal' && "opacity-0 scale-200 duration-600"
          )}
        />

        {/* Inner fusion spark */}
        <div
          className={cn(
            "absolute w-8 h-8 rounded-full bg-primary transition-all blur-md",
            !showFusion && "opacity-0 scale-0 duration-200",
            phase === 'fusion' && "opacity-100 scale-100 duration-200",
            phase === 'reveal' && "opacity-0 scale-300 duration-400"
          )}
        />

        {/* Result: Tickets */}
        <span
          className={cn(
            "absolute font-bold text-2xl tracking-tight transition-all",
            !showResult && "opacity-0 scale-0 blur-xl duration-200",
            phase === 'reveal' && "opacity-70 scale-95 blur-[2px] text-primary duration-400",
            phase === 'complete' && "opacity-100 scale-100 blur-0 duration-500"
          )}
          style={{
            background: phase === 'complete' 
              ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))' 
              : undefined,
            WebkitBackgroundClip: phase === 'complete' ? 'text' : undefined,
            WebkitTextFillColor: phase === 'complete' ? 'transparent' : undefined,
            textShadow: phase === 'complete' ? '0 0 30px hsl(var(--primary) / 0.4)' : 'none',
          }}
        >
          Tickets
        </span>

        {/* Subtle ambient glow on complete */}
        <div
          className={cn(
            "absolute w-40 h-12 rounded-full bg-primary/10 blur-3xl transition-all duration-700",
            phase === 'complete' ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
    </div>
  );
}
