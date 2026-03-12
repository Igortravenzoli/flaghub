import { Button } from '@/components/ui/button';
import { Calendar, Download, FileText, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { FilterPreset } from '@/hooks/useDashboardFilters';

interface FilterBarProps {
  preset: FilterPreset;
  onPresetChange: (preset: FilterPreset) => void;
  presetLabel: string;
  presets?: Array<{ value: FilterPreset; label: string }>;
  lastSync?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
}

const DEFAULT_PRESETS: Array<{ value: FilterPreset; label: string }> = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'mes_atual', label: 'Mês atual' },
  { value: 'mes_anterior', label: 'Mês anterior' },
];

export function DashboardFilterBar({
  preset,
  onPresetChange,
  presetLabel,
  presets = DEFAULT_PRESETS,
  lastSync,
  onRefresh,
  isRefreshing,
  onExportCSV,
  onExportPDF,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Period presets */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
        {presets.map(p => (
          <Button
            key={p.value}
            variant={preset === p.value ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onPresetChange(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Last sync */}
      {lastSync && (
        <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
          <Calendar className="h-3 w-3" />
          Sync: {lastSync}
        </Badge>
      )}

      {/* Refresh */}
      {onRefresh && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      )}

      {/* Export */}
      {(onExportCSV || onExportPDF) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onExportCSV && (
              <DropdownMenuItem onClick={onExportCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
            )}
            {onExportPDF && (
              <DropdownMenuItem onClick={onExportPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Exportar PDF
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
