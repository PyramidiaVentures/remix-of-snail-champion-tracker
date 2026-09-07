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
      biomass_events: {
        Row: {
          created_at: string
          event_date: string
          gross_g: number | null
          id: string
          live_count: number
          method: Database["public"]["Enums"]["biomass_method"]
          net_biomass_g: number
          notes: string | null
          pen_id: string
          photo_url: string | null
          recorded_by: string | null
          subsample_count: number | null
          tare_g: number | null
          trial_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_date: string
          gross_g?: number | null
          id?: string
          live_count: number
          method?: Database["public"]["Enums"]["biomass_method"]
          net_biomass_g: number
          notes?: string | null
          pen_id: string
          photo_url?: string | null
          recorded_by?: string | null
          subsample_count?: number | null
          tare_g?: number | null
          trial_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_date?: string
          gross_g?: number | null
          id?: string
          live_count?: number
          method?: Database["public"]["Enums"]["biomass_method"]
          net_biomass_g?: number
          notes?: string | null
          pen_id?: string
          photo_url?: string | null
          recorded_by?: string | null
          subsample_count?: number | null
          tare_g?: number | null
          trial_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "biomass_events_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biomass_events_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
        ]
      }
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
          cost_per_kg: number | null
          created_at: string
          dm_percent: number | null
          dm_source: Database["public"]["Enums"]["dm_source"] | null
          id: string
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["feed_status"]
        }
        Insert: {
          cost_per_kg?: number | null
          created_at?: string
          dm_percent?: number | null
          dm_source?: Database["public"]["Enums"]["dm_source"] | null
          id?: string
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["feed_status"]
        }
        Update: {
          cost_per_kg?: number | null
          created_at?: string
          dm_percent?: number | null
          dm_source?: Database["public"]["Enums"]["dm_source"] | null
          id?: string
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["feed_status"]
        }
        Relationships: []
      }
      observations: {
        Row: {
          created_at: string
          dish_action: Database["public"]["Enums"]["dish_action"] | null
          feed_id: string
          id: string
          is_acclimation: boolean
          notes: string | null
          obs_date: string
          offered_g: number | null
          pen_id: string
          recorded_by: string | null
          refusal_score: Database["public"]["Enums"]["refusal_score"] | null
          round_id: string | null
          trial_id: string | null
          updated_at: string
          weight_given_g: number | null
          weight_leftover_g: number | null
        }
        Insert: {
          created_at?: string
          dish_action?: Database["public"]["Enums"]["dish_action"] | null
          feed_id: string
          id?: string
          is_acclimation?: boolean
          notes?: string | null
          obs_date: string
          offered_g?: number | null
          pen_id: string
          recorded_by?: string | null
          refusal_score?: Database["public"]["Enums"]["refusal_score"] | null
          round_id?: string | null
          trial_id?: string | null
          updated_at?: string
          weight_given_g?: number | null
          weight_leftover_g?: number | null
        }
        Update: {
          created_at?: string
          dish_action?: Database["public"]["Enums"]["dish_action"] | null
          feed_id?: string
          id?: string
          is_acclimation?: boolean
          notes?: string | null
          obs_date?: string
          offered_g?: number | null
          pen_id?: string
          recorded_by?: string | null
          refusal_score?: Database["public"]["Enums"]["refusal_score"] | null
          round_id?: string | null
          trial_id?: string | null
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
          {
            foreignKeyName: "observations_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
        ]
      }
      pen_assignments: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          pen_id: string
          start_date: string
          treatment_id: string
          trial_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          pen_id: string
          start_date: string
          treatment_id: string
          trial_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          pen_id?: string
          start_date?: string
          treatment_id?: string
          trial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pen_assignments_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pen_assignments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pen_assignments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
        ]
      }
      pens: {
        Row: {
          area_m2: number | null
          created_at: string
          id: string
          initial_snail_count: number
          label: string
          notes: string | null
        }
        Insert: {
          area_m2?: number | null
          created_at?: string
          id?: string
          initial_snail_count?: number
          label: string
          notes?: string | null
        }
        Update: {
          area_m2?: number | null
          created_at?: string
          id?: string
          initial_snail_count?: number
          label?: string
          notes?: string | null
        }
        Relationships: []
      }
      population_events: {
        Row: {
          cause: Database["public"]["Enums"]["population_cause"] | null
          count: number
          created_at: string
          event_date: string
          event_type: Database["public"]["Enums"]["population_event_type"]
          id: string
          notes: string | null
          pen_id: string
          photo_url: string | null
          recorded_by: string | null
          trial_id: string
        }
        Insert: {
          cause?: Database["public"]["Enums"]["population_cause"] | null
          count: number
          created_at?: string
          event_date: string
          event_type: Database["public"]["Enums"]["population_event_type"]
          id?: string
          notes?: string | null
          pen_id: string
          photo_url?: string | null
          recorded_by?: string | null
          trial_id: string
        }
        Update: {
          cause?: Database["public"]["Enums"]["population_cause"] | null
          count?: number
          created_at?: string
          event_date?: string
          event_type?: Database["public"]["Enums"]["population_event_type"]
          id?: string
          notes?: string | null
          pen_id?: string
          photo_url?: string | null
          recorded_by?: string | null
          trial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "population_events_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "population_events_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
        ]
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
      session_photos: {
        Row: {
          created_at: string
          id: string
          obs_date: string
          pen_id: string | null
          photo_am_url: string | null
          photo_pm_url: string | null
          round_id: string | null
          trial_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          obs_date: string
          pen_id?: string | null
          photo_am_url?: string | null
          photo_pm_url?: string | null
          round_id?: string | null
          trial_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          obs_date?: string
          pen_id?: string | null
          photo_am_url?: string | null
          photo_pm_url?: string | null
          round_id?: string | null
          trial_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_photos_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_photos_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_photos_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          created_at: string
          feed_id: string
          id: string
          label: string
          notes: string | null
          trial_id: string
        }
        Insert: {
          created_at?: string
          feed_id: string
          id?: string
          label: string
          notes?: string | null
          trial_id: string
        }
        Update: {
          created_at?: string
          feed_id?: string
          id?: string
          label?: string
          notes?: string | null
          trial_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
            referencedColumns: ["id"]
          },
        ]
      }
      trials: {
        Row: {
          acclimation_days: number
          created_at: string
          end_date: string | null
          id: string
          name: string
          notes: string | null
          planned_end_date: string | null
          start_date: string
          status: Database["public"]["Enums"]["trial_status"]
          weighing_interval_days: number
        }
        Insert: {
          acclimation_days?: number
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          planned_end_date?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["trial_status"]
          weighing_interval_days?: number
        }
        Update: {
          acclimation_days?: number
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          planned_end_date?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["trial_status"]
          weighing_interval_days?: number
        }
        Relationships: []
      }
      welfare_checks: {
        Row: {
          activity: Database["public"]["Enums"]["snail_activity"] | null
          created_at: string
          dish_condition: Database["public"]["Enums"]["dish_condition"] | null
          health_flags: Database["public"]["Enums"]["health_flag"][] | null
          humidity_pct: number | null
          id: string
          notes: string | null
          obs_date: string
          pen_id: string
          recorded_by: string | null
          substrate_condition:
            | Database["public"]["Enums"]["substrate_condition"]
            | null
          temp_c: number | null
          trial_id: string
          updated_at: string
        }
        Insert: {
          activity?: Database["public"]["Enums"]["snail_activity"] | null
          created_at?: string
          dish_condition?: Database["public"]["Enums"]["dish_condition"] | null
          health_flags?: Database["public"]["Enums"]["health_flag"][] | null
          humidity_pct?: number | null
          id?: string
          notes?: string | null
          obs_date: string
          pen_id: string
          recorded_by?: string | null
          substrate_condition?:
            | Database["public"]["Enums"]["substrate_condition"]
            | null
          temp_c?: number | null
          trial_id: string
          updated_at?: string
        }
        Update: {
          activity?: Database["public"]["Enums"]["snail_activity"] | null
          created_at?: string
          dish_condition?: Database["public"]["Enums"]["dish_condition"] | null
          health_flags?: Database["public"]["Enums"]["health_flag"][] | null
          humidity_pct?: number | null
          id?: string
          notes?: string | null
          obs_date?: string
          pen_id?: string
          recorded_by?: string | null
          substrate_condition?:
            | Database["public"]["Enums"]["substrate_condition"]
            | null
          temp_c?: number | null
          trial_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_checks_pen_id_fkey"
            columns: ["pen_id"]
            isOneToOne: false
            referencedRelation: "pens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_checks_trial_id_fkey"
            columns: ["trial_id"]
            isOneToOne: false
            referencedRelation: "trials"
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
      biomass_method: "whole_pen" | "subsample"
      dish_action: "emptied_refilled" | "topped_up" | "emptied_spoiled"
      dish_condition: "clean" | "soiled" | "mouldy"
      dm_source: "literature" | "supplier" | "measured"
      feed_status: "pending" | "active" | "champion" | "eliminated"
      health_flag:
        | "shell_damage"
        | "lethargy"
        | "abnormal_mucus"
        | "foul_smell"
        | "mould_in_dish"
        | "visible_dead"
      population_cause:
        | "disease"
        | "predation"
        | "handling"
        | "unknown"
        | "harvested"
        | "other"
      population_event_type: "mortality" | "escape" | "removal" | "addition"
      refusal_score:
        | "none_left"
        | "trace"
        | "about_25"
        | "about_50"
        | "most_left"
      round_status: "active" | "closed"
      snail_activity: "active" | "mixed" | "mostly_sealed"
      substrate_condition: "good" | "dry" | "waterlogged" | "soiled"
      trial_status: "setup" | "active" | "closed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      biomass_method: ["whole_pen", "subsample"],
      dish_action: ["emptied_refilled", "topped_up", "emptied_spoiled"],
      dish_condition: ["clean", "soiled", "mouldy"],
      dm_source: ["literature", "supplier", "measured"],
      feed_status: ["pending", "active", "champion", "eliminated"],
      health_flag: [
        "shell_damage",
        "lethargy",
        "abnormal_mucus",
        "foul_smell",
        "mould_in_dish",
        "visible_dead",
      ],
      population_cause: [
        "disease",
        "predation",
        "handling",
        "unknown",
        "harvested",
        "other",
      ],
      population_event_type: ["mortality", "escape", "removal", "addition"],
      refusal_score: [
        "none_left",
        "trace",
        "about_25",
        "about_50",
        "most_left",
      ],
      round_status: ["active", "closed"],
      snail_activity: ["active", "mixed", "mostly_sealed"],
      substrate_condition: ["good", "dry", "waterlogged", "soiled"],
      trial_status: ["setup", "active", "closed"],
    },
  },
} as const
