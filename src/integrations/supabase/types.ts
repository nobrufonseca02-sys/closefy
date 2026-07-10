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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      lead_feedbacks: {
        Row: {
          created_at: string
          data_reuniao: string
          dor_principal: string | null
          id: string
          lead_id: string
          link_gravacao: string | null
          nivel_urgencia: string | null
          objecoes: string | null
          percepcao_closer: string | null
          proximo_passo: string | null
          resultado_reuniao: string | null
          resumo: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_reuniao?: string
          dor_principal?: string | null
          id?: string
          lead_id: string
          link_gravacao?: string | null
          nivel_urgencia?: string | null
          objecoes?: string | null
          percepcao_closer?: string | null
          proximo_passo?: string | null
          resultado_reuniao?: string | null
          resumo?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_reuniao?: string
          dor_principal?: string | null
          id?: string
          lead_id?: string
          link_gravacao?: string | null
          nivel_urgencia?: string | null
          objecoes?: string | null
          percepcao_closer?: string | null
          proximo_passo?: string | null
          resultado_reuniao?: string | null
          resumo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_feedbacks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          cargo: string | null
          created_at: string
          data_followup: string | null
          data_proxima_reuniao: string | null
          email: string | null
          etapa_funil: string
          faturamento_medio: string | null
          id: string
          link_reuniao: string | null
          nome_cliente: string
          nome_empresa: string
          numero_funcionarios: string | null
          observacoes: string | null
          origem: string | null
          tags: string[]
          temperatura: string
          ticket_estimado: number | null
          ultima_atividade_em: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          data_followup?: string | null
          data_proxima_reuniao?: string | null
          email?: string | null
          etapa_funil?: string
          faturamento_medio?: string | null
          id?: string
          link_reuniao?: string | null
          nome_cliente: string
          nome_empresa: string
          numero_funcionarios?: string | null
          observacoes?: string | null
          origem?: string | null
          tags?: string[]
          temperatura?: string
          ticket_estimado?: number | null
          ultima_atividade_em?: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          data_followup?: string | null
          data_proxima_reuniao?: string | null
          email?: string | null
          etapa_funil?: string
          faturamento_medio?: string | null
          id?: string
          link_reuniao?: string | null
          nome_cliente?: string
          nome_empresa?: string
          numero_funcionarios?: string | null
          observacoes?: string | null
          origem?: string | null
          tags?: string[]
          temperatura?: string
          ticket_estimado?: number | null
          ultima_atividade_em?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
