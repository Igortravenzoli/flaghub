export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      domain_network_mapping: {
        Row: {
          created_at: string | null
          default_role: Database["public"]["Enums"]["app_role"] | null
          email_domain: string
          id: number
          network_id: number | null
        }
        Insert: {
          created_at?: string | null
          default_role?: Database["public"]["Enums"]["app_role"] | null
          email_domain: string
          id?: number
          network_id?: number | null
        }
        Update: {
          created_at?: string | null
          default_role?: Database["public"]["Enums"]["app_role"] | null
          email_domain?: string
          id?: number
          network_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_network_mapping_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          batch_name: string | null
          clear_before_import: boolean | null
          completed_at: string | null
          created_at: string | null
          errors_count: number | null
          id: number
          imported_by: string
          network_id: number
          notes: string | null
          status: string | null
          total_files: number | null
          total_records: number | null
          warnings_count: number | null
        }
        Insert: {
          batch_name?: string | null
          clear_before_import?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          errors_count?: number | null
          id?: number
          imported_by: string
          network_id: number
          notes?: string | null
          status?: string | null
          total_files?: number | null
          total_records?: number | null
          warnings_count?: number | null
        }
        Update: {
          batch_name?: string | null
          clear_before_import?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          errors_count?: number | null
          id?: number
          imported_by?: string
          network_id?: number
          notes?: string | null
          status?: string | null
          total_files?: number | null
          total_records?: number | null
          warnings_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      import_events: {
        Row: {
          created_at: string
          id: number
          import_id: number
          level: string
          message: string
          meta: Json | null
        }
        Insert: {
          created_at?: string
          id?: never
          import_id: number
          level: string
          message: string
          meta?: Json | null
        }
        Update: {
          created_at?: string
          id?: never
          import_id?: number
          level?: string
          message?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_events_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          batch_id: number | null
          created_at: string
          errors_count: number
          file_hash: string
          file_name: string
          file_type: string
          id: number
          imported_by: string
          is_hidden: boolean
          network_id: number
          status: string
          total_records: number
          warnings_count: number
        }
        Insert: {
          batch_id?: number | null
          created_at?: string
          errors_count?: number
          file_hash: string
          file_name: string
          file_type: string
          id?: never
          imported_by: string
          is_hidden?: boolean
          network_id: number
          status?: string
          total_records?: number
          warnings_count?: number
        }
        Update: {
          batch_id?: number | null
          created_at?: string
          errors_count?: number
          file_hash?: string
          file_name?: string
          file_type?: string
          id?: never
          imported_by?: string
          is_hidden?: boolean
          network_id?: number
          status?: string
          total_records?: number
          warnings_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "imports_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      networks: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          network_id: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          network_id?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          network_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          network_id: number
          no_os_grace_hours: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          network_id: number
          no_os_grace_hours?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          network_id?: number
          no_os_grace_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: true
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      status_mapping: {
        Row: {
          created_at: string
          external_status: string
          id: number
          internal_status: Database["public"]["Enums"]["internal_status"]
          is_active: boolean
          network_id: number
        }
        Insert: {
          created_at?: string
          external_status: string
          id?: never
          internal_status: Database["public"]["Enums"]["internal_status"]
          is_active?: boolean
          network_id: number
        }
        Update: {
          created_at?: string
          external_status?: string
          id?: never
          internal_status?: Database["public"]["Enums"]["internal_status"]
          is_active?: boolean
          network_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "status_mapping_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          external_status: string | null
          has_os: boolean | null
          id: number
          inconsistency_code: string | null
          internal_status: Database["public"]["Enums"]["internal_status"] | null
          is_active: boolean | null
          last_import_id: number | null
          last_os_event_at: string | null
          last_os_event_desc: string | null
          last_seen_at: string | null
          network_id: number
          opened_at: string | null
          os_found_in_vdesk: boolean | null
          os_number: string | null
          raw_payload: Json
          severity: Database["public"]["Enums"]["ticket_severity"]
          ticket_external_id: string
          ticket_type: string | null
          updated_at: string
          vdesk_payload: Json | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          external_status?: string | null
          has_os?: boolean | null
          id?: never
          inconsistency_code?: string | null
          internal_status?:
            | Database["public"]["Enums"]["internal_status"]
            | null
          is_active?: boolean | null
          last_import_id?: number | null
          last_os_event_at?: string | null
          last_os_event_desc?: string | null
          last_seen_at?: string | null
          network_id: number
          opened_at?: string | null
          os_found_in_vdesk?: boolean | null
          os_number?: string | null
          raw_payload: Json
          severity?: Database["public"]["Enums"]["ticket_severity"]
          ticket_external_id: string
          ticket_type?: string | null
          updated_at?: string
          vdesk_payload?: Json | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          external_status?: string | null
          has_os?: boolean | null
          id?: never
          inconsistency_code?: string | null
          internal_status?:
            | Database["public"]["Enums"]["internal_status"]
            | null
          is_active?: boolean | null
          last_import_id?: number | null
          last_os_event_at?: string | null
          last_os_event_desc?: string | null
          last_seen_at?: string | null
          network_id?: number
          opened_at?: string | null
          os_found_in_vdesk?: boolean | null
          os_number?: string | null
          raw_payload?: Json
          severity?: Database["public"]["Enums"]["ticket_severity"]
          ticket_external_id?: string
          ticket_type?: string | null
          updated_at?: string
          vdesk_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_last_import_id_fkey"
            columns: ["last_import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_dashboard_summary: {
        Row: {
          last_updated: string | null
          network_id: number | null
          tickets_atencao: number | null
          tickets_criticos: number | null
          tickets_ok: number | null
          tickets_sem_os: number | null
          total_tickets: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_network_id: { Args: never; Returns: number }
      auth_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      batch_validate_os: {
        Args: { p_validations: Json }
        Returns: {
          message: string
          success: boolean
          ticket_external_id: string
        }[]
      }
      get_batch_statistics: { Args: { p_batch_id: number }; Returns: Json }
      get_correlation_stats: {
        Args: { p_network_id?: number }
        Returns: {
          os_nao_encontradas: number
          os_nao_validadas: number
          os_validadas: number
          taxa_correlacao: number
          tickets_com_os: number
          tickets_sem_os: number
          total_tickets: number
        }[]
      }
      get_dashboard_summary: {
        Args: { p_network_id?: number }
        Returns: {
          last_updated: string
          network_id: number
          tickets_atencao: number
          tickets_criticos: number
          tickets_ok: number
          tickets_sem_os: number
          total_tickets: number
        }[]
      }
      get_imports_history: {
        Args: { p_limit?: number; p_network_id?: number }
        Returns: {
          created_at: string
          errors_count: number
          file_name: string
          file_type: string
          id: number
          imported_by: string
          network_id: number
          status: string
          total_records: number
          warnings_count: number
        }[]
      }
      get_inconsistency_report: {
        Args: {
          p_network_id?: number
          p_severity?: Database["public"]["Enums"]["ticket_severity"]
        }
        Returns: {
          assigned_to: string
          external_status: string
          hours_without_os: number
          inconsistency_code: string
          internal_status: Database["public"]["Enums"]["internal_status"]
          opened_at: string
          os_found_in_vdesk: boolean
          os_number: string
          severity: Database["public"]["Enums"]["ticket_severity"]
          ticket_external_id: string
          ticket_type: string
        }[]
      }
      get_recent_batches: {
        Args: { p_limit?: number; p_network_id: number }
        Returns: {
          batch_name: string
          clear_before_import: boolean
          completed_at: string
          created_at: string
          errors_count: number
          id: number
          imported_by_email: string
          imported_by_name: string
          status: string
          total_files: number
          total_records: number
          warnings_count: number
        }[]
      }
      get_ticket_detail: {
        Args: { p_ticket_external_id: string }
        Returns: {
          assigned_to: string
          created_at: string
          external_status: string
          has_os: boolean
          id: number
          inconsistency_code: string
          internal_status: Database["public"]["Enums"]["internal_status"]
          last_import_id: number
          last_os_event_at: string
          last_os_event_desc: string
          network_id: number
          opened_at: string
          os_found_in_vdesk: boolean
          os_number: string
          raw_payload: Json
          severity: Database["public"]["Enums"]["ticket_severity"]
          ticket_external_id: string
          ticket_type: string
          updated_at: string
          vdesk_payload: Json
        }[]
      }
      get_ticket_timeline: {
        Args: { p_ticket_external_id: string }
        Returns: {
          file_name: string
          import_date: string
          import_id: number
          os_snapshot: string
          severity_snapshot: string
          status_snapshot: string
        }[]
      }
      get_tickets: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_has_os?: boolean
          p_internal_status?: Database["public"]["Enums"]["internal_status"]
          p_limit?: number
          p_network_id?: number
          p_offset?: number
          p_search_text?: string
          p_severity?: Database["public"]["Enums"]["ticket_severity"]
        }
        Returns: {
          assigned_to: string
          created_at: string
          external_status: string
          has_os: boolean
          id: number
          inconsistency_code: string
          internal_status: Database["public"]["Enums"]["internal_status"]
          last_import_id: number
          network_id: number
          opened_at: string
          os_number: string
          severity: Database["public"]["Enums"]["ticket_severity"]
          ticket_external_id: string
          ticket_type: string
          updated_at: string
        }[]
      }
      get_tickets_needing_os_validation: {
        Args: { p_limit?: number; p_network_id?: number }
        Returns: {
          id: number
          opened_at: string
          os_number: string
          severity: Database["public"]["Enums"]["ticket_severity"]
          ticket_external_id: string
        }[]
      }
      get_user_network_id: { Args: { p_user_id: string }; Returns: number }
      get_user_role: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      hide_imports: { Args: { p_network_id: number }; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_gestao: { Args: never; Returns: boolean }
      jsonb_merge: { Args: { current: Json; new_data: Json }; Returns: Json }
      mark_tickets_inactive: { Args: { p_network_id: number }; Returns: number }
      provision_user: { Args: { p_user_id: string }; Returns: Json }
      purge_network_data: { Args: { p_network_id: number }; Returns: Json }
      purge_old_inactive_tickets: {
        Args: { p_days_threshold?: number; p_network_id: number }
        Returns: number
      }
      recalculate_ticket_severities: {
        Args: { p_grace_hours?: number; p_network_id?: number }
        Returns: {
          critical_count: number
          info_count: number
          updated_count: number
          warning_count: number
        }[]
      }
    }
    Enums: {
      app_role: "operacional" | "gestao" | "qualidade" | "admin"
      internal_status:
        | "novo"
        | "em_atendimento"
        | "em_analise"
        | "finalizado"
        | "cancelado"
      ticket_severity: "critico" | "atencao" | "info"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["operacional", "gestao", "qualidade", "admin"],
      internal_status: [
        "novo",
        "em_atendimento",
        "em_analise",
        "finalizado",
        "cancelado",
      ],
      ticket_severity: ["critico", "atencao", "info"],
    },
  },
} as const
