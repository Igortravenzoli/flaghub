import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Download, FileText, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FilterPreset } from '@/hooks/useDashboardFilters';
import type { DateRange } from 'react-day-picker';

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
  dateFrom?: Date;
  dateTo?: Date;
  onCustomRange?: (from: Date, to: Date) => void;
  presetControl?: 'chips' | 'dropdown';
  presetsLabel?: string;
  minDate?: Date;
  maxDate?: Date;
  showRangeBadge?: boolean;
}

const DEFAULT_PRESETS: Array<{ value: FilterPreset; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '6m', label: '6m' },
  { value: 'mes_atual', label: 'Mês' },
  { value: 'mes_anterior', label: 'Mês ant.' },
  { value: '1y', label: '1 ano' },
  { value: 'all', label: 'Todos' },
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
  dateFrom,
  dateTo,
  onCustomRange,
  presetControl = 'chips',
  presetsLabel = 'Período',
  minDate,
  maxDate,
  showRangeBadge = true,
}: FilterBarProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isKiosk = typeof document !== 'undefined' && document.querySelector('[data-kiosk="true"]') !== null;
  const [range, setRange] = useState<DateRange | undefined>(
    dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined
  );

  const handleRangeSelect = (selected: DateRange | undefined) => {
    setRange(selected);
    if (selected?.from && selected?.to && onCustomRange) {
      onCustomRange(selected.from, selected.to);
      setCalendarOpen(false);
    }
  };

  const isCustom = preset === 'custom';
  const maxAllowed = maxDate || new Date();
  const disabledDays = {
    ...(minDate ? { before: minDate } : {}),
    after: maxAllowed,
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Period presets */}
      {!isKiosk && (presetControl === 'chips' ? (
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-1 overflow-x-auto">
          {presets.map(p => (
            <Button
              key={p.value}
              variant={preset === p.value ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2.5 whitespace-nowrap"
              onClick={() => onPresetChange(p.value)}
            >
              {p.label}
            </Button>
          ))}

          {onCustomRange && (
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={isCustom ? 'default' : 'ghost'}
                  size="sm"
                  className={cn('h-7 text-xs gap-1.5 px-2.5')}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {isCustom && dateFrom && dateTo
                    ? `${format(dateFrom, 'dd/MM', { locale: ptBR })} – ${format(dateTo, 'dd/MM', { locale: ptBR })}`
                    : 'Custom'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={handleRangeSelect}
                  numberOfMonths={2}
                  locale={ptBR}
                  disabled={disabledDays}
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {presets.length > 0 && (
            <Select
              value={preset}
              onValueChange={(v) => {
                const value = v as FilterPreset;
                if (value === 'custom') {
                  onPresetChange('custom');
                  setCalendarOpen(true);
                  return;
                }
                onPresetChange(value);
              }}
            >
              <SelectTrigger className="w-[170px] h-8 text-xs">
                <SelectValue placeholder={presetsLabel} />
              </SelectTrigger>
              <SelectContent>
                {presets.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
                {onCustomRange && <SelectItem value="custom">Custom</SelectItem>}
              </SelectContent>
            </Select>
          )}

          {onCustomRange && (
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={isCustom ? 'default' : 'outline'}
                  size="sm"
                  className={cn('h-8 text-xs gap-1.5 px-2.5')}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {isCustom && dateFrom && dateTo
                    ? `${format(dateFrom, 'dd/MM', { locale: ptBR })} – ${format(dateTo, 'dd/MM', { locale: ptBR })}`
                    : 'Custom'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={handleRangeSelect}
                  numberOfMonths={2}
                  locale={ptBR}
                  disabled={disabledDays}
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      ))}

      <div className="flex-1" />

      {showRangeBadge && dateFrom && dateTo && (
        <Badge variant="secondary" className="text-xs">
          Intervalo: {format(dateFrom, 'dd/MM/yyyy', { locale: ptBR })} a {format(dateTo, 'dd/MM/yyyy', { locale: ptBR })}
        </Badge>
      )}

      {/* Last sync */}
      {lastSync && (
        <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          Sync: {lastSync}
        </Badge>
      )}

      {/* Refresh */}
      {onRefresh && !isKiosk && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      )}

      {/* Export */}
      {(onExportCSV || onExportPDF) && !isKiosk && (
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
