-- Add unique constraint on nome for proper deduplication
-- First, remove duplicates keeping the latest synced_at
DELETE FROM vdesk_clients a
USING vdesk_clients b
WHERE a.id < b.id AND a.nome = b.nome;

-- Add unique index on nome
CREATE UNIQUE INDEX IF NOT EXISTS idx_vdesk_clients_nome_unique ON vdesk_clients (nome);