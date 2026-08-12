import { useCallback } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ExportConfig {
  title: string;
  area: string;
  periodLabel?: string;
  kpis?: Array<{ label: string; value: string | number }>;
  columns: string[];
  rows: Record<string, unknown>[];
  /**
   * Subconjunto de `columns` para o PDF. O CSV leva tudo; o PDF não cabe.
   * Sem isto, 15 colunas viravam faixas de 1 caractere com o título na vertical.
   */
  pdfColumns?: string[];
  /** Cabeçalho legível por coluna (`dia_trabalhado` → "Dia trabalhado"). */
  columnLabels?: Record<string, string>;
  /** Coluna → coluna que guarda a URL. No PDF a célula vira link clicável. */
  pdfLinks?: Record<string, string>;
  /** Largura relativa por coluna no PDF (peso; o resto divide o que sobra). */
  pdfColumnWidths?: Record<string, number>;
}

/**
 * Sem linhas não há relatório. Antes o export "funcionava": baixava um CSV só com
 * cabeçalho / um PDF só com o resumo e avisava "exportado com sucesso" — para o
 * gestor isso é indistinguível de estar quebrado. Agora diz o que houve.
 */
function semDados(area: string, title: string): boolean {
  toast.error('Nada para exportar', {
    description: `${area} — ${title}: o filtro atual não retornou nenhuma linha. Ajuste período, sprint ou colaborador e tente de novo.`,
  });
  return true;
}

function nomeArquivo(config: ExportConfig, ext: string): string {
  const slug = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${slug(config.area)}-${slug(config.title)}-${format(new Date(), 'yyyy-MM-dd')}.${ext}`;
}

/**
 * Download de blob. O anchor PRECISA estar no documento e o object URL só pode
 * ser revogado depois — revogar na mesma tick cancelava o download em Chromium,
 * que é o "exportar não faz nada" relatado pelo gestor.
 */
function baixarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export function useDashboardExport() {
  const exportCSV = useCallback((config: ExportConfig) => {
    if (!config.rows.length) return void semDados(config.area, config.title);
    try {
      const now = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });
      const header = [`# ${config.area} — ${config.title}`, `# Gerado em: ${now}`, config.periodLabel ? `# Período: ${config.periodLabel}` : '', ''];

      const csvHeader = config.columns.join(',');
      const csvRows = config.rows.map(row =>
        config.columns.map(col => {
          const val = row[col];
          const str = val == null ? '' : String(val);
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(',')
      );

      const csv = [...header.filter(Boolean), csvHeader, ...csvRows].join('\r\n');
      baixarBlob(
        new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }),
        nomeArquivo(config, 'csv'),
      );
      toast.success('CSV exportado', { description: `${config.rows.length} linhas` });
    } catch (err) {
      console.error('[export] CSV falhou', err);
      toast.error('Erro ao exportar CSV', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const exportPDF = useCallback(async (config: ExportConfig) => {
    if (!config.rows.length) return void semDados(config.area, config.title);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape' });
      const now = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

      // Header
      doc.setFontSize(16);
      doc.text(`${config.area} — ${config.title}`, 14, 18);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${now}`, 14, 25);
      if (config.periodLabel) {
        doc.text(`Período: ${config.periodLabel}`, 14, 30);
      }

      let startY = config.periodLabel ? 36 : 32;

      // KPIs summary
      if (config.kpis && config.kpis.length > 0) {
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('Resumo', 14, startY);
        autoTable(doc, {
          startY: startY + 4,
          head: [['Indicador', 'Valor']],
          body: config.kpis.map(k => [k.label, String(k.value)]),
          theme: 'grid',
          headStyles: { fillColor: [30, 64, 175] },
          margin: { left: 14 },
          tableWidth: 120,
        });
        startY = (doc as any).lastAutoTable?.finalY + 8 || startY + 40;
      }

      // Data table
      if (config.rows.length > 0) {
        const cols = config.pdfColumns?.length ? config.pdfColumns : config.columns;
        const larguraUtil = doc.internal.pageSize.getWidth() - 28; // margens de 14
        const pesos = cols.map((c) => config.pdfColumnWidths?.[c] ?? 1);
        const somaPesos = pesos.reduce((s, p) => s + p, 0) || 1;

        const columnStyles: Record<number, Record<string, unknown>> = {};
        cols.forEach((c, i) => {
          columnStyles[i] = {
            cellWidth: (larguraUtil * pesos[i]) / somaPesos,
            // links e números não devem quebrar no meio
            halign: config.pdfLinks?.[c] ? 'left' : undefined,
          };
        });

        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('Dados', 14, startY);
        autoTable(doc, {
          startY: startY + 4,
          head: [cols.map((c) => config.columnLabels?.[c] ?? c)],
          body: config.rows.map(row => cols.map(col => String(row[col] ?? ''))),
          theme: 'striped',
          headStyles: { fillColor: [30, 64, 175], fontSize: 7, cellPadding: 1.6, valign: 'middle' },
          bodyStyles: { fontSize: 6.5, cellPadding: 1.4, overflow: 'linebreak', valign: 'top' },
          columnStyles,
          margin: { left: 14, right: 14 },
          // Célula de link vira azul e clicável, apontando para a coluna de URL.
          didDrawCell: (data: any) => {
            if (data.section !== 'body') return;
            const col = cols[data.column.index];
            const urlCol = config.pdfLinks?.[col];
            if (!urlCol) return;
            const url = String(config.rows[data.row.index]?.[urlCol] ?? '');
            if (!url) return;
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
          },
          willDrawCell: (data: any) => {
            if (data.section !== 'body') return;
            const col = cols[data.column.index];
            if (config.pdfLinks?.[col] && String(data.cell.raw ?? '')) {
              doc.setTextColor(30, 64, 175);
            }
          },
        });
      }

      doc.save(nomeArquivo(config, 'pdf'));
      toast.success('PDF exportado', { description: `${config.rows.length} linhas` });
    } catch (err) {
      console.error('[export] PDF falhou', err);
      toast.error('Erro ao exportar PDF', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  return { exportCSV, exportPDF };
}
