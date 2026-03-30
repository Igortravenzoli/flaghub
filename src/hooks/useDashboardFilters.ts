import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startOfMonth, endOfMonth, subDays, subMonths, startOfDay, endOfDay, subYears } from 'date-fns';

export type FilterPreset = 'hoje' | '7d' | '30d' | '90d' | '6m' | 'mes_atual' | 'mes_anterior' | '1y' | 'all' | 'custom' | 'q1' | 'q2' | 'q3' | 'q4';

export interface DashboardFilters {
  preset: FilterPreset;
  dateFrom: Date;
  dateTo: Date;
  customField?: string;
}

export function useDashboardFilters(defaultPreset: FilterPreset = 'mes_atual') {
  const [searchParams, setSearchParams] = useSearchParams();

  const presetFromUrl = (searchParams.get('preset') as FilterPreset) || defaultPreset;

  const [preset, setPresetState] = useState<FilterPreset>(presetFromUrl);
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);

  const dates = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case 'hoje':
        return { from: startOfDay(now), to: endOfDay(now) };
      case '7d':
        return { from: subDays(now, 7), to: endOfDay(now) };
      case '30d':
        return { from: subDays(now, 30), to: endOfDay(now) };
      case '90d':
        return { from: subDays(now, 90), to: endOfDay(now) };
      case '6m':
        return { from: subMonths(now, 6), to: endOfDay(now) };
      case 'mes_atual':
        return { from: startOfMonth(now), to: endOfDay(now) };
      case 'mes_anterior': {
        const prev = subMonths(now, 1);
        return { from: startOfMonth(prev), to: endOfMonth(prev) };
      }
      case '1y':
        return { from: subYears(now, 1), to: endOfDay(now) };
      case 'all':
        // 10 years back — effectively "all data"
        return { from: subYears(now, 10), to: endOfDay(now) };
      case 'q1': {
        const y = now.getFullYear();
        return { from: new Date(y, 0, 1), to: endOfDay(new Date(y, 2, 31)) };
      }
      case 'q2': {
        const y = now.getFullYear();
        return { from: new Date(y, 3, 1), to: endOfDay(new Date(y, 5, 30)) };
      }
      case 'q3': {
        const y = now.getFullYear();
        return { from: new Date(y, 6, 1), to: endOfDay(new Date(y, 8, 30)) };
      }
      case 'q4': {
        const y = now.getFullYear();
        return { from: new Date(y, 9, 1), to: endOfDay(new Date(y, 11, 31)) };
      }
      case 'custom':
        return {
          from: customFrom || subDays(now, 30),
          to: customTo || endOfDay(now),
        };
      default:
        return { from: startOfMonth(now), to: endOfDay(now) };
    }
  }, [preset, customFrom, customTo]);

  const setPreset = useCallback((p: FilterPreset) => {
    setPresetState(p);
    setSearchParams(prev => {
      prev.set('preset', p);
      return prev;
    });
  }, [setSearchParams]);

  const setCustomRange = useCallback((from: Date, to: Date) => {
    setCustomFrom(from);
    setCustomTo(to);
    setPresetState('custom');
    setSearchParams(prev => {
      prev.set('preset', 'custom');
      return prev;
    });
  }, [setSearchParams]);

  const presetLabel = useMemo(() => {
    switch (preset) {
      case '7d': return 'Últimos 7 dias';
      case '30d': return 'Últimos 30 dias';
      case '90d': return 'Últimos 90 dias';
      case '6m': return 'Últimos 6 meses';
      case 'mes_atual': return 'Mês atual';
      case 'mes_anterior': return 'Mês anterior';
      case '1y': return 'Último ano';
      case 'all': return 'Todos';
      case 'q1': return '1º Trimestre';
      case 'q2': return '2º Trimestre';
      case 'q3': return '3º Trimestre';
      case 'q4': return '4º Trimestre';
      case 'custom': return 'Personalizado';
      default: return preset;
    }
  }, [preset]);

  return {
    preset,
    setPreset,
    dateFrom: dates.from,
    dateTo: dates.to,
    setCustomRange,
    presetLabel,
  };
}
