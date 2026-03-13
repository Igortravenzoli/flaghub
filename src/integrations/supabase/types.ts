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
      cs_fila_manual_records: {
        Row: {
          batch_id: string | null
          cliente: string | null
          data_entrada: string | null
          data_referencia: string | null
          data_saida: string | null
          id: string
          id_origem: string | null
          observacoes: string | null
          prioridade: string | null
          published_at: string | null
          raw: Json | null
          responsavel: string | null
          status: string | null
        }
        Insert: {
          batch_id?: string | null
          cliente?: string | null
          data_entrada?: string | null
          data_referencia?: string | null
          data_saida?: string | null
          id?: string
          id_origem?: string | null
          observacoes?: string | null
          prioridade?: string | null
          published_at?: string | null
          raw?: Json | null
          responsavel?: string | null
          status?: string | null
        }
        Update: {
          batch_id?: string | null
          cliente?: string | null
          data_entrada?: string | null
          data_referencia?: string | null
          data_saida?: string | null
          id?: string
          id_origem?: string | null
          observacoes?: string | null
          prioridade?: string | null
          published_at?: string | null
          raw?: Json | null
          responsavel?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_fila_manual_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manual_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_implantacoes_records: {
        Row: {
          atuacao: string | null
          batch_id: string | null
          cliente: string | null
          consultor: string | null
          contato: string | null
          data_fim: string | null
          data_inicio: string | null
          data_referencia: string | null
          horas_totais: number | null
          id: string
          licenca: string | null
          observacoes: string | null
          published_at: string | null
          puxada: string | null
          raw: Json | null
          solucao: string | null
          status_implantacao: string | null
        }
        Insert: {
          atuacao?: string | null
          batch_id?: string | null
          cliente?: string | null
          consultor?: string | null
          contato?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_referencia?: string | null
          horas_totais?: number | null
          id?: string
          licenca?: string | null
          observacoes?: string | null
          published_at?: string | null
          puxada?: string | null
          raw?: Json | null
          solucao?: string | null
          status_implantacao?: string | null
        }
        Update: {
          atuacao?: string | null
          batch_id?: string | null
          cliente?: string | null
          consultor?: string | null
          contato?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          data_referencia?: string | null
          horas_totais?: number | null
          id?: string
          licenca?: string | null
          observacoes?: string | null
          published_at?: string | null
          puxada?: string | null
          raw?: Json | null
          solucao?: string | null
          status_implantacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_implantacoes_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manual_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_queries: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          name: string
          refresh_minutes: number | null
          sector: string | null
          source_mode: string | null
          wiql_id: string | null
          wiql_text: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name: string
          refresh_minutes?: number | null
          sector?: string | null
          source_mode?: string | null
          wiql_id?: string | null
          wiql_text?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name?: string
          refresh_minutes?: number | null
          sector?: string | null
          source_mode?: string | null
          wiql_id?: string | null
          wiql_text?: string | null
        }
        Relationships: []
      }
      devops_query_items_current: {
        Row: {
          query_id: string
          synced_at: string
          work_item_id: number
        }
        Insert: {
          query_id: string
          synced_at?: string
          work_item_id: number
        }
        Update: {
          query_id?: string
          synced_at?: string
          work_item_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "devops_query_items_current_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "devops_queries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_query_items_current_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "vw_devops_queue_items"
            referencedColumns: ["query_id"]
          },
          {
            foreignKeyName: "devops_query_items_current_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "devops_work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_query_items_current_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "vw_devops_queue_items"
            referencedColumns: ["work_item_id"]
          },
          {
            foreignKeyName: "devops_query_items_current_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "vw_devops_work_items_hierarchy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_query_items_current_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "vw_fabrica_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_query_items_current_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "vw_infraestrutura_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_query_items_current_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "vw_qualidade_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_time_logs: {
        Row: {
          etag: string | null
          id: string
          ingested_at: string
          log_date: string
          notes: string | null
          raw: Json
          start_time: string | null
          time_minutes: number
          user_id_ext: string | null
          user_name: string | null
          work_item_id: number | null
        }
        Insert: {
          etag?: string | null
          id?: string
          ingested_at?: string
          log_date: string
          notes?: string | null
          raw?: Json
          start_time?: string | null
          time_minutes?: number
          user_id_ext?: string | null
          user_name?: string | null
          work_item_id?: number | null
        }
        Update: {
          etag?: string | null
          id?: string
          ingested_at?: string
          log_date?: string
          notes?: string | null
          raw?: Json
          start_time?: string | null
          time_minutes?: number
          user_id_ext?: string | null
          user_name?: string | null
          work_item_id?: number | null
        }
        Relationships: []
      }
      devops_work_items: {
        Row: {
          api_url: string | null
          area_path: string | null
          assigned_to: string | null
          assigned_to_display: string | null
          assigned_to_id: string | null
          assigned_to_unique: string | null
          changed_date: string | null
          created_at: string
          created_date: string | null
          custom_fields: Json | null
          effort: number | null
          id: number
          iteration_path: string | null
          parent_id: number | null
          priority: number | null
          raw: Json
          rev: number
          state: string | null
          synced_at: string
          tags: string | null
          team_project: string | null
          title: string | null
          web_url: string | null
          work_item_type: string | null
        }
        Insert: {
          api_url?: string | null
          area_path?: string | null
          assigned_to?: string | null
          assigned_to_display?: string | null
          assigned_to_id?: string | null
          assigned_to_unique?: string | null
          changed_date?: string | null
          created_at?: string
          created_date?: string | null
          custom_fields?: Json | null
          effort?: number | null
          id: number
          iteration_path?: string | null
          parent_id?: number | null
          priority?: number | null
          raw?: Json
          rev?: number
          state?: string | null
          synced_at?: string
          tags?: string | null
          team_project?: string | null
          title?: string | null
          web_url?: string | null
          work_item_type?: string | null
        }
        Update: {
          api_url?: string | null
          area_path?: string | null
          assigned_to?: string | null
          assigned_to_display?: string | null
          assigned_to_id?: string | null
          assigned_to_unique?: string | null
          changed_date?: string | null
          created_at?: string
          created_date?: string | null
          custom_fields?: Json | null
          effort?: number | null
          id?: number
          iteration_path?: string | null
          parent_id?: number | null
          priority?: number | null
          raw?: Json
          rev?: number
          state?: string | null
          synced_at?: string
          tags?: string | null
          team_project?: string | null
          title?: string | null
          web_url?: string | null
          work_item_type?: string | null
        }
        Relationships: []
      }
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
      helpdesk_dashboard_snapshots: {
        Row: {
          collected_at: string
          consultor: string | null
          data_fim: string | null
          data_inicio: string | null
          id: number
          periodo_tipo: string | null
          raw: Json
          total_minutos: number | null
          total_registros: number | null
        }
        Insert: {
          collected_at?: string
          consultor?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: number
          periodo_tipo?: string | null
          raw: Json
          total_minutos?: number | null
          total_registros?: number | null
        }
        Update: {
          collected_at?: string
          consultor?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: number
          periodo_tipo?: string | null
          raw?: Json
          total_minutos?: number | null
          total_registros?: number | null
        }
        Relationships: []
      }
      hub_access_requests: {
        Row: {
          area_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          area_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          area_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_access_requests_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "hub_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_area_members: {
        Row: {
          area_id: string
          area_role: string
          can_view_confidential: boolean
          created_at: string
          id: string
          is_active: boolean
          network_id: number | null
          user_id: string
        }
        Insert: {
          area_id: string
          area_role?: string
          can_view_confidential?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          network_id?: number | null
          user_id: string
        }
        Update: {
          area_id?: string
          area_role?: string
          can_view_confidential?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          network_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_area_members_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "hub_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_areas: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      hub_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      hub_dashboards: {
        Row: {
          area_id: string
          created_at: string
          description: string | null
          id: string
          is_confidential: boolean
          key: string
          name: string
        }
        Insert: {
          area_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_confidential?: boolean
          key: string
          name: string
        }
        Update: {
          area_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_confidential?: boolean
          key?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_dashboards_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "hub_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_integration_endpoints: {
        Row: {
          created_at: string
          id: string
          integration_id: string
          key: string
          method: string
          notes: string | null
          path: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_id: string
          key: string
          method?: string
          notes?: string | null
          path: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_id?: string
          key?: string
          method?: string
          notes?: string | null
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_integration_endpoints_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "hub_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_integrations: {
        Row: {
          auth_type: string | null
          base_url: string | null
          config: Json | null
          created_at: string
          id: string
          is_active: boolean
          key: string
          last_health_at: string | null
          name: string
          type: string | null
        }
        Insert: {
          auth_type?: string | null
          base_url?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          last_health_at?: string | null
          name: string
          type?: string | null
        }
        Update: {
          auth_type?: string | null
          base_url?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          last_health_at?: string | null
          name?: string
          type?: string | null
        }
        Relationships: []
      }
      hub_ip_allowlist: {
        Row: {
          cidr: unknown
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string | null
        }
        Insert: {
          cidr: unknown
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Update: {
          cidr?: unknown
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
        }
        Relationships: []
      }
      hub_manual_uploads: {
        Row: {
          area_id: string
          created_at: string
          error: string | null
          file_name: string
          file_type: string
          id: string
          raw: Json | null
          status: string
          storage_path: string | null
          uploaded_by: string
        }
        Insert: {
          area_id: string
          created_at?: string
          error?: string | null
          file_name: string
          file_type: string
          id?: string
          raw?: Json | null
          status?: string
          storage_path?: string | null
          uploaded_by: string
        }
        Update: {
          area_id?: string
          created_at?: string
          error?: string | null
          file_name?: string
          file_type?: string
          id?: string
          raw?: Json | null
          status?: string
          storage_path?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_manual_uploads_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "hub_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_metrics_registry: {
        Row: {
          calc_type: string | null
          created_at: string
          dashboard_id: string
          formula_description: string | null
          id: string
          is_confidential: boolean
          key: string
          name: string
          notes: string | null
          owner_name: string | null
          return_type: string
          source_reference: string | null
          source_system: string
          status: string
        }
        Insert: {
          calc_type?: string | null
          created_at?: string
          dashboard_id: string
          formula_description?: string | null
          id?: string
          is_confidential?: boolean
          key: string
          name: string
          notes?: string | null
          owner_name?: string | null
          return_type?: string
          source_reference?: string | null
          source_system?: string
          status?: string
        }
        Update: {
          calc_type?: string | null
          created_at?: string
          dashboard_id?: string
          formula_description?: string | null
          id?: string
          is_confidential?: boolean
          key?: string
          name?: string
          notes?: string | null
          owner_name?: string | null
          return_type?: string
          source_reference?: string | null
          source_system?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_metrics_registry_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "hub_dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_raw_ingestions: {
        Row: {
          collected_at: string
          endpoint_id: string | null
          error: string | null
          external_id: string | null
          id: number
          integration_id: string | null
          payload: Json
          payload_hash: string | null
          processed_at: string | null
          source_key: string | null
          source_type: string
          status: string
        }
        Insert: {
          collected_at?: string
          endpoint_id?: string | null
          error?: string | null
          external_id?: string | null
          id?: number
          integration_id?: string | null
          payload: Json
          payload_hash?: string | null
          processed_at?: string | null
          source_key?: string | null
          source_type: string
          status?: string
        }
        Update: {
          collected_at?: string
          endpoint_id?: string | null
          error?: string | null
          external_id?: string | null
          id?: number
          integration_id?: string | null
          payload?: Json
          payload_hash?: string | null
          processed_at?: string | null
          source_key?: string | null
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_raw_ingestions_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "hub_integration_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_raw_ingestions_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "hub_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_sync_jobs: {
        Row: {
          area_id: string | null
          config: Json | null
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          integration_id: string
          job_key: string
          last_run_at: string | null
          next_run_at: string | null
          schedule_cron: string | null
          schedule_minutes: number | null
        }
        Insert: {
          area_id?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          integration_id: string
          job_key: string
          last_run_at?: string | null
          next_run_at?: string | null
          schedule_cron?: string | null
          schedule_minutes?: number | null
        }
        Update: {
          area_id?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          integration_id?: string
          job_key?: string
          last_run_at?: string | null
          next_run_at?: string | null
          schedule_cron?: string | null
          schedule_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hub_sync_jobs_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "hub_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_sync_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "hub_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_sync_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: number
          items_found: number | null
          items_upserted: number | null
          job_id: string
          meta: Json | null
          started_at: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: number
          items_found?: number | null
          items_upserted?: number | null
          job_id: string
          meta?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: number
          items_found?: number | null
          items_upserted?: number | null
          job_id?: string
          meta?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_sync_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "hub_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_user_global_roles: {
        Row: {
          created_at: string
          is_local_admin: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_local_admin?: boolean
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_local_admin?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
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
      manual_import_batches: {
        Row: {
          area_id: string | null
          error: string | null
          file_hash: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          invalid_rows: number | null
          meta: Json | null
          published_at: string | null
          published_by: string | null
          status: string
          template_id: string | null
          total_rows: number | null
          upload_id: string | null
          valid_rows: number | null
        }
        Insert: {
          area_id?: string | null
          error?: string | null
          file_hash?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          invalid_rows?: number | null
          meta?: Json | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          template_id?: string | null
          total_rows?: number | null
          upload_id?: string | null
          valid_rows?: number | null
        }
        Update: {
          area_id?: string | null
          error?: string | null
          file_hash?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          invalid_rows?: number | null
          meta?: Json | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          template_id?: string | null
          total_rows?: number | null
          upload_id?: string | null
          valid_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_import_batches_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "hub_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_import_batches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "manual_import_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_import_batches_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "hub_manual_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_import_rows: {
        Row: {
          batch_id: string | null
          created_at: string | null
          id: number
          is_valid: boolean
          normalized: Json | null
          raw: Json
          row_number: number
          validation_errors: Json | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          id?: number
          is_valid?: boolean
          normalized?: Json | null
          raw: Json
          row_number: number
          validation_errors?: Json | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          id?: number
          is_valid?: boolean
          normalized?: Json | null
          raw?: Json
          row_number?: number
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "manual_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_import_templates: {
        Row: {
          allowed_file_types: string[]
          area_id: string | null
          column_mapping: Json | null
          created_at: string | null
          id: string
          is_active: boolean | null
          key: string
          name: string
          optional_columns: Json | null
          required_columns: Json | null
          validation_rules: Json | null
          version: number
        }
        Insert: {
          allowed_file_types?: string[]
          area_id?: string | null
          column_mapping?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          key: string
          name: string
          optional_columns?: Json | null
          required_columns?: Json | null
          validation_rules?: Json | null
          version?: number
        }
        Update: {
          allowed_file_types?: string[]
          area_id?: string | null
          column_mapping?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          key?: string
          name?: string
          optional_columns?: Json | null
          required_columns?: Json | null
          validation_rules?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "manual_import_templates_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "hub_areas"
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
      vdesk_clients: {
        Row: {
          apelido: string | null
          bandeira: string | null
          id: number
          nome: string
          raw: Json | null
          sistemas: Json | null
          sistemas_label: string | null
          source_hash: string | null
          status: string | null
          synced_at: string | null
        }
        Insert: {
          apelido?: string | null
          bandeira?: string | null
          id?: number
          nome: string
          raw?: Json | null
          sistemas?: Json | null
          sistemas_label?: string | null
          source_hash?: string | null
          status?: string | null
          synced_at?: string | null
        }
        Update: {
          apelido?: string | null
          bandeira?: string | null
          id?: number
          nome?: string
          raw?: Json | null
          sistemas?: Json | null
          sistemas_label?: string | null
          source_hash?: string | null
          status?: string | null
          synced_at?: string | null
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
      vw_comercial_clientes_ativos: {
        Row: {
          apelido: string | null
          bandeira: string | null
          bandeira_cod: string | null
          id: number | null
          nome: string | null
          sistemas: Json | null
          sistemas_label: string | null
          status: string | null
          synced_at: string | null
        }
        Insert: {
          apelido?: string | null
          bandeira?: never
          bandeira_cod?: string | null
          id?: number | null
          nome?: string | null
          sistemas?: Json | null
          sistemas_label?: string | null
          status?: string | null
          synced_at?: string | null
        }
        Update: {
          apelido?: string | null
          bandeira?: never
          bandeira_cod?: string | null
          id?: number | null
          nome?: string | null
          sistemas?: Json | null
          sistemas_label?: string | null
          status?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      vw_customer_service_kpis: {
        Row: {
          assigned_to_display: string | null
          changed_date: string | null
          consultor_impl: string | null
          created_date: string | null
          data_referencia: string | null
          priority: number | null
          query_name: string | null
          solucao: string | null
          source: string | null
          state: string | null
          status_implantacao: string | null
          title: string | null
          web_url: string | null
          work_item_id: number | null
          work_item_type: string | null
        }
        Relationships: []
      }
      vw_devops_queue_items: {
        Row: {
          area_path: string | null
          assigned_to_display: string | null
          assigned_to_unique: string | null
          changed_date: string | null
          created_date: string | null
          effort: number | null
          iteration_path: string | null
          parent_id: number | null
          priority: number | null
          query_id: string | null
          query_name: string | null
          sector: string | null
          snapshot_at: string | null
          state: string | null
          synced_at: string | null
          tags: string | null
          title: string | null
          web_url: string | null
          work_item_id: number | null
          work_item_type: string | null
        }
        Relationships: []
      }
      vw_devops_work_items_hierarchy: {
        Row: {
          area_path: string | null
          assigned_to_display: string | null
          assigned_to_unique: string | null
          changed_date: string | null
          created_date: string | null
          effort: number | null
          id: number | null
          iteration_path: string | null
          parent_id: number | null
          parent_state: string | null
          parent_title: string | null
          parent_type: string | null
          priority: number | null
          state: string | null
          tags: string | null
          title: string | null
          web_url: string | null
          work_item_type: string | null
        }
        Relationships: []
      }
      vw_fabrica_kpis: {
        Row: {
          assigned_to_display: string | null
          changed_date: string | null
          created_date: string | null
          effort: number | null
          id: number | null
          iteration_path: string | null
          parent_id: number | null
          parent_title: string | null
          parent_type: string | null
          priority: number | null
          state: string | null
          title: string | null
          web_url: string | null
          work_item_type: string | null
        }
        Relationships: []
      }
      vw_helpdesk_kpis: {
        Row: {
          collected_at: string | null
          consultor: string | null
          data_fim: string | null
          data_inicio: string | null
          id: number | null
          periodo_tipo: string | null
          raw: Json | null
          total_minutos: number | null
          total_registros: number | null
        }
        Insert: {
          collected_at?: string | null
          consultor?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: number | null
          periodo_tipo?: string | null
          raw?: Json | null
          total_minutos?: number | null
          total_registros?: number | null
        }
        Update: {
          collected_at?: string | null
          consultor?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: number | null
          periodo_tipo?: string | null
          raw?: Json | null
          total_minutos?: number | null
          total_registros?: number | null
        }
        Relationships: []
      }
      vw_infraestrutura_kpis: {
        Row: {
          assigned_to_display: string | null
          changed_date: string | null
          created_date: string | null
          effort: number | null
          id: number | null
          priority: number | null
          state: string | null
          tags: string | null
          title: string | null
          web_url: string | null
          work_item_type: string | null
        }
        Relationships: []
      }
      vw_qualidade_kpis: {
        Row: {
          assigned_to_display: string | null
          changed_date: string | null
          created_date: string | null
          id: number | null
          priority: number | null
          state: string | null
          title: string | null
          web_url: string | null
          work_item_type: string | null
        }
        Relationships: []
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
      get_cron_secret: { Args: never; Returns: string }
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
      hub_audit_log: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type?: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      hub_can_view_confidential: {
        Args: { p_area_id: string }
        Returns: boolean
      }
      hub_check_my_ip: { Args: never; Returns: Json }
      hub_is_admin: { Args: never; Returns: boolean }
      hub_is_ip_allowed: { Args: never; Returns: boolean }
      hub_request_ip: { Args: never; Returns: string }
      hub_user_has_area: { Args: { p_area_id: string }; Returns: boolean }
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
