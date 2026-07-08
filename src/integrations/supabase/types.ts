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
      evap_controls: {
        Row: {
          control_given_g: number | null
          control_leftover_g: number | null
          created_at: string
          feed_id: string
          id: string
          obs_date: string
          round_id: string
          updated_at: string
        }
        Insert: {
          control_given_g?: number | null
          control_leftover_g?: number | null
          created_at?: string
          feed_id: string
          id?: string
          obs_date: string
          round_id: string
          updated_at?: string
        }
        Update: {
          control_given_g?: number | null
          control_leftover_g?: number | null
          created_at?: string
          feed_id?: string
          id?: string
          obs_date?: string
          round_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evap_controls_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evap_controls_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      feeds: {
        Row: {
          availability: Database["public"]["Enums"]["feed_availability"]
          cost_per_kg: number | null
          created_at: string
          id: string
          name: string
          source: string | null
          status: Database["public"]["Enums"]["feed_status"]
        }
        Insert: {
          availability?: Database["public"]["Enums"]["feed_availability"]
          cost_per_kg?: number | null
          created_at?: string
          id?: string
          name: string
          source?: string | null
          status?: Database["public"]["Enums"]["feed_status"]
        }
        Update: {
          availability?: Database["public"]["Enums"]["feed_availability"]
          cost_per_kg?: number | null
          created_at?: string
          id?: string
          name?: string
          source?: string | null
          status?: Database["public"]["Enums"]["feed_status"]
        }
        Relationships: []
      }
      observations: {
        Row: {
          created_at: string
          feed_id: string
          id: string
          is_acclimation: boolean
          notes: string | null
          obs_date: string
          pen_id: string
          photo_am_url: string | null
          photo_pm_url: string | null
          round_id: string
          updated_at: string
          weight_given_g: number | null
          weight_leftover_g: number | null
        }
        Insert: {
          created_at?: string
          feed_id: string
          id?: string
          is_acclimation?: boolean
          notes?: string | null
          obs_date: string
          pen_id: string
          photo_am_url?: string | null
          photo_pm_url?: string | null
          round_id: string
          updated_at?: string
          weight_given_g?: number | null
          weight_leftover_g?: number | null
        }
        Update: {
          created_at?: string
          feed_id?: string
          id?: string
          is_acclimation?: boolean
          notes?: string | null
          obs_date?: string
          pen_id?: string
          photo_am_url?: string | null
          photo_pm_url?: string | null
          round_id?: string
          updated_at?: string
          weight_given_g?: number | null
          weight_leftover_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "observations_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      pen_daily: {
        Row: {
          created_at: string
          deaths_count: number
          humidity_pct: number | null
          id: string
          obs_date: string
          pen_id: string
          snail_activity: Database["public"]["Enums"]["snail_activity"] | null
          temp_c: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deaths_count?: number
          humidity_pct?: number | null
          id?: string
          obs_date: string
          pen_id: string
          snail_activity?: Database["public"]["Enums"]["snail_activity"] | null
          temp_c?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deaths_count?: number
          humidity_pct?: number | null
          id?: string
          obs_date?: string
          pen_id?: string
          snail_activity?: Database["public"]["Enums"]["snail_activity"] | null
          temp_c?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pen_daily_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
        ]
      }
      pens: {
        Row: {
          age_group: Database["public"]["Enums"]["age_group"]
          created_at: string
          id: string
          label: string
          notes: string | null
          snail_count: number
        }
        Insert: {
          age_group: Database["public"]["Enums"]["age_group"]
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          snail_count?: number
        }
        Update: {
          age_group?: Database["public"]["Enums"]["age_group"]
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          snail_count?: number
        }
        Relationships: []
      }
      rounds: {
        Row: {
          champion_feed_id: string | null
          champion_global_value: number
          created_at: string
          end_date: string | null
          feed_ids: string[]
          id: string
          notes: string | null
          round_number: number
          start_date: string
          status: Database["public"]["Enums"]["round_status"]
        }
        Insert: {
          champion_feed_id?: string | null
          champion_global_value?: number
          created_at?: string
          end_date?: string | null
          feed_ids: string[]
          id?: string
          notes?: string | null
          round_number: number
          start_date: string
          status?: Database["public"]["Enums"]["round_status"]
        }
        Update: {
          champion_feed_id?: string | null
          champion_global_value?: number
          created_at?: string
          end_date?: string | null
          feed_ids?: string[]
          id?: string
          notes?: string | null
          round_number?: number
          start_date?: string
          status?: Database["public"]["Enums"]["round_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rounds_champion_feed_id_fkey"
            columns: ["champion_feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      age_group: "Juveniles" | "Growers" | "Adults"
      feed_availability: "year_round" | "seasonal"
      feed_status: "pending" | "active" | "champion" | "eliminated"
      round_status: "active" | "closed"
      snail_activity: "active" | "mixed" | "mostly_sealed"
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
      age_group: ["Juveniles", "Growers", "Adults"],
      feed_availability: ["year_round", "seasonal"],
      feed_status: ["pending", "active", "champion", "eliminated"],
      round_status: ["active", "closed"],
      snail_activity: ["active", "mixed", "mostly_sealed"],
    },
  },
} as const
