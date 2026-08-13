import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { HoraNegocioRow, LinhaAgregada, Dimensao } from '@/hooks/useHorasNegocio';

/**
 * Exportação da visão financeira em CSV, Excel e PDF.
 *
 * A coluna de ORIGEM viaja em todos os três formatos de propósito. O relatório
 * sai do portal e circula fora dele; sem a procedência, um total de horas por
 * cliente vira número sem lastro na mesa do financeiro.
 */

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.style.display = 'none';
  // O anchor precisa estar no documento, e o object URL só pode ser revogado
  // depois — revogar na mesma tick cancela o download em Chromium.
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

function carimbo(): string {
  return new Date().toISOString().slice(0, 10);
}

function rotuloOrigem(origem: string | null): string {
  if (origem === 'campo') return 'Campo DevOps';
  if (origem === 'tag') return 'Tag';
  return 'Não classificado';
}

/** Linha achatada do detalhe, com cabeçalho em português para o financeiro. */
function acharDetalhe(rows: HoraNegocioRow[]) {
  return rows.map(r => ({
    'Data': r.log_date,
    'Colaborador': r.colaborador ?? '',
    'Cliente': r.cliente ?? '',
    'Origem cliente': rotuloOrigem(r.cliente_origem),
    'Cliente herdado do pai': r.cliente_herdado ? 'Sim' : 'Não',
    'Produto': r.produto ?? '',
    'Origem produto': rotuloOrigem(r.produto_origem),
    'Produto herdado do pai': r.produto_herdado ? 'Sim' : 'Não',
    'Horas': Number(r.horas.toFixed(2)),
    'Work item': r.work_item_id ?? '',
    'Tipo': r.work_item_type ?? '',
    'Título': r.work_item_title ?? '',
    'Sprint': r.sprint_code ?? '',
    'Conciliação VDESK/DevOps': r.conciliacao,
    'Classificação ambígua': r.cliente_ambiguo || r.produto_ambiguo ? 'Sim' : 'Não',
  }));
}

function acharResumo(linhas: LinhaAgregada[], dim: Dimensao) {
  const rotulo = dim === 'cliente' ? 'Cliente' : dim === 'produto' ? 'Produto' : 'Colaborador';
  return linhas.map(l => ({
    [rotulo]: l.chave,
    'Horas': Number(l.horas.toFixed(2)),
    'Horas por campo': Number(l.horasPorCampo.toFixed(2)),
    'Horas por tag': Number(l.horasPorTag.toFixed(2)),
    'Registos': l.registos,
  }));
}

export interface ContextoExport {
  dim: Dimensao;
  linhas: LinhaAgregada[];
  detalhe: HoraNegocioRow[];
  periodo: { de: string; ate: string };
}

export function exportarCsv({ dim, linhas, periodo }: ContextoExport) {
  const csv = Papa.unparse(acharResumo(linhas, dim));
  // BOM para o Excel do Windows abrir acento corretamente.
  baixar(
    new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }),
    `horas-por-${dim}-${periodo.de}-a-${periodo.ate}.csv`
  );
}

/**
 * Excel com DUAS abas: o resumo que o gestor lê e o detalhe linha a linha que
 * sustenta o resumo. Entregar só o resumo obriga o financeiro a pedir o detalhe
 * por fora na primeira divergência.
 */
export function exportarExcel({ dim, linhas, detalhe, periodo }: ContextoExport) {
  const wb = XLSX.utils.book_new();

  const wsResumo = XLSX.utils.json_to_sheet(acharResumo(linhas, dim));
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  const wsDetalhe = XLSX.utils.json_to_sheet(acharDetalhe(detalhe));
  XLSX.utils.book_append_sheet(wb, wsDetalhe, 'Detalhe');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  baixar(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `horas-por-${dim}-${periodo.de}-a-${periodo.ate}.xlsx`
  );
}

export function exportarPdf({ dim, linhas, periodo }: ContextoExport) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const rotulo = dim === 'cliente' ? 'cliente' : dim === 'produto' ? 'produto' : 'colaborador';

  const totalHoras = linhas.reduce((s, l) => s + l.horas, 0);
  const totalCampo = linhas.reduce((s, l) => s + l.horasPorCampo, 0);
  const totalTag = linhas.reduce((s, l) => s + l.horasPorTag, 0);
  const pctClassificado = totalHoras > 0
    ? Math.round(((totalCampo + totalTag) / totalHoras) * 100)
    : 0;

  doc.setFontSize(14);
  doc.text(`Horas por ${rotulo}`, 40, 48);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Período de ${periodo.de} a ${periodo.ate}`, 40, 64);
  doc.text(`Extraído em ${carimbo()}`, 40, 77);
  // O carimbo de extração não é enfeite: o FlagHub cresce com lançamento
  // retroativo, então o mesmo período reextraído semanas depois devolve outro
  // total. Sem a data, dois PDFs do mesmo período parecem se contradizer.
  doc.text(
    `${totalHoras.toFixed(1)}h no período · ${pctClassificado}% com ${rotulo} identificado`,
    40, 90
  );

  autoTable(doc, {
    startY: 106,
    head: [[
      rotulo.charAt(0).toUpperCase() + rotulo.slice(1),
      'Horas', 'Por campo', 'Por tag', 'Registos',
    ]],
    body: linhas.map(l => [
      l.chave,
      l.horas.toFixed(1),
      l.horasPorCampo.toFixed(1),
      l.horasPorTag.toFixed(1),
      String(l.registos),
    ]),
    foot: [[
      'Total',
      totalHoras.toFixed(1),
      totalCampo.toFixed(1),
      totalTag.toFixed(1),
      String(linhas.reduce((s, l) => s + l.registos, 0)),
    ]],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    // Número à direita, texto à esquerda — regra 6 do design system.
    columnStyles: {
      1: { halign: 'right' }, 2: { halign: 'right' },
      3: { halign: 'right' }, 4: { halign: 'right' },
    },
  });

  doc.save(`horas-por-${dim}-${periodo.de}-a-${periodo.ate}.pdf`);
}
