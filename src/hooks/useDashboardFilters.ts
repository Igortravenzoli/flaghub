import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startOfMonth, endOfMonth, subDays, subMonths, startOfDay, endOfDay } from 'date-fns';

export type FilterPreset = '7d' | '30d' | 'mes_atual' | 'mes_anterior' | 'custom';

export interface DashboardFilters {
  preset: FilterPreset;
  dateFrom: Date;
  dateTo: Date;
  customField?: string; // e.g. consultor, responsavel
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
      case '7d':
        return { from: subDays(now, 7), to: endOfDay(now) };
      case '30d':
        return { from: subDays(now, 30), to: endOfDay(now) };
      case 'mes_atual':
        return { from: startOfMonth(now), to: endOfDay(now) };
      case 'mes_anterior': {
        const prev = subMonths(now, 1);
        return { from: startOfMonth(prev), to: endOfMonth(prev) };
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
      case 'mes_atual': return 'Mês atual';
      case 'mes_anterior': return 'Mês anterior';
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
