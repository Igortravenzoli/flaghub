import { prazoSprint, type NivelPrazo, type PrazoSprint } from './prazoSprint';

/**
 * Agrupamento de "Minhas atividades" na hierarquia do DevOps:
 * Epic > Feature > PBI > Task. Regra pura (sem React, sem Supabase).
 *
 * Quem flutua entre projetos se orienta pela Epic, não pela sprint. A sprint
 * vira atributo de cada linha (cor do prazo) e decide a ORDEM: dentro de cada
 * nível, o que está mais perto de vencer vem primeiro.
 *
 * - Task fica debaixo do PBI/Bug pai; PBI/Bug debaixo da Feature; Feature
 *   debaixo da Epic. Ancestrais que não são do usuário vêm em `ancestrais` e
 *   aparecem só como contexto.
 * - Hierarquia incompleta não some: cai em "Sem Epic" / "Sem Feature" /
 *   "Tasks sem PBI", sempre no fim do nível.
 */

export interface ItemDevops {
  id: number;
  title: string | null;
  state: string | null;
  work_item_type: string | null;
  parent_id: number | null;
  iteration_path: string | null;
  web_url: string | null;
  tags: string | null;
}

export interface GrupoPbi {
  key: string;
  pbi: ItemDevops | null; // null = Tasks sem pai conhecido
  pbiAtribuido: boolean;
  prazo: PrazoSprint | null;
  tasks: ItemDevops[];
  urgencia: number;
}

export interface GrupoFeature {
  key: string;
  feature: ItemDevops | null;
  total: number;
  urgencia: number;
  pbis: GrupoPbi[];
}

export interface GrupoEpic {
  key: string;
  epic: ItemDevops | null;
  total: number;
  urgencia: number;
  features: GrupoFeature[];
}

/** Quanto menor, mais urgente. */
export const URGENCIA: Record<NivelPrazo, number> = {
  vencida: 0,
  ultimo_dia: 1,
  reta_final: 2,
  ok: 3,
  desconhecida: 4,
  sem_sprint: 5,
  concluido: 6,
};

/** Em andamento primeiro, depois a fazer, depois o resto. */
export function prioridadeEstado(state: string | null | undefined): number {
  switch (state) {
    case 'In Progress':
    case 'Committed':
    case 'Active':
      return 0;
    case 'To Do':
    case 'New':
    case 'Approved':
      return 1;
    default:
      return 2;
  }
}

const NENHUM = 'none';

export function agruparPorHierarquia(
  itens: ItemDevops[],
  ancestrais: ItemDevops[],
  hoje: string,
): GrupoEpic[] {
  const porId = new Map<number, ItemDevops>();
  for (const a of ancestrais) porId.set(a.id, a);
  for (const i of itens) porId.set(i.id, i);
  const meus = new Set(itens.map((i) => i.id));
  const urg = (i: ItemDevops) => URGENCIA[prazoSprint(i, hoje).nivel];

  // Sobe a cadeia a partir do PBI até achar Feature e Epic. Teto de 6 saltos
  // só para nunca girar em ciclo de dado ruim.
  const ancestraisDe = (inicio: ItemDevops | null) => {
    let feature: ItemDevops | null = null;
    let epic: ItemDevops | null = null;
    let cur = inicio?.parent_id != null ? porId.get(inicio.parent_id) : undefined;
    for (let n = 0; cur && n < 6; n++) {
      if (!feature && !epic && cur.work_item_type === 'Feature') feature = cur;
      else if (!epic && cur.work_item_type === 'Epic') epic = cur;
      if (epic) break;
      cur = cur.parent_id != null ? porId.get(cur.parent_id) : undefined;
    }
    return { feature, epic };
  };

  const epics = new Map<string, GrupoEpic>();
  const grupoPbi = (pbi: ItemDevops | null): GrupoPbi => {
    const { feature, epic } = ancestraisDe(pbi);
    const ek = epic ? String(epic.id) : NENHUM;
    let e = epics.get(ek);
    if (!e) epics.set(ek, (e = { key: ek, epic, total: 0, urgencia: 9, features: [] }));
    const fk = `${ek}/${feature ? feature.id : NENHUM}`;
    let f = e.features.find((x) => x.key === fk);
    if (!f) e.features.push((f = { key: fk, feature, total: 0, urgencia: 9, pbis: [] }));
    const pk = `${fk}/${pbi ? pbi.id : NENHUM}`;
    let p = f.pbis.find((x) => x.key === pk);
    if (!p) {
      f.pbis.push(
        (p = {
          key: pk,
          pbi,
          pbiAtribuido: pbi != null && meus.has(pbi.id),
          prazo: pbi ? prazoSprint(pbi, hoje) : null,
          tasks: [],
          urgencia: 9,
        }),
      );
    }
    e.total++;
    f.total++;
    return p;
  };

  for (const item of itens) {
    let g: GrupoPbi;
    if (item.work_item_type === 'Task') {
      const pai = item.parent_id != null ? (porId.get(item.parent_id) ?? null) : null;
      g = grupoPbi(pai);
      g.tasks.push(item);
    } else {
      g = grupoPbi(item);
    }
    g.urgencia = Math.min(g.urgencia, urg(item));
  }

  const vazioPorUltimo = <T,>(a: T | null, b: T | null) => (!a === !b ? 0 : a ? -1 : 1);
  const porTitulo = (a: ItemDevops | null, b: ItemDevops | null) =>
    (a?.title ?? '').localeCompare(b?.title ?? '');

  const out = [...epics.values()];
  for (const e of out) {
    for (const f of e.features) {
      for (const p of f.pbis) {
        p.tasks.sort(
          (a, b) =>
            urg(a) - urg(b) ||
            prioridadeEstado(a.state) - prioridadeEstado(b.state) ||
            a.id - b.id,
        );
      }
      f.pbis.sort(
        (a, b) =>
          vazioPorUltimo(a.pbi, b.pbi) ||
          a.urgencia - b.urgencia ||
          prioridadeEstado(a.pbi?.state) - prioridadeEstado(b.pbi?.state) ||
          (a.pbi?.id ?? 0) - (b.pbi?.id ?? 0),
      );
      f.urgencia = Math.min(...f.pbis.map((p) => p.urgencia));
    }
    e.features.sort(
      (a, b) =>
        vazioPorUltimo(a.feature, b.feature) ||
        a.urgencia - b.urgencia ||
        porTitulo(a.feature, b.feature),
    );
    e.urgencia = Math.min(...e.features.map((f) => f.urgencia));
  }
  out.sort(
    (a, b) => vazioPorUltimo(a.epic, b.epic) || a.urgencia - b.urgencia || porTitulo(a.epic, b.epic),
  );
  return out;
}

/** Chaves de tudo que recolhe (Epic e Feature) — para "recolher tudo". */
export function chavesRecolhiveis(grupos: GrupoEpic[]): string[] {
  return grupos.flatMap((e) => [e.key, ...e.features.map((f) => f.key)]);
}

/**
 * Busca por nome ou código. Bater num ancestral (PBI, Feature, Epic) traz os
 * itens debaixo dele. "#16603" é o número exato; "166" sem # bate por trecho.
 */
export function filtrarAtividades(
  itens: ItemDevops[],
  ancestrais: ItemDevops[],
  busca: string,
): ItemDevops[] {
  const bruto = busca.trim().toLowerCase();
  const exato = bruto.startsWith('#');
  const q = bruto.replace(/^#/, '');
  if (!q) return itens;
  const bate = (i: ItemDevops | undefined) =>
    !!i &&
    (exato
      ? String(i.id) === q
      : String(i.id).includes(q) || (i.title ?? '').toLowerCase().includes(q));
  const porId = new Map<number, ItemDevops>();
  for (const a of ancestrais) porId.set(a.id, a);
  for (const i of itens) porId.set(i.id, i);
  return itens.filter((i) => {
    let cur: ItemDevops | undefined = i;
    for (let n = 0; cur && n < 6; n++) {
      if (bate(cur)) return true;
      cur = cur.parent_id != null ? porId.get(cur.parent_id) : undefined;
    }
    return false;
  });
}

/** Contagem de risco para o cabeçalho. */
export function resumoRisco(itens: ItemDevops[], hoje: string) {
  let vencidas = 0;
  let fimDeSprint = 0;
  for (const i of itens) {
    const n = prazoSprint(i, hoje).nivel;
    if (n === 'vencida') vencidas++;
    else if (n === 'reta_final' || n === 'ultimo_dia') fimDeSprint++;
  }
  return { vencidas, fimDeSprint };
}
