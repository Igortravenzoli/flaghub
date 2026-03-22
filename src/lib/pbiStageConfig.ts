import type { PbiHealthStatus, PbiStageKey } from '@/types/pbi';

export const STAGE_LABELS: Record<PbiStageKey, string> = {
  backlog: 'Criada / Backlog',
  design: 'Design UX/UI',
  fabrica: 'Fabrica / Desenvolvimento',
  qualidade: 'Qualidade / Teste',
  deploy: 'Aguardando Deploy',
  done: 'Encerrada / Done',
};

export const STAGE_COLORS: Record<PbiStageKey, string> = {
  backlog: 'bg-slate-100 text-slate-700 border-slate-300',
  design: 'bg-sky-100 text-sky-700 border-sky-300',
  fabrica: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  qualidade: 'bg-amber-100 text-amber-700 border-amber-300',
  deploy: 'bg-orange-100 text-orange-700 border-orange-300',
  done: 'bg-emerald-100 text-emerald-700 border-emerald-300',
};

export const HEALTH_COLORS: Record<
  PbiHealthStatus,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  verde: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    label: 'Saudável',
    icon: '✅',
  },
  amarelo: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
    label: 'Atenção',
    icon: '⚠️',
  },
  vermelho: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
    label: 'Crítica',
    icon: '🔴',
  },
};
