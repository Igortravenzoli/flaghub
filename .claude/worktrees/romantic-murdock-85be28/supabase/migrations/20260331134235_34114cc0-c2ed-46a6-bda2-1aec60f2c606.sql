-- Mark all PRB tickets as inactive since they are not in the new import files
-- The user imported 2 files (incident_4.json with 46 INC, sc_req_item_3.json with 18 RITM) = 64 total, no PRBs
UPDATE public.tickets
SET is_active = false, updated_at = now()
WHERE ticket_external_id LIKE 'PRB%' AND is_active = true;