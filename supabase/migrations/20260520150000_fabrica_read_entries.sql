-- ============================================================================
-- Migration: 20260520150000_fabrica_read_entries.sql
-- Create table to persist read/unread state for Fábrica dashboard entries
-- Global state: not per-user, shared across all browsers
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fabrica_read_entries (
  work_item_id INTEGER PRIMARY KEY,
  is_read BOOLEAN NOT NULL DEFAULT false,
  marked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT fk_work_item_id FOREIGN KEY (work_item_id)
    REFERENCES public.vw_fabrica_kpis(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fabrica_read_entries_is_read 
ON public.fabrica_read_entries(is_read);

-- Create index for ordered queries
CREATE INDEX IF NOT EXISTS idx_fabrica_read_entries_updated_at 
ON public.fabrica_read_entries(updated_at DESC);

-- Enable RLS but allow public read (no authentication needed for dashboard)
ALTER TABLE public.fabrica_read_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to SELECT
CREATE POLICY "Allow public read" ON public.fabrica_read_entries
  FOR SELECT USING (true);

-- Policy: Allow INSERT/UPDATE (public, not authenticated)
CREATE POLICY "Allow public insert update" ON public.fabrica_read_entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update" ON public.fabrica_read_entries
  FOR UPDATE USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.fabrica_read_entries TO anon;
GRANT SELECT, INSERT, UPDATE ON public.fabrica_read_entries TO authenticated;
