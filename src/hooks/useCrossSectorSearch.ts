import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CrossSectorResult {
  workItemId: number;
  title: string | null;
  state: string | null;
  iterationPath: string | null;
  sector: string | null;
  sectorLabel: string;
  sectorPath: string;
  webUrl: string | null;
}

const SECTOR_MAP: Record<string, { label: string; path: string }> = {
  fabrica: { label: 'Fábrica', path: '/setor/fabrica' },
  qualidade: { label: 'Qualidade', path: '/setor/qualidade' },
  infraestrutura: { label: 'Infraestrutura', path: '/setor/infraestrutura' },
  customer_service: { label: 'Customer Service', path: '/setor/customer-service' },
  comercial: { label: 'Comercial', path: '/setor/comercial' },
  produtos: { label: 'Produtos', path: '/setor/produtos' },
};

/**
 * Searches for a work item by numeric ID across all sectors.
 * Returns info about where the item lives if not found in `currentSectorKey`.
 * Only triggers for numeric search terms (PBI IDs).
 */
export function useCrossSectorSearch(
  searchTerm: string,
  currentSectorKey: string,
  localItemIds: number[],
) {
  const [result, setResult] = useState<CrossSectorResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const q = searchTerm.trim();
    if (!q || !/^\d+$/.test(q)) {
      setResult(null);
      return;
    }

    const searchId = Number(q);

    // If item exists locally, no need to cross-search
    if (localItemIds.includes(searchId)) {
      setResult(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // 1) Find the work item
        const { data: wi } = await supabase
          .from('devops_work_items')
          .select('id, title, state, iteration_path, web_url')
          .eq('id', searchId)
          .maybeSingle();

        if (!wi || cancelled) {
          if (!cancelled) setResult(null);
          return;
        }

        // 2) Find which query (and sector) contains this item
        const { data: qItems } = await supabase
          .from('devops_query_items_current')
          .select('query_id')
          .eq('work_item_id', searchId);

        let sector: string | null = null;
        if (qItems && qItems.length > 0) {
          const queryIds = qItems.map(qi => qi.query_id);
          const { data: queries } = await supabase
            .from('devops_queries')
            .select('sector')
            .in('id', queryIds)
            .not('sector', 'is', null);

          if (queries && queries.length > 0) {
            // Prefer a sector different from the current one
            const otherSector = queries.find(q => q.sector !== currentSectorKey);
            sector = otherSector?.sector || queries[0].sector;
          }
        }

        if (cancelled) return;

        // If item is in the same sector, don't show cross-sector banner
        // (sprint auto-switch should handle it)
        if (sector === currentSectorKey) {
          setResult(null);
          return;
        }

        const sectorInfo = sector ? SECTOR_MAP[sector] : null;

        setResult({
          workItemId: wi.id,
          title: wi.title,
          state: wi.state,
          iterationPath: wi.iteration_path,
          sector,
          sectorLabel: sectorInfo?.label || sector || 'Setor desconhecido',
          sectorPath: sectorInfo?.path || '/home',
          webUrl: wi.web_url,
        });
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 400); // debounce

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm, currentSectorKey, localItemIds]);

  return { crossSectorResult: result, isCrossSectorSearching: isSearching };
}
