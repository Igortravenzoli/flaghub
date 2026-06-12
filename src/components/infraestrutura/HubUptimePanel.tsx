import { useHubUptime, fmtIdade, HubIntegracao, IntegracaoStatus } from '@/hooks/useHubUptime';
import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GitBranch, Headphones, Timer, FileText, Database, Zap, MessageSquare,
  TrendingUp, Activity, Hexagon,
} from 'lucide-react';

// ── HubUpTime — mapa vivo do ecossistema FlagHub ──────────────────────
// FlagHub ao centro, integrações orbitando com estado real (up/warn/down/off).
// Conexões ativas têm fluxo animado; nós online "respiram" em neon discreto.

const ICONES: Record<string, typeof GitBranch> = {
  devops: GitBranch,
  vdesk: Headphones,
  timelog: Timer,
  sharepoint: FileText,
  postgres: Database,
  edge: Zap,
  teams: MessageSquare,
  pipedrive: TrendingUp,
};

const COR: Record<IntegracaoStatus, string> = {
  up: '#34d399',    // emerald
  warn: '#fbbf24',  // amber
  down: '#f87171',  // red
  off: '#475569',   // slate
};

const STATUS_LABEL: Record<IntegracaoStatus, string> = {
  up: 'online', warn: 'instável', down: 'sem sinal', off: 'inativa',
};

function minutos(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 60000);
}

function NodeCard({ integ, delay }: { integ: HubIntegracao; delay: number }) {
  const Icon = ICONES[integ.key] ?? Activity;
  const cor = COR[integ.status];
  const isOff = integ.status === 'off';
  const isUp = integ.status === 'up';
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
      style={{ left: `${integ.x}%`, top: `${integ.y}%` }}
    >
      <div
        className={`w-[150px] rounded-xl border px-3 py-2 backdrop-blur-sm transition-all ${isOff ? 'opacity-40 grayscale border-dashed' : ''}`}
        style={{
          background: 'rgba(10, 16, 32, 0.85)',
          borderColor: `${cor}55`,
          animation: isUp ? `hubNeon 3.6s ease-in-out ${delay}s infinite` : integ.status === 'down' ? 'hubDown 1.6s ease-in-out infinite' : undefined,
          ['--neon' as string]: cor,
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1 rounded-md" style={{ background: `${cor}1f` }}>
            <Icon className="h-3.5 w-3.5" style={{ color: cor }} />
          </div>
          <span className="text-[11px] font-semibold text-slate-100 leading-tight">{integ.label}</span>
        </div>
        <p className="text-[9.5px] text-slate-400 leading-tight mb-1.5">{integ.papel}</p>
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: cor, boxShadow: isUp ? `0 0 6px ${cor}` : undefined, animation: isUp ? `hubDot 2.4s ease-in-out ${delay}s infinite` : undefined }}
          />
          <span className="text-[9.5px] font-medium" style={{ color: cor }}>
            {STATUS_LABEL[integ.status]}
            {integ.lastBeat && integ.status !== 'off' ? ` · ${fmtIdade(minutos(integ.lastBeat))}` : ''}
            {integ.key === 'teams' ? ' · config' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export function HubUptimePanel() {
  const { data: integracoes, isLoading, isError, refetch } = useHubUptime();

  if (isError) return <DashboardEmptyState variant="error" onRetry={() => refetch()} />;
  if (isLoading || !integracoes) return <Skeleton className="h-[560px] w-full rounded-2xl" />;

  const online = integracoes.filter((i) => i.status === 'up').length;
  const ativas = integracoes.filter((i) => i.status !== 'off').length;

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes hubNeon {
          0%, 100% { box-shadow: 0 0 4px 0 color-mix(in srgb, var(--neon) 25%, transparent); }
          50% { box-shadow: 0 0 16px 1px color-mix(in srgb, var(--neon) 45%, transparent); }
        }
        @keyframes hubDot {
          0%, 100% { opacity: 0.65; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes hubDown {
          0%, 100% { box-shadow: 0 0 4px 0 rgba(248,113,113,0.25); }
          50% { box-shadow: 0 0 14px 2px rgba(248,113,113,0.5); }
        }
        @keyframes hubCore {
          0%, 100% { box-shadow: 0 0 24px 2px rgba(56,189,248,0.18), 0 0 60px 8px rgba(56,189,248,0.08), inset 0 0 18px rgba(56,189,248,0.12); }
          50% { box-shadow: 0 0 38px 6px rgba(56,189,248,0.32), 0 0 90px 16px rgba(56,189,248,0.14), inset 0 0 26px rgba(56,189,248,0.2); }
        }
        @keyframes hubFlow { to { stroke-dashoffset: -28; } }
        @keyframes hubHalo {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.06); }
        }
      `}</style>

      <div
        className="relative h-[600px] w-full overflow-hidden rounded-2xl border border-slate-800"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, #101a33 0%, #0a101f 55%, #070b16 100%)' }}
      >
        {/* grade de fundo sutil */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.4) 1px, transparent 1px)', backgroundSize: '36px 36px' }}
        />

        {/* conexões */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {integracoes.map((integ, idx) => {
            const cor = COR[integ.status];
            const ativa = integ.status === 'up';
            return (
              <line
                key={integ.key}
                x1="50" y1="50" x2={integ.x} y2={integ.y}
                stroke={cor}
                strokeOpacity={integ.status === 'off' ? 0.18 : ativa ? 0.55 : 0.4}
                strokeWidth={ativa ? 1.6 : 1.1}
                strokeDasharray={ativa ? '5 6' : integ.status === 'off' ? '2 5' : '4 5'}
                vectorEffect="non-scaling-stroke"
                style={ativa ? { animation: `hubFlow 1.8s linear ${idx * 0.25}s infinite` } : undefined}
              />
            );
          })}
        </svg>

        {/* núcleo FlagHub */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="absolute inset-0 -m-7 rounded-full border border-sky-400/20" style={{ animation: 'hubHalo 4.5s ease-in-out infinite' }} />
          <div
            className="relative flex h-32 w-32 flex-col items-center justify-center rounded-full border border-sky-400/50"
            style={{ background: 'radial-gradient(circle at 35% 30%, #16263f, #0b1526 70%)', animation: 'hubCore 4s ease-in-out infinite' }}
          >
            <Hexagon className="h-6 w-6 text-sky-300 mb-1" />
            <span className="text-sm font-bold tracking-wide text-sky-100">FlagHub</span>
            <span className="text-[10px] font-mono text-sky-300/90">{online}/{ativas} online</span>
          </div>
        </div>

        {integracoes.map((integ, idx) => (
          <NodeCard key={integ.key} integ={integ} delay={idx * 0.45} />
        ))}

        {/* legenda */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 rounded-full border border-slate-700/60 bg-slate-900/70 px-4 py-1.5 backdrop-blur-sm">
          {(['up', 'warn', 'down', 'off'] as IntegracaoStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-[10px] text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Batimentos reais: crons de sincronização (DevOps/VDESK a cada 5–10min), ingestão de timelog, espelho SGSI e runs das edge functions · atualiza a cada 2min
      </p>
    </div>
  );
}
