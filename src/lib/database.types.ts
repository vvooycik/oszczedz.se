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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      budget_categories: {
        Row: {
          budget_id: string
          category_id: string
        }
        Insert: {
          budget_id: string
          category_id: string
        }
        Update: {
          budget_id?: string
          category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_categories_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_progress"
            referencedColumns: ["budget_id"]
          },
          {
            foreignKeyName: "budget_categories_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_usage"
            referencedColumns: ["category_id"]
          },
        ]
      }
      budget_wallets: {
        Row: {
          budget_id: string
          wallet_id: string
        }
        Insert: {
          budget_id: string
          wallet_id: string
        }
        Update: {
          budget_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_wallets_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budget_progress"
            referencedColumns: ["budget_id"]
          },
          {
            foreignKeyName: "budget_wallets_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_wallets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "loan_progress"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "budget_wallets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallet_balances"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "budget_wallets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallet_monthly_net"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "budget_wallets_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          currency: string
          id: string
          name: string
          period: Database["public"]["Enums"]["budget_period"]
          user_id: string
        }
        Insert: {
          amount: number
          currency?: string
          id?: string
          name: string
          period?: Database["public"]["Enums"]["budget_period"]
          user_id?: string
        }
        Update: {
          amount?: number
          currency?: string
          id?: string
          name?: string
          period?: Database["public"]["Enums"]["budget_period"]
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string
          glyph: string
          id: string
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          user_id: string
        }
        Insert: {
          color: string
          glyph: string
          id?: string
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          user_id?: string
        }
        Update: {
          color?: string
          glyph?: string
          id?: string
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          name: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
        }
        Insert: {
          tag_id: string
          transaction_id: string
        }
        Update: {
          tag_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          date: string
          id: string
          note: string | null
          transfer_id: string | null
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          date: string
          id?: string
          note?: string | null
          transfer_id?: string | null
          user_id?: string
          wallet_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          transfer_id?: string | null
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_usage"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "loan_progress"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallet_balances"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallet_monthly_net"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          accent: string
          mode: string
          tint_surfaces: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          accent?: string
          mode?: string
          tint_surfaces?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          accent?: string
          mode?: string
          tint_surfaces?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_categories: {
        Row: {
          category_id: string
          position: number
          wallet_id: string
        }
        Insert: {
          category_id: string
          position?: number
          wallet_id: string
        }
        Update: {
          category_id?: string
          position?: number
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_usage"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "wallet_categories_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "loan_progress"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "wallet_categories_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallet_balances"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "wallet_categories_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallet_monthly_net"
            referencedColumns: ["wallet_id"]
          },
          {
            foreignKeyName: "wallet_categories_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          archived_at: string | null
          color_scheme: string
          created_at: string
          credit_limit: number | null
          currency: string
          glyph: string | null
          id: string
          installment_count: number | null
          interest_rate: number | null
          name: string
          starting_balance: number
          type: Database["public"]["Enums"]["wallet_type"]
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          color_scheme: string
          created_at?: string
          credit_limit?: number | null
          currency?: string
          glyph?: string | null
          id?: string
          installment_count?: number | null
          interest_rate?: number | null
          name: string
          starting_balance?: number
          type: Database["public"]["Enums"]["wallet_type"]
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          color_scheme?: string
          created_at?: string
          credit_limit?: number | null
          currency?: string
          glyph?: string | null
          id?: string
          installment_count?: number | null
          interest_rate?: number | null
          name?: string
          starting_balance?: number
          type?: Database["public"]["Enums"]["wallet_type"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      budget_progress: {
        Row: {
          budget_id: string | null
          color: string | null
          currency: string | null
          glyph: string | null
          limit_amount: number | null
          name: string | null
          period: Database["public"]["Enums"]["budget_period"] | null
          period_start: string | null
          spent: number | null
          user_id: string | null
        }
        Relationships: []
      }
      category_usage: {
        Row: {
          category_id: string | null
          transaction_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      loan_progress: {
        Row: {
          installment_count: number | null
          paid_count: number | null
          user_id: string | null
          wallet_id: string | null
        }
        Relationships: []
      }
      monthly_cash_flow: {
        Row: {
          currency: string | null
          inflow: number | null
          month: string | null
          outflow: number | null
          user_id: string | null
        }
        Relationships: []
      }
      monthly_category_totals: {
        Row: {
          category_id: string | null
          category_kind: Database["public"]["Enums"]["category_kind"] | null
          category_name: string | null
          currency: string | null
          month: string | null
          total: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_usage"
            referencedColumns: ["category_id"]
          },
        ]
      }
      wallet_balances: {
        Row: {
          balance: number | null
          currency: string | null
          user_id: string | null
          wallet_id: string | null
        }
        Relationships: []
      }
      wallet_monthly_net: {
        Row: {
          currency: string | null
          month: string | null
          net: number | null
          user_id: string | null
          wallet_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_wallet: { Args: { p_wallet_id: string }; Returns: undefined }
      balance_history: {
        Args: {
          p_currency: string
          p_from: string
          p_max_points?: number
          p_to: string
        }
        Returns: {
          balance: number
          day: string
        }[]
      }
      category_period_totals: {
        Args: {
          p_currency: string
          p_periods?: number
          p_start: string
          p_step: string
        }
        Returns: {
          category_id: string
          period_index: number
          spent: number
        }[]
      }
      create_transfer: {
        Args: {
          p_category_id: string
          p_date: string
          p_note?: string
          p_source_amount: number
          p_source_wallet_id: string
          p_target_amount: number
          p_target_wallet_id: string
        }
        Returns: string
      }
      delete_category: {
        Args: { p_category_id: string; p_reassign_to?: string }
        Returns: undefined
      }
      delete_transfer: { Args: { p_transfer_id: string }; Returns: undefined }
      restore_wallet: { Args: { p_wallet_id: string }; Returns: undefined }
      spending_pace: {
        Args: {
          p_currency: string
          p_max_points?: number
          p_periods?: number
          p_start: string
          p_step: string
        }
        Returns: {
          day_index: number
          spent: number
          typical: number
        }[]
      }
    }
    Enums: {
      budget_period: "monthly"
      category_kind: "income" | "expense" | "transfer"
      wallet_type: "account" | "savings" | "credit_card" | "loan"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      budget_period: ["monthly"],
      category_kind: ["income", "expense", "transfer"],
      wallet_type: ["account", "savings", "credit_card", "loan"],
    },
  },
} as const
