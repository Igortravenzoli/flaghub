import { useContext, useEffect, useState } from 'react';
import { ArrowRight, Loader2, BarChart3, Activity, PieChart, TrendingUp, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// Animated dashboard card that flies toward the center hub
function DashCard({ icon: Icon, label, delay, angle }: { icon: React.ElementType; label: string; delay: number; angle: number }) {
  const [phase, setPhase] = useState<'orbit' | 'converge' | 'fused'>('orbit');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('converge'), 1200 + delay);
    const t2 = setTimeout(() => setPhase('fused'), 2200 + delay);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [delay]);

  const rad = (angle * Math.PI) / 180;
  const orbitR = 120;
  const x = Math.cos(rad) * orbitR;
  const y = Math.sin(rad) * orbitR;

  return (
    <div
      className={cn(
        "absolute flex flex-col items-center gap-1 transition-all",
        phase === 'orbit' && "opacity-100 duration-700 ease-out",
        phase === 'converge' && "opacity-80 duration-700 ease-in-out scale-75",
        phase === 'fused' && "opacity-0 scale-0 duration-500"
      )}
      style={{
        transform: phase === 'orbit'
          ? `translate(${x}px, ${y}px)`
          : phase === 'converge'
          ? `translate(${x * 0.15}px, ${y * 0.15}px) scale(0.75)`
          : 'translate(0, 0) scale(0)',
      }}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center backdrop-blur-sm">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <span className="text-[10px] font-medium text-primary/80 whitespace-nowrap">{label}</span>
    </div>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const authCtx = useContext(AuthContext);
  const [fallbackLoading, setFallbackLoading] = useState(!authCtx);
  const [showHub, setShowHub] = useState(false);
  const [showContent, setShowContent] = useState(false);

  // Fallback: if AuthProvider isn't available, check session directly
  useEffect(() => {
    if (authCtx) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate('/home', { replace: true });
      } else {
        setFallbackLoading(false);
      }
    });
  }, [authCtx, navigate]);

  const isAuthenticated = authCtx?.isAuthenticated ?? false;
  const isLoading = authCtx?.isLoading ?? fallbackLoading;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/home', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    const t1 = setTimeout(() => setShowHub(true), 2800);
    const t2 = setTimeout(() => setShowContent(true), 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--sidebar-background))] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const dashCards = [
    { icon: BarChart3, label: 'Comercial', angle: 0 },
    { icon: Activity, label: 'Helpdesk', angle: 72 },
    { icon: PieChart, label: 'Qualidade', angle: 144 },
    { icon: TrendingUp, label: 'Fábrica', angle: 216 },
    { icon: Layers, label: 'Infra', angle: 288 },
  ];

  return (
    <div className="min-h-screen bg-[hsl(var(--sidebar-background))] flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Animation area */}
      <div className="relative w-80 h-80 flex items-center justify-center mb-8">
        {/* Orbiting dashboard cards */}
        {dashCards.map((card, i) => (
          <DashCard key={card.label} {...card} delay={i * 120} />
        ))}

        {/* Fusion ring */}
        <div
          className={cn(
            "absolute w-48 h-48 rounded-full border-2 border-primary/30 transition-all",
            showHub ? "opacity-0 scale-150 duration-700" : "opacity-40 scale-100 duration-500 animate-ping"
          )}
          style={{ transitionDelay: '2s' }}
        />

        {/* Inner glow */}
        <div
          className={cn(
            "absolute w-32 h-32 rounded-full bg-primary/20 blur-3xl transition-all duration-700",
            showHub ? "opacity-100 scale-100" : "opacity-0 scale-50"
          )}
        />

        {/* Central HUB icon */}
        <div
          className={cn(
            "relative z-10 flex flex-col items-center gap-2 transition-all duration-700",
            showHub ? "opacity-100 scale-100" : "opacity-0 scale-50"
          )}
        >
          <div className="w-20 h-20 rounded-2xl bg-primary shadow-lg shadow-primary/40 flex items-center justify-center">
            <Layers className="h-10 w-10 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-primary tracking-tight">HUB</span>
        </div>
      </div>

      {/* Text content - appears after fusion */}
      <div
        className={cn(
          "text-center space-y-6 max-w-lg transition-all duration-700",
          showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        )}
      >
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-primary tracking-tight">FLAG Hub</h1>
          <p className="text-lg text-sidebar-foreground/60">
            Central de KPIs e Dashboards Setoriais
          </p>
          <p className="text-sm text-sidebar-foreground/40">
            Todas as métricas da operação em um único lugar
          </p>
        </div>

        <Button
          onClick={() => navigate('/login')}
          size="lg"
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-lg rounded-xl shadow-lg shadow-primary/30 transition-all hover:scale-105"
        >
          Acessar o Hub
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>

        <p className="text-xs text-sidebar-foreground/30 pt-4">
          FLAG Hub • KPIs em tempo real
        </p>
      </div>
    </div>
  );
}
