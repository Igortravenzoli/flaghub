-- SECURITY FIX: Remove anonymous read policy from tickets table
-- This policy was left from testing and exposes all ticket data to unauthenticated users

-- Drop the dangerous anonymous read policy
DROP POLICY IF EXISTS "Allow anonymous read for testing" ON public.tickets;