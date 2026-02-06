import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { EstatisticasDashboard, TicketConsolidado } from '@/types';

interface DashboardExportProps {
  estatisticas: EstatisticasDashboard;
  tickets: TicketConsolidado[];
  filterLabel?: string;
}

function buildExportData(tickets: TicketConsolidado[]) {
  return tickets.map(t => ({
    'Ticket': t.ticket.number,
    'Descrição': t.ticket.short_description,
    'Status': t.ticket.state,
    'Tipo': t.ticket.type === 'incident' ? 'Incidente' : 'Requisição',
    'Responsável': t.ticket.assigned_to,
    'OS Vinculada': t.osVinculada?.os || 'Sem OS',
    'Severidade': t.severidade === 'critical' ? 'Crítico' : t.severidade === 'warning' ? 'Atenção' : t.severidade === 'info' ? 'Info' : 'OK',
    'Abertura': t.ticket.opened_at,
    'Inconsistências': t.inconsistencias.join('; '),
  }));
}

async function exportToPDF(estatisticas: EstatisticasDashboard, tickets: TicketConsolidado[], filterLabel?: string) {
  try {
    const { default: jsPDF } = await import('jspdf');
    const { autoTable } = await import('jspdf-autotable');
    
    const doc = new jsPDF({ orientation: 'landscape' });
    const now = new Date().toLocaleString('pt-BR');
    
    // Header
    doc.setFontSize(18);
    doc.text(filterLabel ? `Relatório: ${filterLabel}` : 'Relatório do Dashboard', 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${now}`, 14, 30);
    
    // Estatísticas
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('Resumo', 14, 42);
    
    const statsData = [
      ['Total de Tickets', String(estatisticas.totalTickets)],
      ['Tickets OK', String(estatisticas.ticketsOK)],
      ['Sem OS', String(estatisticas.ticketsSemOS)],
      ['Em Observação', String(estatisticas.ticketsObservacao)],
    ];
    
    autoTable(doc, {
      startY: 46,
      head: [['Métrica', 'Valor']],
      body: statsData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14 },
      tableWidth: 100,
    });
    
    // Tabela de tickets
    const finalY = (doc as any).lastAutoTable?.finalY || 80;
    doc.text('Detalhamento de Tickets', 14, finalY + 12);
    
    const rows = buildExportData(tickets);
    const headers = Object.keys(rows[0] || {});
    const body = rows.map(r => headers.map(h => (r as any)[h]));
    
    autoTable(doc, {
      startY: finalY + 16,
      head: [headers],
      body,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      margin: { left: 14 },
    });
    
    doc.save(`dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('PDF exportado com sucesso');
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    toast.error('Erro ao gerar PDF');
  }
}

async function exportToExcel(estatisticas: EstatisticasDashboard, tickets: TicketConsolidado[]) {
  try {
    const XLSX = await import('xlsx');
    
    const wb = XLSX.utils.book_new();
    
    // Aba de resumo
    const summaryData = [
      { Métrica: 'Total de Tickets', Valor: estatisticas.totalTickets },
      { Métrica: 'Tickets OK', Valor: estatisticas.ticketsOK },
      { Métrica: 'Sem OS', Valor: estatisticas.ticketsSemOS },
      { Métrica: 'Em Observação', Valor: estatisticas.ticketsObservacao },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');
    
    // Aba de tickets
    const rows = buildExportData(tickets);
    if (rows.length > 0) {
      const wsTickets = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, wsTickets, 'Tickets');
    }
    
    XLSX.writeFile(wb, `dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel exportado com sucesso');
  } catch (err) {
    console.error('Erro ao gerar Excel:', err);
    toast.error('Erro ao gerar Excel');
  }
}

export function DashboardExport({ estatisticas, tickets, filterLabel }: DashboardExportProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Exportar{filterLabel ? ` (${filterLabel})` : ''}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportToPDF(estatisticas, tickets, filterLabel)}>
          <FileText className="h-4 w-4 mr-2" />
          Exportar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportToExcel(estatisticas, tickets)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Exportar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
