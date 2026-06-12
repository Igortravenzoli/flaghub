import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── HubUpTime ──────────────────────────────────────────────────────────
// Saúde do ecossistema FlagHub: batimento (heartbeat) por integração.
//   • DevOps / VDESK Gateway → hub_raw_ingestions (crons a cada 5-10 min)
//   • Timelog TechsBCN       → devops_time_logs.ingested_at (dados só quando há apontamento)
//   • SharePoint SGSI        → sgsi_lists.synced_at (sync manual/agendado)
//   • Edge Functions         → hub_sync_runs (qualquer run recente)
//   • Postgres (Supabase)    → a própria consulta respondendo
//   • Teams                  → configurado (sem heartbeat dedicado)
//   • Pipedrive              → ainda não integrado (off)

export type IntegracaoStatus = 'up' | 'warn' | 'down' | 'off';

export interface HubIntegracao {
  key: string;
  label: string;
  /** Descrição curta da função no ecossistema */
  papel: string;
  status: IntegracaoStatus;
  lastBeat: string | null;
  /** Posição no mapa (percentual do contêiner) */
  x: number;
  y: number;
  /** Subsessões exibidas dentro do card (ex.: Postgres · Auth · Cron jobs) */
  subs?: { label: string; ok: boolean }[];
  /** Chaves de outros nós com link direto (além do hub) */
  linksExtras?: string[];
}

function minutosDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 60000);
}

function statusPorIdade(min: number | null, upAteMin: number, warnAteMin: number): IntegracaoStatus {
  if (min === null) return 'down';
  if (min <= upAteMin) return 'up';
  if (min <= warnAteMin) return 'warn';
  return 'down';
}

export function fmtIdade(min: number | null): string {
  if (min === null) return 'sem sinal';
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  if (min < 48 * 60) return `há ${Math.round(min / 60)}h`;
  return `há ${Math.round(min / 1440)}d`;
}

export function useHubUptime() {
  return useQuery({
    queryKey: ['hub-uptime'],
    queryFn: async (): Promise<HubIntegracao[]> => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const sb = supabase as any;
      const [devopsIng, gatewayIng, timelog, sgsi, syncRun] = await Promise.all([
        sb.from('hub_raw_ingestions').select('processed_at').eq('source_type', 'devops').order('processed_at', { ascending: false }).limit(1),
        sb.from('hub_raw_ingestions').select('processed_at').eq('source_type', 'api_gateway').order('processed_at', { ascending: false }).limit(1),
        sb.from('devops_time_logs').select('ingested_at').order('ingested_at', { ascending: false }).limit(1),
        sb.from('sgsi_lists').select('synced_at').order('synced_at', { ascending: false }).limit(1),
        sb.from('hub_sync_runs').select('started_at, status').order('started_at', { ascending: false }).limit(1),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const devopsBeat = devopsIng.data?.[0]?.processed_at ?? null;
      const gatewayBeat = gatewayIng.data?.[0]?.processed_at ?? null;
      const timelogBeat = timelog.data?.[0]?.ingested_at ?? null;
      const sgsiBeat = sgsi.data?.[0]?.synced_at ?? null;
      const runBeat = syncRun.data?.[0]?.started_at ?? null;
      const runOk = syncRun.data?.[0]?.status === 'ok' || syncRun.data?.[0]?.status === 'running';

      const agora = new Date().toISOString();
      // pg_cron vivo = os syncs agendados estão batendo (são disparados por ele)
      const cronOk =
        statusPorIdade(minutosDesde(devopsBeat), 30, 120) === 'up' ||
        statusPorIdade(minutosDesde(gatewayBeat), 30, 120) === 'up';

      return [
        // Crons de 5-10 min: up até 30min, warn até 2h
        { key: 'devops', label: 'Azure DevOps', papel: 'Work items · repos · pipelines', x: 25, y: 13, lastBeat: devopsBeat, status: statusPorIdade(minutosDesde(devopsBeat), 30, 120) },
        // Supabase ao lado das Edge Functions, com link direto entre eles
        {
          key: 'postgres', label: 'Supabase', papel: 'Repositório de dados do Hub', x: 50, y: 9, lastBeat: agora, status: 'up',
          linksExtras: ['edge'],
          subs: [
            { label: 'Postgres', ok: true },
            { label: 'Auth', ok: true },
            { label: 'Cron jobs', ok: cronOk },
          ],
        },
        { key: 'edge', label: 'Edge Functions', papel: 'Backend de sincronização', x: 75, y: 13, lastBeat: runBeat, status: runOk ? statusPorIdade(minutosDesde(runBeat), 30, 120) : 'warn' },
        { key: 'vdesk', label: 'VDESK', papel: 'Tickets e OS (via Gateway)', x: 93, y: 45, lastBeat: gatewayBeat, status: statusPorIdade(minutosDesde(gatewayBeat), 30, 120) },
        // Teams: app Entra configurado (alertas QA); sem heartbeat dedicado
        { key: 'teams', label: 'Microsoft Teams', papel: 'Alertas e notificações', x: 80, y: 88, lastBeat: null, status: 'up' },
        // Pipedrive: integração ainda não ativada
        { key: 'pipedrive', label: 'Pipedrive', papel: 'CRM comercial (em breve)', x: 50, y: 92, lastBeat: null, status: 'off' },
        // SGSI: sync manual/agendado — up até 48h
        { key: 'sharepoint', label: 'SharePoint SGSI', papel: 'Listas SG (PORTALSGSI)', x: 20, y: 88, lastBeat: sgsiBeat, status: statusPorIdade(minutosDesde(sgsiBeat), 48 * 60, 7 * 24 * 60) },
        // Timelog: dado novo só quando há apontamento — janela generosa
        { key: 'timelog', label: 'TimeLog TechsBCN', papel: 'Horas apontadas no DevOps', x: 7, y: 45, lastBeat: timelogBeat, status: statusPorIdade(minutosDesde(timelogBeat), 24 * 60, 72 * 60) },
      ];
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}
