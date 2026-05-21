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

export interface QaReturnItem {
  id: number
  work_item_id: number
  work_item_title: string | null
  work_item_type: string | null
  sprint_code: string | null
  assigned_to_display: string | null
  assigned_to_email: string | null
  detected_at: string
  transition_date: string | null
  resolved_at: string | null
  is_open: boolean
  detection_method: string | null
  days_since_return: number
  alert_status: string
  alert_sent_at: string | null
  alert_channel_type: 'teams_1on1' | 'teams_webhook' | 'none' | null
  alert_error: string | null
  web_url: string | null
  parent_id: number | null
  parent_title: string | null
  parent_type: string | null
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

export function useQaReturnItems() {
  return useQuery({
    queryKey: ['qa-return-items'],
    queryFn: async (): Promise<QaReturnItem[]> => {
      const { data, error } = await (supabase as any).rpc('rpc_qa_return_open_items')
      if (error) throw error
      return (data ?? []) as QaReturnItem[]
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

// ── Composite hook ────────────────────────────────────────────────────────────

export function useQaReturnKpis(sprintCode?: string | null, dateFrom?: Date | null, dateTo?: Date | null) {
  const summary = useQaReturnSummary(sprintCode)
  const bySprint = useQaReturnBySprint()
  const byAssignee = useQaReturnByAssignee()
  const itemsQuery = useQaReturnItems()

  const itemsScoped = (() => {
    const items = itemsQuery.data ?? []

    const sprintFiltered = sprintCode
      ? items.filter((item) => (item.sprint_code || '').trim().toLowerCase() === sprintCode.trim().toLowerCase())
      : items

    if (!dateFrom || !dateTo) return sprintFiltered

    const from = new Date(dateFrom)
    from.setHours(0, 0, 0, 0)
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)

    return sprintFiltered.filter((item) => {
      const ref = item.transition_date ?? item.detected_at
      if (!ref) return false
      const dt = new Date(ref)
      if (Number.isNaN(dt.getTime())) return false
      return dt >= from && dt <= to
    })
  })()

  const openItemsScoped = itemsScoped.filter((item) => item.is_open)
  const closedItemsScoped = itemsScoped.filter((item) => !item.is_open)

  const isLoading =
    summary.isLoading || bySprint.isLoading || byAssignee.isLoading || itemsQuery.isLoading
  const isError =
    summary.isError || bySprint.isError || byAssignee.isError || itemsQuery.isError

  return {
    summary: summary.data ?? null,
    bySprint: bySprint.data ?? [],
    byAssignee: byAssignee.data ?? [],
    items: itemsScoped,
    openItems: openItemsScoped,
    closedItems: closedItemsScoped,
    isLoading,
    isError,
    refetch: () => {
      void summary.refetch()
      void bySprint.refetch()
      void byAssignee.refetch()
      void itemsQuery.refetch()
    },
  }
}
