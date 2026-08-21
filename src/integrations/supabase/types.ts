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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      booking_seats: {
        Row: {
          booking_id: string
          price: number
          show_seat_id: string
        }
        Insert: {
          booking_id: string
          price?: number
          show_seat_id: string
        }
        Update: {
          booking_id?: string
          price?: number
          show_seat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_seats_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_seats_show_seat_id_fkey"
            columns: ["show_seat_id"]
            isOneToOne: false
            referencedRelation: "show_seats"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancelled_at: string | null
          created_at: string
          customer_email: string
          customer_name: string
          event_id: string
          id: string
          reference: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          event_id: string
          id?: string
          reference: string
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          event_id?: string
          id?: string
          reference?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          booking_id: string | null
          created_at: string
          error: string | null
          html: string
          id: string
          kind: string
          sent_at: string | null
          status: string
          subject: string
          to_email: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          error?: string | null
          html: string
          id?: string
          kind?: string
          sent_at?: string | null
          status?: string
          subject: string
          to_email: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          error?: string | null
          html?: string
          id?: string
          kind?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
        }
        Relationships: []
      }
      event_prices: {
        Row: {
          category: string
          event_id: string
          id: string
          price: number
        }
        Insert: {
          category: string
          event_id: string
          id?: string
          price?: number
        }
        Update: {
          category?: string
          event_id?: string
          id?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_prices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          description: string
          hold_ttl_seconds: number
          id: string
          kind: Database["public"]["Enums"]["event_kind"]
          organiser_id: string | null
          poster_hue: number
          starts_at: string
          title: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          hold_ttl_seconds?: number
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          organiser_id?: string | null
          poster_hue?: number
          starts_at: string
          title: string
          venue_id: string
        }
        Update: {
          created_at?: string
          description?: string
          hold_ttl_seconds?: number
          id?: string
          kind?: Database["public"]["Enums"]["event_kind"]
          organiser_id?: string | null
          poster_hue?: number
          starts_at?: string
          title?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      show_seats: {
        Row: {
          booking_id: string | null
          category: string
          event_id: string
          held_by: string | null
          hold_expires_at: string | null
          hold_kind: string | null
          id: string
          row_label: string
          seat_number: number
          status: Database["public"]["Enums"]["seat_status"]
          venue_seat_id: string
          version: number
        }
        Insert: {
          booking_id?: string | null
          category: string
          event_id: string
          held_by?: string | null
          hold_expires_at?: string | null
          hold_kind?: string | null
          id?: string
          row_label: string
          seat_number: number
          status?: Database["public"]["Enums"]["seat_status"]
          venue_seat_id: string
          version?: number
        }
        Update: {
          booking_id?: string | null
          category?: string
          event_id?: string
          held_by?: string | null
          hold_expires_at?: string | null
          hold_kind?: string | null
          id?: string
          row_label?: string
          seat_number?: number
          status?: Database["public"]["Enums"]["seat_status"]
          venue_seat_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "show_seats_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_seats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_seats_venue_seat_id_fkey"
            columns: ["venue_seat_id"]
            isOneToOne: false
            referencedRelation: "venue_seats"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_seats: {
        Row: {
          category: string
          id: string
          row_label: string
          seat_number: number
          venue_id: string
        }
        Insert: {
          category: string
          id?: string
          row_label: string
          seat_number: number
          venue_id: string
        }
        Update: {
          category?: string
          id?: string
          row_label?: string
          seat_number?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_seats_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          city: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          city?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          category: string
          email: string
          event_id: string
          id: string
          joined_at: string
          offer_expires_at: string | null
          offer_token: string | null
          offer_ttl_seconds: number
          offered_seat_id: string | null
          seats_wanted: number
          status: Database["public"]["Enums"]["waitlist_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          email?: string
          event_id: string
          id?: string
          joined_at?: string
          offer_expires_at?: string | null
          offer_token?: string | null
          offer_ttl_seconds?: number
          offered_seat_id?: string | null
          seats_wanted?: number
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          email?: string
          event_id?: string
          id?: string
          joined_at?: string
          offer_expires_at?: string | null
          offer_token?: string | null
          offer_ttl_seconds?: number
          offered_seat_id?: string | null
          seats_wanted?: number
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offered_seat_id_fkey"
            columns: ["offered_seat_id"]
            isOneToOne: false
            referencedRelation: "show_seats"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_booking: { Args: { p_booking_id: string }; Returns: number }
      claim_offer: {
        Args: { p_token: string }
        Returns: {
          event_id: string
          expires_at: string
          seat_id: string
        }[]
      }
      confirm_booking: {
        Args: {
          p_email: string
          p_event_id: string
          p_name: string
          p_seat_ids: string[]
        }
        Returns: {
          cancelled_at: string | null
          created_at: string
          customer_email: string
          customer_name: string
          event_id: string
          id: string
          reference: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_show_seats: { Args: { p_event_id: string }; Returns: number }
      ensure_profile: {
        Args: { p_full_name: string; p_role: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hold_seats: {
        Args: { p_event_id: string; p_seat_ids: string[] }
        Returns: {
          hold_expires_at: string
          seat_id: string
        }[]
      }
      join_waitlist: {
        Args: { p_category: string; p_event_id: string }
        Returns: {
          category: string
          email: string
          event_id: string
          id: string
          joined_at: string
          offer_expires_at: string | null
          offer_token: string | null
          offer_ttl_seconds: number
          offered_seat_id: string | null
          seats_wanted: number
          status: Database["public"]["Enums"]["waitlist_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "waitlist"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_waitlist: { Args: { p_id: string }; Returns: undefined }
      offer_seat_to_next: { Args: { p_seat_id: string }; Returns: string }
      release_my_holds: { Args: { p_event_id: string }; Returns: number }
      sweep_expirations: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "customer" | "organiser" | "admin"
      booking_status: "confirmed" | "cancelled"
      event_kind: "movie" | "concert"
      seat_status: "available" | "held" | "booked"
      waitlist_status:
        | "waiting"
        | "offered"
        | "converted"
        | "expired"
        | "cancelled"
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
      app_role: ["customer", "organiser", "admin"],
      booking_status: ["confirmed", "cancelled"],
      event_kind: ["movie", "concert"],
      seat_status: ["available", "held", "booked"],
      waitlist_status: [
        "waiting",
        "offered",
        "converted",
        "expired",
        "cancelled",
      ],
    },
  },
} as const
