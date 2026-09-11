/**
 * Colunas de credencial nunca entram no espelho SGSI.
 *
 * sgsi_items é lido por qualquer usuário aprovado do hub e o front baixa o
 * `fields` inteiro — a SG-LST-014 tinha "Senha AD", "Senha Banco", "Senha TS"…
 * copiadas para lá desde junho/2026. Quem precisa do conteúdo abre o item no
 * SharePoint (`_sharepoint_url`).
 *
 * Sem imports por URL: roda no Deno (edge function) e é testado pelo vitest do
 * front em src/test/sgsiSensivel.test.ts.
 */

const CREDENCIAL = /(^|[^a-zà-ÿ])(senha|password|passwd|pwd)/i

/** O nome interno do SharePoint codifica caracteres como `_xHHHH_`
 *  ("Senha_x0020_AD" = "Senha AD"). */
export function decodificarNomeInterno(nome: string): string {
  return nome.replace(/_x([0-9a-f]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

/** "SenhaAD" → "Senha AD", "UserPassword" → "User Password": sem isso a palavra
 *  fica colada e não tem fronteira. */
function separarCamelCase(nome: string): string {
  return nome.replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, '$1 $2')
}

/** true se o displayName ou o nome interno indicam credencial. O nome interno
 *  não muda quando alguém renomeia a coluna na lista, então vale como segunda
 *  barreira. Palavra que só CONTÉM "senha" no meio ("Resenha") não conta. */
export function colunaSensivel(displayName: string | undefined, nomeInterno: string): boolean {
  return [displayName ?? '', decodificarNomeInterno(nomeInterno)]
    .some((nome) => CREDENCIAL.test(separarCamelCase(nome)))
}
