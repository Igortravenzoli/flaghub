// Tipos derivados do banco de dados Supabase

// ENUMS
export type AppRole = 'operacional' | 'gestao' | 'qualidade' | 'admin';
export type InternalStatus = 'novo' | 'em_atendimento' | 'em_analise' | 'finalizado' | 'cancelado';
export type TicketSeverity = 'critico' | 'atencao' | 'info';

// Network (Rede/Cliente)
export interface Network {
  id: number;
  name: string;
  created_at: string;
}

// Profile de usuário
export interface Profile {
  user_id: string;
  full_name: string | null;
  network_id: number | null;
  created_at: string;
}

// Role de usuário (tabela separada)
export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

// Mapeamento de status
export interface StatusMapping {
  id: number;
  network_id: number;
  external_status: string;
  internal_status: InternalStatus;
  is_active: boolean;
  created_at: string;
}

// Import
export interface Import {
  id: number;
  network_id: number;
  imported_by: string;
  file_name: string;
  file_type: 'json' | 'csv';
  file_hash: string;
  status: 'processing' | 'success' | 'error';
  total_records: number;
  errors_count: number;
  warnings_count: number;
  created_at: string;
}

// Import Event (log)
export interface ImportEvent {
  id: number;
  import_id: number;
  level: 'info' | 'warning' | 'error';
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

// Ticket do banco
export interface DBTicket {
  id: number;
  network_id: number;
  ticket_external_id: string;
  ticket_type: string | null;
  opened_at: string | null;
  external_status: string | null;
  internal_status: InternalStatus | null;
  assigned_to: string | null;
  os_number: string | null;
  has_os: boolean;
  os_found_in_vdesk: boolean | null;
  inconsistency_code: string | null;
  severity: TicketSeverity;
  raw_payload: Record<string, unknown>;
  last_os_event_at: string | null;
  last_os_event_desc: string | null;
  last_import_id: number | null;
  created_at: string;
  updated_at: string;
}

// Settings por network
export interface Settings {
  network_id: number;
  no_os_grace_hours: number;
  created_at: string;
  updated_at: string;
}

// Dashboard Summary (view)
export interface DashboardSummary {
  network_id: number;
  total_tickets: number;
  tickets_ok: number;
  tickets_criticos: number;
  tickets_atencao: number;
  tickets_sem_os: number;
  last_updated: string | null;
}

// Tipos para compatibilidade com a UI existente
// Mapeamento de severidade DB -> UI
export const severityMap = {
  critico: 'critical',
  atencao: 'warning',
  info: 'info',
} as const;

// Mapeamento de status interno DB -> UI  
export const statusMap = {
  novo: 'novo',
  em_atendimento: 'em_andamento',
  em_analise: 'aguardando',
  finalizado: 'resolvido',
  cancelado: 'fechado',
} as const;
