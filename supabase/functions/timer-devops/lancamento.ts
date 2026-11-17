// Lançamento na TechsBCN DevOps-TimeLog — partes puras (testáveis em Vitest).
//
// O documento é o mesmo que devops-post-timelog grava (um por lançamento,
// campos planos, `time` em minutos). O `id` é o uuid do timer_lancamentos:
// assim o devops-sync-timelog traz o documento de volta com
// ext_entry_id = id, e a conciliação é por igualdade.

import { ORG, type ItemTarefa } from './tarefas.ts'

export const TIMELOG_DOCS =
  `https://extmgmt.dev.azure.com/${ORG}/_apis/ExtensionManagement/InstalledExtensions/TechsBCN/DevOps-TimeLog` +
  '/Data/Scopes/Default/Current/Collections/TimeLogData/Documents'
export const API_EXT = 'api-version=7.1-preview.1'

export const TETO_GRUPOS = 10
export const TIPOS_COM_HORA = ['Task', 'Product Backlog Item', 'Bug']

export interface GrupoPedido {
  dia: string
  workItemId: number
  notas: string | null
}

export type Validacao<T> = { ok: true; valor: T } | { ok: false; motivo: string }

function diaValido(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T12:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Corpo de `lancar`: { grupos: [{ dia, work_item_id, notas? }] }, até 10, sem repetir. */
export function validarPedidoLancar(corpo: Record<string, unknown>): Validacao<GrupoPedido[]> {
  const grupos = corpo.grupos
  if (!Array.isArray(grupos) || grupos.length === 0) return { ok: false, motivo: 'sem_grupos' }
  if (grupos.length > TETO_GRUPOS) return { ok: false, motivo: 'grupos_demais' }
  const vistos = new Set<string>()
  const out: GrupoPedido[] = []
  for (const g of grupos) {
    const o = (g ?? {}) as Record<string, unknown>
    const id = Number(o.work_item_id)
    if (!diaValido(o.dia)) return { ok: false, motivo: 'dia_invalido' }
    if (!Number.isInteger(id) || id <= 0) return { ok: false, motivo: 'item_invalido' }
    if (o.notas != null && (typeof o.notas !== 'string' || o.notas.length > 500)) {
      return { ok: false, motivo: 'notas_invalidas' }
    }
    const chave = `${o.dia}|${id}`
    if (vistos.has(chave)) return { ok: false, motivo: 'grupo_repetido' }
    vistos.add(chave)
    const notas = typeof o.notas === 'string' ? o.notas.trim() : ''
    out.push({ dia: o.dia, workItemId: id, notas: notas || null })
  }
  return { ok: true, valor: out }
}

/** O item recebe hora? (conferido no Azure na hora de lançar — o app não decide) */
export function itemAceitaHora(item: ItemTarefa | undefined): { ok: true } | { ok: false; mensagem: string } {
  if (!item) return { ok: false, mensagem: 'O item não existe no Azure DevOps (ou foi removido).' }
  if (item.state === 'Removed') return { ok: false, mensagem: `O #${item.id} foi removido no Azure DevOps.` }
  if (!TIPOS_COM_HORA.includes(item.work_item_type ?? '')) {
    return { ok: false, mensagem: `O #${item.id} é ${item.work_item_type ?? 'de tipo desconhecido'}: só Task, PBI e Bug recebem horas.` }
  }
  return { ok: true }
}

/** O que timer_lancamento_preparar / _reenviar devolvem. */
export interface Preparado {
  id: string
  work_item_id: number
  dia: string
  minutos: number
  inicio: string
  notas: string | null
  devops_user_id: string
  devops_user_display: string | null
}

export function montarDocumento(p: Preparado, titulo: string | null) {
  return {
    id: p.id,
    user: p.devops_user_display ?? '',
    userId: p.devops_user_id,
    workItemId: p.work_item_id,
    workItemName: titulo ?? '',
    startTime: p.inicio,
    // A extensão mostra a hora que vai DENTRO de `date` ("AAAA-MM-DD HH:MM",
    // como ela mesma grava). Só o dia aparecia como 00:00 (17/11/2026).
    date: `${p.dia} ${p.inicio}`,
    time: p.minutos,
    notes: p.notas ?? 'Timer Flag',
  }
}

/**
 * O que fazer com a resposta do POST do documento.
 *   2xx / 409 (o id já existe) → lançado
 *   400 / 401 / 403 / 404      → recusado ANTES de gravar: cancela e solta os trechos
 *   resto (5xx, 429 esgotado)  → incerto: fica 'erro' e o reenvio confere antes
 */
export function desfechoDoPost(status: number): 'lancado' | 'cancelado' | 'erro' {
  if ((status >= 200 && status < 300) || status === 409) return 'lancado'
  if ([400, 401, 403, 404].includes(status)) return 'cancelado'
  return 'erro'
}

const MENSAGENS_PREPARO: Record<string, string> = {
  timer_sem_acesso: 'Seu acesso ao Timer não está ativo.',
  timer_sem_conta_devops: 'Sua conta não foi encontrada no Azure DevOps: não dá para lançar no seu nome.',
  timer_item_invalido: 'Item inválido.',
  timer_dia_fora_da_janela: 'Só dá para lançar os últimos 7 dias.',
  timer_muitas_acoes: 'Muitos lançamentos em pouco tempo. Espere um pouco.',
  timer_nada_a_lancar: 'Não há tempo a lançar neste item e dia (já lançado, descartado ou menos de 1 minuto).',
  timer_teto_dia_timelog: 'Passa de 12 h no dia somando o que já está no TimeLog.',
  timer_lancamento_inexistente: 'Lançamento não encontrado.',
  timer_lancamento_nao_reenviavel: 'Este lançamento não está com erro.',
  timer_lancamento_tentativas: 'Este lançamento já foi tentado 5 vezes. Fale com o administrador.',
}

/** Erro do RPC (texto do RAISE em message) → { motivo, mensagem }. */
export function erroDoPreparo(erro: { message?: string; details?: string } | null): { motivo: string; mensagem: string } {
  const msg = erro?.message ?? ''
  const motivo = Object.keys(MENSAGENS_PREPARO).find((k) => msg.includes(k))
  if (!motivo) return { motivo: 'erro_interno', mensagem: 'Erro inesperado ao preparar o lançamento.' }
  const extra = motivo === 'timer_teto_dia_timelog' && erro?.details ? ` (${erro.details})` : ''
  return { motivo, mensagem: MENSAGENS_PREPARO[motivo] + extra }
}
