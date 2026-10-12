import { describe, expect, it } from 'vitest';
import {
  buildSgsiResponse,
  remontarSgsiProjetado,
  selectSgsiProjetado,
  SGSI_CAMPOS_PROJETADOS,
  SGSI_LISTAS_FIELDS_INTEIROS,
} from '@/hooks/useBIInfra';
import type { SgsiRawItem } from '@/lib/sgsiFields';

/**
 * EG-8 (11/10/2026) — o espelho SGSI passou a vir com só os campos lidos nas
 * listas 010 e 014 (as que pesam: ~7,3 dos ~7,8 MB por carga).
 *
 * A garantia: montar a resposta com as linhas INTEIRAS e com as linhas
 * PROJETADAS (o que o PostgREST devolve para `selectSgsiProjetado`, remontado
 * por `remontarSgsiProjetado`) dá exatamente o mesmo resultado. As linhas têm
 * TODOS os campos que existem no PROD (catálogo abaixo), com valores que
 * exercitam os predicados — se `buildSgsiResponse` passar a ler um campo que
 * não está em `SGSI_CAMPOS_PROJETADOS`, a montagem diverge e este teste falha.
 */

/** Campos (displayName) presentes em `sgsi_items.fields` no PROD em 11/10/2026. */
const CATALOGO_PROD: Record<string, string[]> = {
  '010': [
    'Informações adicionais', '_sharepoint_url', 'Motivo da mudança ou atualização', 'Pacote atualização (Link 1)',
    'Digite o Email ou grupo de quem deve receber notificação de conclusão',
    'Digite o Email ou grupo de quem deve receber notificação de conclusão (lookupId)',
    'Defina a data para aplicação da atualização ou mudança', 'Validação e testes do pacote de atualização',
    'Responsável pelo desenvolvimento', 'Responsável pelo desenvolvimento (lookupId)', 'Solicitante atualização',
    'Responsável pelo teste', 'Modificado por', 'Solicitante atualização (lookupId)', 'Tipo Mudança', 'Criado por',
    'Responsável pelo teste (lookupId)', 'Aprovador TI', 'Título', 'Modificado', 'Categoria da mudança',
    'Aprovador Gestor', 'Modificado por (lookupId)', 'Criado', 'Aprovador Gestor (lookupId)', 'Aprovador TI (lookupId)',
    'Criado por (lookupId)', 'Atualizações bem sucedidas', 'Status', 'Risco', 'Hora', 'Pacote atualização (Link 2)',
    'Número do chamado', 'Comentário atualizações', 'Pacote atualização (Link 3)', 'Comentário TI Aprovação',
    'Data e Hora conclusão', 'Comentário Gestor Aprovação',
  ],
  '014': [
    '_sharepoint_url', 'Descrição acesso', 'Motivo acesso', 'Data ultima revisão', 'Criado por', 'Tipo solicitação',
    'Modificado por', 'Aprovador TI', 'Modificado', 'Permissões administrativas', 'Solicitante', 'Usuário acesso SMB',
    'Status solicitação', 'Aprovador Gestor', 'Modificado por (lookupId)', 'Tipo liberação', '<---Preenchimento TI--->',
    'Criado', 'Usuário TS', 'Data fim liberação provisória', 'Aprovador TI (lookupId)', 'Projeto',
    'Solicitante (lookupId)', 'Criado por (lookupId)', 'User AD Flag', 'TItulo', 'Acesso ao DevOps', 'Prioridade',
    'Categoria Liberação', 'Acesso ao TS', 'VPN Flag', 'Servidor Banco de dados', 'Usuário Banco de dados',
    'Permissão instância', 'Banco de dados acessado', 'Comentário TI', 'VPN Ibm', 'Repositório ou projeto',
    'Data conclusão', 'Diretório pasta', 'IP Servidor TS', 'Nome Colaborador', 'Permissão IBM', 'Usuário IBM',
    'Permissão DevOps', 'Permissão Pasta', 'Portais', 'Comentário Gestor', 'Histórico', 'Email novo colaborador',
    'Email novo colaborador (lookupId)', 'User Portal',
  ],
};

/** Valores que acionam os predicados de status, sim/não, datas, listas e links. */
const VALORES: unknown[] = [
  'Realizado', 'Rejeitado', 'Aguardando aprovação Gestores', 'Aguardando aprovação TI', 'Aprovado',
  'Sim', 'Não', true, false, null, '', '2026-09-09T00:00:00Z', '2026-10-30T03:00:00Z',
  '["Banco de dados","Vpn Flag Local"]', ['Acesso pastas', 'DevOps'], 'Provisória', 'Definitiva', 'Revogado',
  'https://flag.sharepoint.com/item/1', 'Pendente', 'Alto', '12,5', 'texto livre',
];

/** Gerador determinístico (LCG) para as linhas não dependerem de Math.random. */
function gerador(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function linhasDoCatalogo(lista: string, n: number, semente: number): SgsiRawItem[] {
  const rnd = gerador(semente);
  return Array.from({ length: n }, (_, i) => {
    const fields: Record<string, unknown> = {};
    for (const campo of CATALOGO_PROD[lista]) {
      if (rnd() < 0.15) continue; // campo ausente, como no PROD
      fields[campo] = VALORES[Math.floor(rnd() * VALORES.length)];
    }
    const dia = 1 + Math.floor(rnd() * 28);
    const mes = 1 + Math.floor(rnd() * 10);
    const criado = `2026-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T12:00:00Z`;
    return { list_key: lista, item_id: i + 1, fields, created_sp: criado, modified_sp: rnd() < 0.5 ? criado : null };
  });
}

/** O que o PostgREST devolve para `selectSgsiProjetado(campos)`: `fN` = `fields->campo` (null se ausente). */
function respostaPostgrest(linha: SgsiRawItem, campos: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    list_key: linha.list_key, item_id: linha.item_id, created_sp: linha.created_sp, modified_sp: linha.modified_sp,
  };
  campos.forEach((campo, i) => { out[`f${i}`] = linha.fields[campo] ?? null; });
  return out;
}

function projetar(linhas: SgsiRawItem[]): SgsiRawItem[] {
  return linhas.map((l) => {
    const campos = SGSI_CAMPOS_PROJETADOS[l.list_key];
    if (campos) return remontarSgsiProjetado(respostaPostgrest(l, campos), campos);
    if (SGSI_LISTAS_FIELDS_INTEIROS.includes(l.list_key)) return l;
    return { ...l, fields: {} };
  });
}

const AGORA = new Date('2026-10-11T15:00:00Z');

describe('SGSI — projeção dos campos de 010/014 (EG-8)', () => {
  const linhas: SgsiRawItem[] = [
    ...linhasDoCatalogo('010', 400, 10),
    ...linhasDoCatalogo('014', 300, 14),
    // listas pequenas vêm inteiras; a 013 (nenhum bloco lê) vem sem fields
    { list_key: '017', item_id: 1, fields: { Status: 'Ativo', SLA: 'Sim', Categoria: 'Rede' }, created_sp: '2026-09-01T12:00:00Z', modified_sp: null },
    { list_key: '012', item_id: 1, fields: { 'Status solicitação': 'Encerrado' }, created_sp: '2026-08-01T12:00:00Z', modified_sp: '2026-08-20T12:00:00Z' },
    { list_key: '013', item_id: 1, fields: { Qualquer: 'coisa', Status: 'Realizado' }, created_sp: '2026-09-02T12:00:00Z', modified_sp: null },
  ];

  it('montagem idêntica com e sem a projeção — sem período, com sprint e com calendário', () => {
    const projetadas = projetar(linhas);
    const sprint = { from: new Date('2026-09-28T00:00:00'), to: new Date('2026-10-09T23:59:59') };
    const ano = { from: new Date('2026-01-01T00:00:00'), to: new Date('2026-12-31T23:59:59') };
    expect(buildSgsiResponse(projetadas, 'x', AGORA)).toEqual(buildSgsiResponse(linhas, 'x', AGORA));
    expect(buildSgsiResponse(projetadas, 'x', AGORA, sprint)).toEqual(buildSgsiResponse(linhas, 'x', AGORA, sprint));
    expect(buildSgsiResponse(projetadas, 'x', AGORA, ano, ano)).toEqual(buildSgsiResponse(linhas, 'x', AGORA, ano, ano));
  });

  it('a projeção corta de fato os campos pesados que nenhuma tela lê', () => {
    const campos010 = SGSI_CAMPOS_PROJETADOS['010'];
    expect(campos010).not.toContain('Informações adicionais');
    expect(campos010).not.toContain('_sharepoint_url');
    expect(campos010).not.toContain('Pacote atualização (Link 1)');
    expect(SGSI_CAMPOS_PROJETADOS['014']).toContain('_sharepoint_url'); // vira link na tabela de acessos
  });

  it('o select do PostgREST cita cada campo entre aspas, com alias fN', () => {
    const select = selectSgsiProjetado(['Status', '<---Preenchimento TI--->', 'O plano foi eficaz?']);
    expect(select).toBe(
      'list_key, item_id, created_sp, modified_sp, f0:fields->"Status", f1:fields->"<---Preenchimento TI--->", f2:fields->"O plano foi eficaz?"',
    );
    // aspas ou vírgula no nome quebrariam o parser do select
    for (const campos of Object.values(SGSI_CAMPOS_PROJETADOS)) {
      for (const campo of campos) expect(campo).not.toMatch(/[",]/);
    }
  });

  it('remontar deixa de fora o campo ausente (null) e preserva tipos', () => {
    const r = remontarSgsiProjetado(
      { list_key: '014', item_id: 9, created_sp: null, modified_sp: null, f0: true, f1: null, f2: ['a'] },
      ['A', 'B', 'C'],
    );
    expect(r).toEqual({ list_key: '014', item_id: 9, created_sp: null, modified_sp: null, fields: { A: true, C: ['a'] } });
  });
});
