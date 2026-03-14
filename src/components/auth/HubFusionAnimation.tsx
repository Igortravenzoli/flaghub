import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { BarChart3, Activity, PieChart, TrendingUp, Layers } from 'lucide-react';

type Phase = 'scatter' | 'orbit' | 'converge' | 'fuse' | 'reveal';

const miniCards = [
  { icon: BarChart3, angle: 0 },
  { icon: Activity, angle: 90 },
  { icon: PieChart, angle: 180 },
  { icon: TrendingUp, angle: 270 },
];

export function HubFusionAnimation() {
  const [phase, setPhase] = useState<Phase>('scatter');

  useEffect(() => {
    const seq: { p: Phase; d: number }[] = [
      { p: 'orbit', d: 300 },
      { p: 'converge', d: 1200 },
      { p: 'fuse', d: 2000 },
      { p: 'reveal', d: 2600 },
    ];
    const timers = seq.map(({ p, d }) => setTimeout(() => setPhase(p), d));
    return () => timers.forEach(clearTimeout);
  }, []);

  const orbitR = 40;
  const showCards = phase === 'orbit' || phase === 'converge';
  const showFuse = phase === 'fuse';
  const showResult = phase === 'reveal';

  return (
    <div className="h-16 flex items-center justify-center overflow-hidden my-1">
      <div className="relative w-24 h-16 flex items-center justify-center">
        {/* Mini dashboard cards orbiting */}
        {miniCards.map((card, i) => {
          const rad = (card.angle * Math.PI) / 180;
          const x = Math.cos(rad) * orbitR;
          const y = Math.sin(rad) * orbitR;
          return (
            <div
              key={i}
              className={cn(
                "absolute w-6 h-6 rounded bg-primary/20 flex items-center justify-center transition-all",
                phase === 'scatter' && "opacity-0 scale-0 duration-200",
                phase === 'orbit' && "opacity-100 scale-100 duration-500 ease-out",
                phase === 'converge' && "opacity-80 scale-75 duration-600 ease-in-out",
                (phase === 'fuse' || phase === 'reveal') && "opacity-0 scale-0 duration-300"
              )}
              style={{
                transform: phase === 'orbit'
                  ? `translate(${x}px, ${y}px)`
                  : phase === 'converge'
                  ? `translate(${x * 0.2}px, ${y * 0.2}px) scale(0.75)`
                  : 'translate(0, 0) scale(0)',
              }}
            >
              <card.icon className="h-3 w-3 text-primary" />
            </div>
          );
        })}

        {/* Fusion glow */}
        <div
          className={cn(
            "absolute w-12 h-12 rounded-full bg-primary/30 blur-xl transition-all",
            showFuse ? "opacity-100 scale-100 duration-400" : "opacity-0 scale-0 duration-200"
          )}
        />
        <div
          className={cn(
            "absolute w-16 h-16 rounded-full border border-primary/40 transition-all",
            showFuse ? "opacity-100 scale-100 duration-300 animate-ping" : "opacity-0 scale-0 duration-200"
          )}
        />

        {/* Result: HUB text */}
        <div
          className={cn(
            "absolute flex items-center gap-1.5 transition-all",
            showResult ? "opacity-100 scale-100 duration-500" : "opacity-0 scale-0 duration-200"
          )}
        >
          <Layers className="h-5 w-5 text-primary" />
          <span
            className="font-bold text-xl tracking-tight"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            KPI Hub
          </span>
        </div>

        {/* Subtle ambient */}
        <div
          className={cn(
            "absolute w-32 h-8 rounded-full bg-primary/10 blur-2xl transition-all duration-700",
            showResult ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
    </div>
  );
}
