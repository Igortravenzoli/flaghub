export const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(142, 71%, 45%)',
  'hsl(43, 85%, 46%)',
  'hsl(280, 65%, 60%)',
  'hsl(200, 80%, 50%)',
  'hsl(340, 75%, 55%)',
  'hsl(160, 60%, 45%)',
] as const;

export const STATE_COLORS: Record<string, string> = {
  'In Progress':        'bg-[hsl(var(--info))] text-white',
  'Active':             'bg-[hsl(var(--info))] text-white',
  'Em desenvolvimento': 'bg-[hsl(var(--info))] text-white',
  'Aguardando Teste':   'bg-rose-100 text-rose-700 border border-rose-300',
  'To Do':              'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'New':                'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'Done':               'bg-[hsl(var(--success))] text-white',
  'Closed':             'bg-[hsl(var(--success))] text-white',
  'Resolved':           'bg-[hsl(var(--success))] text-white',
};

export const TYPE_COLORS: Record<string, string> = {
  'Product Backlog Item': 'bg-primary/15 text-primary border-primary/30',
  'Task':       'bg-accent text-accent-foreground',
  'Bug':        'bg-destructive/15 text-destructive border-destructive/30',
  'User Story': 'bg-[hsl(var(--info))]/15 text-[hsl(var(--info))]',
};

export const TYPE_LABELS: Record<string, string> = {
  'Product Backlog Item': 'PBI',
  'Task':       'Task',
  'Bug':        'Bug',
  'User Story': 'Story',
};

export const HEALTH_COLORS = {
  verde:    'hsl(142, 71%, 45%)',
  amarelo:  'hsl(43, 85%, 46%)',
  vermelho: 'hsl(0, 84%, 60%)',
  cinza:    'hsl(var(--muted-foreground))',
  /**
   * SUPERAÇÃO — não é status de alerta, é "muito melhor que o esperado"
   * (21/08/2026, régua de 4 cores pedida pelo gestor). Fica fora do trio
   * semântico do DESIGN-SYSTEM §2.7 de propósito: verde/âmbar/vermelho seguem
   * respondendo "como estamos"; o azul responde "passamos longe da meta".
   * Tom do slot 1 da rampa categórica (§2.7a, modo escuro).
   */
  azul:     'hsl(212, 77%, 56%)',
} as const;

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Cor fixa por fábrica — identidade consistente entre os gráficos de Fábrica. */
export const FABRICA_COLORS: Record<string, string> = {
  K8: 'hsl(43,74%,49%)',
  FLEXX: 'hsl(265,52%,58%)',
  STAGING: 'hsl(205,55%,47%)',
  APP: 'hsl(160,55%,42%)',
};

export function fabricaColor(name: string, idx = 0): string {
  return FABRICA_COLORS[name] ?? getChartColor(idx);
}

/** Cor da medalha por posição no ranking (1º = melhor). */
export const MEDAL_COLORS = ['hsl(142,71%,45%)', 'hsl(43,74%,49%)', 'hsl(205,55%,47%)', 'hsl(0,72%,55%)'] as const;
export function medalColor(rank: number): string {
  return MEDAL_COLORS[Math.min(rank, MEDAL_COLORS.length - 1)];
}
