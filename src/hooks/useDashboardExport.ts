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
}

export function useDashboardExport() {
  const exportCSV = useCallback((config: ExportConfig) => {
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

      const csv = [...header.filter(Boolean), csvHeader, ...csvRows].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.area.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exportado com sucesso');
    } catch {
      toast.error('Erro ao exportar CSV');
    }
  }, []);

  const exportPDF = useCallback(async (config: ExportConfig) => {
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
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text('Dados', 14, startY);
        autoTable(doc, {
          startY: startY + 4,
          head: [config.columns],
          body: config.rows.map(row => config.columns.map(col => String(row[col] ?? ''))),
          theme: 'striped',
          headStyles: { fillColor: [30, 64, 175], fontSize: 7 },
          bodyStyles: { fontSize: 7 },
          margin: { left: 14 },
        });
      }

      doc.save(`${config.area.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('PDF exportado com sucesso');
    } catch {
      toast.error('Erro ao exportar PDF');
    }
  }, []);

  return { exportCSV, exportPDF };
}
