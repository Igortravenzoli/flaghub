import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface QaReturnSummary {
  total_events: number
  open_events: number
  distinct_items: number
  distinct_items_open: number
  avg_days_open: number | null
  max_days_open: number | null
}

export interface QaReturnBySprint {
  sprint_code: string
  total_returns: number
  open_returns: number
  distinct_items: number
}

export interface QaReturnByAssignee {
  assigned_to_display: string
  assigned_to_email: string | null
  total_returns: number
  open_returns: number
  last_return_at: string | null
}

export interface QaReturnOpenItem {
  id: number
  work_item_id: number
  work_item_title: string | null
  work_item_type: string | null
  sprint_code: string | null
  assigned_to_display: string | null
  assigned_to_email: string | null
  detected_at: string
  transition_date: string | null
  days_since_return: number
  alert_status: string
  web_url: string | null
}

// ── Individual hooks ──────────────────────────────────────────────────────────

export function useQaReturnSummary(sprintCode?: string | null, areaPath?: string | null) {
  return useQuery({
    queryKey: ['qa-return-summary', sprintCode ?? null, areaPath ?? null],
    queryFn: async (): Promise<QaReturnSummary> => {
      const { data, error } = await (supabase as any).rpc('rpc_qa_return_summary', {
        p_sprint_code: sprintCode ?? null,
        p_area_path: areaPath ?? null,
      })
      if (error) throw error
      return (data ?? {
        total_events: 0,
        open_events: 0,
        distinct_items: 0,
        distinct_items_open: 0,
        avg_days_open: null,
        max_days_open: null,
      }) as QaReturnSummary
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useQaReturnBySprint() {
  return useQuery({
    queryKey: ['qa-return-by-sprint'],
    queryFn: async (): Promise<QaReturnBySprint[]> => {
      const { data, error } = await (supabase as any).rpc('rpc_qa_return_by_sprint')
      if (error) throw error
      return (data ?? []) as QaReturnBySprint[]
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useQaReturnByAssignee() {
  return useQuery({
    queryKey: ['qa-return-by-assignee'],
    queryFn: async (): Promise<QaReturnByAssignee[]> => {
      const { data, error } = await (supabase as any).rpc('rpc_qa_return_by_assignee')
      if (error) throw error
      return (data ?? []) as QaReturnByAssignee[]
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useQaReturnOpenItems() {
  return useQuery({
    queryKey: ['qa-return-open-items'],
    queryFn: async (): Promise<QaReturnOpenItem[]> => {
      const { data, error } = await (supabase as any).rpc('rpc_qa_return_open_items')
      if (error) throw error
      return (data ?? []) as QaReturnOpenItem[]
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

// ── Composite hook ────────────────────────────────────────────────────────────

export function useQaReturnKpis(sprintCode?: string | null) {
  const summary = useQaReturnSummary(sprintCode)
  const bySprint = useQaReturnBySprint()
  const byAssignee = useQaReturnByAssignee()
  const openItems = useQaReturnOpenItems()

  const isLoading =
    summary.isLoading || bySprint.isLoading || byAssignee.isLoading || openItems.isLoading
  const isError =
    summary.isError || bySprint.isError || byAssignee.isError || openItems.isError

  return {
    summary: summary.data ?? null,
    bySprint: bySprint.data ?? [],
    byAssignee: byAssignee.data ?? [],
    openItems: openItems.data ?? [],
    isLoading,
    isError,
    refetch: () => {
      void summary.refetch()
      void bySprint.refetch()
      void byAssignee.refetch()
      void openItems.refetch()
    },
  }
}
