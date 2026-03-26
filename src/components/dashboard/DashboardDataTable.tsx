import { useState, useMemo, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search, Filter, X } from 'lucide-react';

export interface ColumnFilter {
  key: string;
  label: string;
  /** Extract the filterable value(s) from a row. Defaults to row[key]. Return string or string[] for multi-value cells. */
  extractValue?: (row: any) => string | string[] | null;
}

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DashboardDataTableProps<T> {
  title?: string;
  subtitle?: string;
  columns: DataTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  pageSize?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  getRowKey: (row: T) => string | number;
  emptyMessage?: string;
  /** Column filters configuration — enables multi-select filter dropdowns */
  columnFilters?: ColumnFilter[];
  /** Disable automatic filters for all columns when no explicit config is provided */
  disableAutoColumnFilters?: boolean;
}

function MultiSelectFilter({
  filter,
  options,
  selected,
  onToggle,
  onClear,
}: {
  filter: ColumnFilter;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [filterSearch, setFilterSearch] = useState('');
  const hasSelection = selected.size > 0;

  const filteredOptions = useMemo(() => {
    if (!filterSearch) return options;
    const q = filterSearch.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, filterSearch]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={hasSelection ? 'default' : 'ghost'}
          size="sm"
          className={`h-6 px-1.5 text-[10px] gap-1 ${hasSelection ? 'bg-primary/90 text-primary-foreground' : 'text-muted-foreground'}`}
        >
          <Filter className="h-3 w-3" />
          {hasSelection && <span>{selected.size}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start" side="bottom">
        <div className="p-2 border-b border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-foreground">{filter.label}</span>
            {hasSelection && (
              <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-muted-foreground" onClick={onClear}>
                <X className="h-3 w-3 mr-0.5" /> Limpar
              </Button>
            )}
          </div>
          {options.length > 8 && (
            <Input
              placeholder="Filtrar..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="h-7 text-xs"
            />
          )}
        </div>
        <ScrollArea className="max-h-52">
          <div className="p-1.5 space-y-0.5">
            {filteredOptions.map(option => (
              <label
                key={option}
                className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted/50 cursor-pointer text-xs"
              >
                <Checkbox
                  checked={selected.has(option)}
                  onCheckedChange={() => onToggle(option)}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">{option}</span>
              </label>
            ))}
            {filteredOptions.length === 0 && (
              <span className="text-xs text-muted-foreground px-2 py-1">Nenhum resultado</span>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function DashboardDataTable<T extends Record<string, any>>({
  title,
  subtitle,
  columns,
  data,
  isLoading,
  pageSize = 20,
  searchable = true,
  searchPlaceholder = 'Buscar...',
  onRowClick,
  getRowKey,
  emptyMessage = 'Nenhum dado encontrado',
  columnFilters = [],
  disableAutoColumnFilters = false,
}: DashboardDataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({});

  const effectiveColumnFilters = useMemo<ColumnFilter[]>(() => {
    if (columnFilters.length > 0 || disableAutoColumnFilters) {
      return columnFilters;
    }

    return columns.map((c) => ({
      key: c.key,
      label: c.header,
    }));
  }, [columnFilters, columns, disableAutoColumnFilters]);

  // Build unique options per column filter
  const filterOptions = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const cf of effectiveColumnFilters) {
      const values = new Set<string>();
      for (const row of data) {
        const extractor = cf.extractValue || ((r: any) => r[cf.key]);
        const val = extractor(row);
        if (val == null) continue;
        if (Array.isArray(val)) {
          val.forEach(v => { if (v != null) values.add(String(v)); });
        } else {
          values.add(String(val));
        }
      }
      result[cf.key] = [...values].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    }
    return result;
  }, [data, effectiveColumnFilters]);

  const toggleFilter = useCallback((key: string, value: string) => {
    setActiveFilters(prev => {
      const current = new Set(prev[key] || []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      return { ...prev, [key]: current };
    });
    setPage(0);
  }, []);

  const clearFilter = useCallback((key: string) => {
    setActiveFilters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPage(0);
  }, []);

  // Apply column filters
  const columnFiltered = useMemo(() => {
    const activeKeys = Object.entries(activeFilters).filter(([, s]) => s.size > 0);
    if (activeKeys.length === 0) return data;

    return data.filter(row => {
      return activeKeys.every(([key, selectedValues]) => {
        const cf = effectiveColumnFilters.find(f => f.key === key);
        if (!cf) return true;
        const extractor = cf.extractValue || ((r: any) => r[cf.key]);
        const val = extractor(row);
        if (val == null) return false;
        if (Array.isArray(val)) {
          return val.some(v => selectedValues.has(v));
        }
        return selectedValues.has(val);
      });
    });
  }, [data, activeFilters, effectiveColumnFilters]);

  // Apply text search
  const filtered = useMemo(() => {
    if (!search) return columnFiltered;
    const q = search.toLowerCase();
    return columnFiltered.filter(row =>
      columns.some(col => {
        const val = row[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [columnFiltered, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const sa = typeof va === 'string' ? va : String(va);
      const sb = typeof vb === 'string' ? vb : String(vb);
      const cmp = sa.localeCompare(sb, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Active filter badges
  const activeFilterBadges = Object.entries(activeFilters)
    .filter(([, s]) => s.size > 0)
    .flatMap(([key, values]) => {
      const cf = effectiveColumnFilters.find(f => f.key === key);
      return [...values].map(v => ({ key, value: v, label: cf?.label || key }));
    });

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        {title && (
          <div className="p-4 border-b border-border">
            <Skeleton className="h-5 w-40" />
          </div>
        )}
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden animate-fade-in">
      {(title || searchable) && (
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            {title && <h3 className="font-semibold text-foreground text-sm">{title}</h3>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {searchable && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-8 h-8 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Active filter badges */}
      {activeFilterBadges.length > 0 && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-muted-foreground mr-1">Filtros:</span>
          {activeFilterBadges.map(({ key, value, label }) => (
            <Badge
              key={`${key}-${value}`}
              variant="secondary"
              className="text-[10px] h-5 px-2 gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => toggleFilter(key, value)}
            >
              {value}
              <X className="h-2.5 w-2.5" />
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px] text-muted-foreground"
            onClick={() => setActiveFilters({})}
          >
            Limpar todos
          </Button>
        </div>
      )}

      <div className="overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {columns.map(col => {
                const cf = effectiveColumnFilters.find(f => f.key === col.key);
                return (
                  <TableHead
                    key={col.key}
                    className={`text-xs font-semibold ${col.sortable !== false ? 'cursor-pointer select-none hover:text-foreground' : ''} ${col.className || ''}`}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      <span>
                        {col.header}
                        {sortKey === col.key && (
                          <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </span>
                      {cf && (
                        <span onClick={e => e.stopPropagation()}>
                          <MultiSelectFilter
                            filter={cf}
                            options={filterOptions[cf.key] || []}
                            selected={activeFilters[cf.key] || new Set()}
                            onToggle={(v) => toggleFilter(cf.key, v)}
                            onClear={() => clearFilter(cf.key)}
                          />
                        </span>
                      )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground text-sm">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paged.map(row => (
                <TableRow
                  key={getRowKey(row)}
                  className={`hover:bg-muted/30 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map(col => (
                    <TableCell key={col.key} className={`text-sm ${col.className || ''}`}>
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {sorted.length > pageSize && (
        <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>{sorted.length} registros • Página {page + 1} de {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
