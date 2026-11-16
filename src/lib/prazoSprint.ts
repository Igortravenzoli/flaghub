import { format } from 'date-fns';
import { extractSprintCodeFromPath, getOfficialSprintRange } from './sprintCalendar';

/**
 * Prazo da sprint de um work item — base da cor que avisa, ANTES do fim, que o
 * item vai sobrar. Regra pura, sobre o calendário oficial (S{n}-{ano}, 14 dias
 * de segunda a sexta, ver sprintCalendar.ts).
 *
 * Os limiares são PROPORCIONAIS ao tamanho da sprint: reta final = últimos 30%
 * dos dias úteis (mínimo 2). Na sprint de 2 semanas: âmbar nos 3 últimos dias
 * úteis, laranja no último.
 *
 * "Transbordo" aqui tem o sentido do resto do FlagHub: é a decisão do gestor
 * (tag TRANSBORDO + migração na Fábrica). Item com a sprint encerrada e SEM a
 * tag aparece como "vencida"; com a tag, como "transbordo".
 */

export type NivelPrazo =
  | 'ok' // longe do fim (ou sprint futura)
  | 'reta_final'
  | 'ultimo_dia'
  | 'vencida' // a sprint terminou e o item não fechou
  | 'sem_sprint' // na raiz do projeto
  | 'concluido' // Done/Closed/Removed
  | 'desconhecida'; // iteração fora do padrão S{n}-{ano}

export interface PrazoSprint {
  nivel: NivelPrazo;
  sprint: string | null; // "S23-2026"
  inicio: string | null; // yyyy-MM-dd
  fim: string | null;
  restantes: number | null; // dias úteis que faltam, contando hoje
  total: number | null;
}

export const FRACAO_RETA_FINAL = 0.3;
const FECHADOS = new Set(['Done', 'Closed', 'Removed']);

// Mesmas regexes da edge devops-transbordo / fn_tem_tag_transbordo.
const RE_TRANSBORDO = /(^|;)\s*transbord(o|ad[oa])\s*(;|$)/i;
const RE_AVIAO_LEGADO = /(^|;)\s*avi[aã]o\s+(antigo|transbordad[oa])\s*(;|$)/i;
export const temTagTransbordo = (tags: string | null | undefined) =>
  RE_TRANSBORDO.test(tags ?? '') || RE_AVIAO_LEGADO.test(tags ?? '');

export const hojeISO = () => format(new Date(), 'yyyy-MM-dd');

/** Dias úteis (seg–sex) entre duas datas yyyy-MM-dd, inclusive. */
export function diasUteisEntre(de: string, ate: string): number {
  const d = new Date(`${de}T00:00:00Z`);
  const fim = new Date(`${ate}T00:00:00Z`);
  let n = 0;
  while (d <= fim) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export function prazoSprint(
  item: { iteration_path: string | null; state: string | null },
  hoje: string,
): PrazoSprint {
  const sprint = extractSprintCodeFromPath(item.iteration_path);
  const base = { sprint, inicio: null, fim: null, restantes: null, total: null };
  if (item.state && FECHADOS.has(item.state)) return { ...base, nivel: 'concluido' };
  if (!item.iteration_path || !item.iteration_path.includes('\\')) {
    return { ...base, nivel: 'sem_sprint' };
  }
  const range = sprint ? getOfficialSprintRange(sprint) : null;
  if (!range) return { ...base, nivel: 'desconhecida' };

  const inicio = format(range.from, 'yyyy-MM-dd');
  const fim = format(range.to, 'yyyy-MM-dd');
  const comDatas = { ...base, inicio, fim };
  if (hoje > fim) return { ...comDatas, nivel: 'vencida' };
  if (hoje < inicio) return { ...comDatas, nivel: 'ok' };

  const total = diasUteisEntre(inicio, fim);
  const restantes = diasUteisEntre(hoje, fim);
  const retaFinal = Math.max(2, Math.round(total * FRACAO_RETA_FINAL));
  const nivel: NivelPrazo =
    restantes <= 1 ? 'ultimo_dia' : restantes <= retaFinal ? 'reta_final' : 'ok';
  return { ...comDatas, nivel, restantes, total };
}

const ddmm = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

/** Rótulo curto da linha e a explicação do tooltip. */
export function textoPrazo(
  p: PrazoSprint,
  tags?: string | null,
): { rotulo: string; dica: string } {
  const sprint = p.sprint ?? '';
  switch (p.nivel) {
    case 'sem_sprint':
      return { rotulo: 'sem sprint', dica: 'Na raiz do projeto: não entra em nenhuma sprint.' };
    case 'vencida':
      return temTagTransbordo(tags)
        ? {
            rotulo: `${sprint} · transbordo`,
            dica: `A sprint terminou em ${ddmm(p.fim)} e o gestor classificou o item para transbordo.`,
          }
        : {
            rotulo: `${sprint} · vencida`,
            dica: `A sprint terminou em ${ddmm(p.fim)} e o item não foi concluído.`,
          };
    case 'ultimo_dia':
      return { rotulo: `${sprint} · último dia`, dica: `Último dia útil da sprint (${ddmm(p.fim)}).` };
    case 'reta_final':
      return {
        rotulo: `${sprint} · ${p.restantes} dias`,
        dica: `Faltam ${p.restantes} dias úteis, contando hoje. A sprint acaba em ${ddmm(p.fim)}.`,
      };
    case 'ok':
      return {
        rotulo: sprint,
        dica:
          p.restantes != null
            ? `Faltam ${p.restantes} dias úteis. A sprint acaba em ${ddmm(p.fim)}.`
            : `A sprint ainda não começou. Acaba em ${ddmm(p.fim)}.`,
      };
    default:
      return { rotulo: sprint, dica: sprint };
  }
}
