import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type AnimationPhase = 'idle' | 'ticket-enter' | 'os-enter' | 'approaching' | 'colliding' | 'fusing' | 'complete';

export function FusionText() {
  const [phase, setPhase] = useState<AnimationPhase>('idle');

  useEffect(() => {
    const timings: { phase: AnimationPhase; delay: number }[] = [
      { phase: 'ticket-enter', delay: 300 },
      { phase: 'os-enter', delay: 900 },
      { phase: 'approaching', delay: 1600 },
      { phase: 'colliding', delay: 2400 },
      { phase: 'fusing', delay: 2800 },
      { phase: 'complete', delay: 3400 },
    ];

    const timers = timings.map(({ phase, delay }) =>
      setTimeout(() => setPhase(phase), delay)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="h-12 flex items-center justify-center overflow-hidden my-2">
      <div className="relative w-48 h-12 flex items-center justify-center">
        
        {/* TICKET - enters from left */}
        <span
          className={cn(
            "absolute font-bold text-xl tracking-tight transition-all duration-500 ease-out",
            // Initial: off-screen left
            phase === 'idle' && "opacity-0 -translate-x-16",
            // Enter: slide to left position
            phase === 'ticket-enter' && "opacity-100 -translate-x-8 text-primary",
            // Wait for OS
            phase === 'os-enter' && "opacity-100 -translate-x-8 text-primary",
            // Approach: move toward center
            phase === 'approaching' && "opacity-100 -translate-x-2 text-primary",
            // Collide: meet at center with glow
            phase === 'colliding' && "opacity-100 translate-x-0 text-primary scale-110",
            // Fusing: fade out
            phase === 'fusing' && "opacity-0 translate-x-4 blur-sm scale-95",
            // Complete: hidden
            phase === 'complete' && "opacity-0 hidden"
          )}
          style={{
            textShadow: phase === 'colliding' ? '0 0 20px hsl(var(--primary))' : 'none',
          }}
        >
          Ticket
        </span>

        {/* OS - enters from right */}
        <span
          className={cn(
            "absolute font-bold text-xl tracking-tight transition-all duration-500 ease-out",
            // Initial: hidden
            phase === 'idle' && "opacity-0 translate-x-16",
            phase === 'ticket-enter' && "opacity-0 translate-x-16",
            // Enter: slide to right position
            phase === 'os-enter' && "opacity-100 translate-x-10 text-primary",
            // Approach: move toward center
            phase === 'approaching' && "opacity-100 translate-x-4 text-primary",
            // Collide: meet at center with glow
            phase === 'colliding' && "opacity-100 translate-x-0 text-primary scale-110",
            // Fusing: fade out
            phase === 'fusing' && "opacity-0 -translate-x-4 blur-sm scale-95",
            // Complete: hidden
            phase === 'complete' && "opacity-0 hidden"
          )}
          style={{
            textShadow: phase === 'colliding' ? '0 0 20px hsl(var(--primary))' : 'none',
          }}
        >
          OS
        </span>

        {/* Plus sign - appears between them */}
        <span
          className={cn(
            "absolute font-light text-lg text-muted-foreground transition-all duration-300 ease-out",
            phase === 'idle' && "opacity-0 scale-0",
            phase === 'ticket-enter' && "opacity-0 scale-0",
            phase === 'os-enter' && "opacity-100 scale-100",
            phase === 'approaching' && "opacity-60 scale-90",
            phase === 'colliding' && "opacity-0 scale-0 rotate-180",
            phase === 'fusing' && "opacity-0 scale-0",
            phase === 'complete' && "opacity-0 hidden"
          )}
        >
          +
        </span>

        {/* Collision burst effect */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-all duration-300",
            phase === 'colliding' && "opacity-100",
            phase !== 'colliding' && "opacity-0"
          )}
        >
          <div 
            className={cn(
              "w-24 h-24 rounded-full bg-primary/20 blur-xl transition-all duration-500",
              phase === 'colliding' && "scale-100 opacity-100",
              phase === 'fusing' && "scale-150 opacity-0",
              (phase !== 'colliding' && phase !== 'fusing') && "scale-0 opacity-0"
            )}
          />
        </div>

        {/* TICKETS - final result */}
        <span
          className={cn(
            "absolute font-bold text-2xl tracking-tight transition-all duration-700 ease-out",
            // Hidden during animation
            (phase === 'idle' || phase === 'ticket-enter' || phase === 'os-enter' || phase === 'approaching') && 
              "opacity-0 scale-0 blur-md",
            // Start appearing during collision
            phase === 'colliding' && "opacity-0 scale-50 blur-sm",
            // Emerge during fusion
            phase === 'fusing' && "opacity-70 scale-90 blur-[1px] text-primary",
            // Complete: fully visible with gradient
            phase === 'complete' && "opacity-100 scale-100 blur-0"
          )}
          style={{
            background: phase === 'complete' ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))' : undefined,
            WebkitBackgroundClip: phase === 'complete' ? 'text' : undefined,
            WebkitTextFillColor: phase === 'complete' ? 'transparent' : undefined,
            textShadow: phase === 'complete' ? '0 0 30px hsl(var(--primary) / 0.3)' : 'none',
          }}
        >
          Tickets
        </span>

        {/* Sparkle effects on complete */}
        {phase === 'complete' && (
          <>
            <span className="absolute -top-1 -right-2 text-xs animate-pulse delay-100">✨</span>
            <span className="absolute -bottom-1 -left-2 text-xs animate-pulse delay-300">✨</span>
          </>
        )}
      </div>
    </div>
  );
}
