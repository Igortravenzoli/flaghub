// Gravação de uma lista SG em sgsi_items enviando só o que mudou (EG-7 / PR-10).
//
// Antes, cada execução apagava a lista e reinseria todos os itens: 24,9 a
// 30,6 MB/dia de upload em POST /rest/v1/sgsi_items (04 a 10/10/2026), para
// ~33 itens alterados na semana. Agora a edge manda item_id + 64 bits da
// impressão de cada item; o banco (rpc_sgsi_sincronizar_lista, migration
// 20261011140000) apaga o que sumiu da origem e devolve os ids novos ou
// alterados, e só esses sobem.
//
// Impressão = sha256(item_id | created_sp em ms | modified_sp em ms | fields
// em jsonb::text), a MESMA conta de public.sgsi_impressao. É calculada sobre a
// linha FINAL — a que seria gravada —, então qualquer mudança de normalização
// (nomes de pessoa, link, filtro de credenciais) faz o item divergir e ser
// regravado sozinho.
//
// Credenciais: o filtro principal é o do normalizeFields (sensivel.ts, pelo
// displayName E pelo nome interno). Aqui ele é reaplicado sobre as chaves
// finais, em TODO caminho de gravação (diff e legado), antes da impressão.
// Para as linhas de hoje não muda nada (as chaves que sobrevivem ao
// normalizeFields não casam com o filtro); existe para que nenhuma gravação
// futura dependa só de quem monta o `fields`.
//
// Sem imports por URL: roda no Deno e é testado pelo vitest em
// src/test/sgsiGravacao.test.ts.

import { IMPRESSAO_ENVIADA, jsonbTexto } from '../_shared/timelogImpressao.ts'
import { colunaSensivel } from './sensivel.ts'

/** Linha de public.sgsi_items como a edge grava. */
export interface LinhaSgsi {
  list_key: string
  item_id: number
  fields: Record<string, unknown>
  created_sp: string | null
  modified_sp: string | null
  synced_at: string
}

type Erro = { code?: string; message: string } | null

/** O pedaço do cliente supabase-js que a gravação usa (injetável no teste). */
export interface ClienteSgsi {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: Erro }>
  from(tabela: 'sgsi_items'): {
    upsert(linhas: LinhaSgsi[], opcoes: { onConflict: string }): PromiseLike<{ error: Erro }>
    insert(linhas: LinhaSgsi[]): PromiseLike<{ error: Erro }>
    delete(): { eq(coluna: string, valor: string): PromiseLike<{ error: Erro }> }
  }
}

export interface ResultadoLista {
  /** 'diff' = caminho novo; 'legado' = apagou e reinseriu tudo (RPC indisponível) */
  modo: 'diff' | 'legado'
  itens: number
  /** itens gravados nesta execução (upsert no diff, insert no legado) */
  gravados: number
  /** itens que sumiram da origem e saíram da base (no legado: desconhecido) */
  removidos: number | null
  /** por que caiu no legado */
  aviso?: string
}

const LOTE = 200

const codificador = new TextEncoder()

/** Remove do `fields` qualquer chave que o filtro de credenciais reconheça. */
export function semCredencial(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(fields)) {
    if (colunaSensivel(chave, chave)) continue
    out[chave] = valor
  }
  return out
}

/** ms desde a época, em texto; '' para nulo. No banco: floor(extract(epoch FROM ts) * 1000)::bigint. */
function msDesdeEpoca(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? String(Math.floor(ms)) : ''
}

/** sha256 hex (64 caracteres) — a mesma conta de public.sgsi_impressao. */
export async function impressaoItemSgsi(
  linha: Pick<LinhaSgsi, 'item_id' | 'created_sp' | 'modified_sp' | 'fields'>,
): Promise<string> {
  const texto = `${linha.item_id}|${msDesdeEpoca(linha.created_sp)}|${msDesdeEpoca(linha.modified_sp)}|${jsonbTexto(linha.fields)}`
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', codificador.encode(texto)))
  let hex = ''
  for (const b of digest) hex += b.toString(16).padStart(2, '0')
  return hex
}

// PGRST202 = o PostgREST não achou a função: edge publicada ANTES da migration.
function motivoFalhaRpc(err: NonNullable<Erro>): string {
  return err.code === 'PGRST202'
    ? `migration EG-7 ausente (20261011140000_eg7_sgsi_diff_por_item) — ${err.message}`
    : err.message
}

/**
 * Sincroniza uma lista: a RPC apaga o que sumiu e devolve o que gravar; só essas
 * linhas sobem por upsert. Se a RPC falhar, cai no caminho antigo (apagar e
 * reinserir tudo), com o motivo em `aviso`. Erros de gravação lançam, como antes.
 */
export async function sincronizarLista(
  cliente: ClienteSgsi,
  listKey: string,
  linhas: LinhaSgsi[],
): Promise<ResultadoLista> {
  const seguras = linhas.map((l) => ({ ...l, fields: semCredencial(l.fields) }))
  const impressoes = await Promise.all(seguras.map((l) => impressaoItemSgsi(l)))

  const { data, error } = await cliente.rpc('rpc_sgsi_sincronizar_lista', {
    p_list_key: listKey,
    p_item_ids: seguras.map((l) => l.item_id),
    p_impressoes: impressoes.map((h) => h.slice(0, IMPRESSAO_ENVIADA)),
  })
  if (error) return caminhoLegado(cliente, listKey, seguras, motivoFalhaRpc(error))

  const r = data as { alterados: number[]; removidos: number }
  const alterados = new Set(r.alterados ?? [])
  const gravar = seguras.filter((l) => alterados.has(l.item_id))
  for (let i = 0; i < gravar.length; i += LOTE) {
    const { error: upErr } = await cliente.from('sgsi_items')
      .upsert(gravar.slice(i, i + LOTE), { onConflict: 'list_key,item_id' })
    if (upErr) throw new Error(`Upsert sgsi_items ${listKey}: ${upErr.message}`)
  }
  return { modo: 'diff', itens: seguras.length, gravados: gravar.length, removidos: r.removidos ?? 0 }
}

/** Caminho da v1.1: apaga a lista e reinsere tudo. Só roda quando a RPC falha. */
async function caminhoLegado(
  cliente: ClienteSgsi,
  listKey: string,
  seguras: LinhaSgsi[],
  motivo: string,
): Promise<ResultadoLista> {
  console.error(`[SGSI] Diff indisponível em ${listKey}, regravando a lista inteira: ${motivo}`)
  const { error: delErr } = await cliente.from('sgsi_items').delete().eq('list_key', listKey)
  if (delErr) throw new Error(`Limpeza sgsi_items ${listKey}: ${delErr.message}`)
  for (let i = 0; i < seguras.length; i += LOTE) {
    const { error: insErr } = await cliente.from('sgsi_items').insert(seguras.slice(i, i + LOTE))
    if (insErr) throw new Error(`Insert sgsi_items ${listKey}: ${insErr.message}`)
  }
  return {
    modo: 'legado',
    itens: seguras.length,
    gravados: seguras.length,
    removidos: null,
    aviso: `Diff indisponível em ${listKey} (${motivo}); a lista foi regravada inteira.`,
  }
}
