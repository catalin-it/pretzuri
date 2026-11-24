export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      affiliate_commissions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          external_ref: string
          id: number
          merchant_id: number | null
          network: string
          occurred_at: string
          status: string
        }
        ComputedFields: never
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          external_ref: string
          id?: never
          merchant_id?: number | null
          network: string
          occurred_at: string
          status: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          external_ref?: string
          id?: never
          merchant_id?: number | null
          network?: string
          occurred_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_aliases: {
        Row: {
          alias_norm: string
          brand_id: number
        }
        ComputedFields: never
        Insert: {
          alias_norm: string
          brand_id: number
        }
        Update: {
          alias_norm?: string
          brand_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_aliases_brand_id_fkey"
            columns: ["brand_id"]
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: number
          name: string
          name_norm: string | null
          slug: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: never
          name: string
          name_norm?: never
          slug: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          name_norm?: never
          slug?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          depth: number
          id: number
          is_active: boolean
          name_en: string
          name_ro: string
          parent_id: number | null
          path: string
          slug: string
          sort_order: number
          spec_filters: NonNullable<Json>
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          depth?: number
          id?: never
          is_active?: boolean
          name_en: string
          name_ro: string
          parent_id?: number | null
          path?: string
          slug: string
          sort_order?: number
          spec_filters?: NonNullable<Json>
          updated_at?: string
        }
        Update: {
          created_at?: string
          depth?: number
          id?: never
          is_active?: boolean
          name_en?: string
          name_ro?: string
          parent_id?: number | null
          path?: string
          slug?: string
          sort_order?: number
          spec_filters?: NonNullable<Json>
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_mappings: {
        Row: {
          category_id: number | null
          created_at: string
          id: number
          merchant_id: number
          offer_count: number
          source_path: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          category_id?: number | null
          created_at?: string
          id?: never
          merchant_id: number
          offer_count?: number
          source_path: string
          updated_at?: string
        }
        Update: {
          category_id?: number | null
          created_at?: string
          id?: never
          merchant_id?: number
          offer_count?: number
          source_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_mappings_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_mappings_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      click_daily: {
        Row: {
          bot_clicks: number
          clicks: number
          day: string
          merchant_id: number
          offer_id: number
          source: string
        }
        ComputedFields: never
        Insert: {
          bot_clicks?: number
          clicks?: number
          day: string
          merchant_id: number
          offer_id: number
          source: string
        }
        Update: {
          bot_clicks?: number
          clicks?: number
          day?: string
          merchant_id?: number
          offer_id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "click_daily_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "click_daily_offer_id_fkey"
            columns: ["offer_id"]
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      clicks: {
        Row: {
          clicked_at: string
          id: number
          is_bot: boolean
          merchant_id: number
          offer_id: number
          product_id: number
          source: string
        }
        ComputedFields: never
        Insert: {
          clicked_at?: string
          id?: never
          is_bot?: boolean
          merchant_id: number
          offer_id: number
          product_id: number
          source?: string
        }
        Update: {
          clicked_at?: string
          id?: never
          is_bot?: boolean
          merchant_id?: number
          offer_id?: number
          product_id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "clicks_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clicks_offer_id_fkey"
            columns: ["offer_id"]
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      cpc_rates: {
        Row: {
          category_id: number | null
          cpc: number
          created_at: string
          currency: string
          id: number
          is_active: boolean
          merchant_id: number
          valid_from: string
          valid_to: string | null
        }
        ComputedFields: never
        Insert: {
          category_id?: number | null
          cpc: number
          created_at?: string
          currency?: string
          id?: never
          is_active?: boolean
          merchant_id: number
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          category_id?: number | null
          cpc?: number
          created_at?: string
          currency?: string
          id?: never
          is_active?: boolean
          merchant_id?: number
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cpc_rates_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpc_rates_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          product_id: number
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          product_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          product_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_run_errors: {
        Row: {
          created_at: string
          external_id: string | null
          field: string | null
          id: number
          reason: string
          row_number: number | null
          run_id: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          external_id?: string | null
          field?: string | null
          id?: never
          reason: string
          row_number?: number | null
          run_id: number
        }
        Update: {
          created_at?: string
          external_id?: string | null
          field?: string | null
          id?: never
          reason?: string
          row_number?: number | null
          run_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "feed_run_errors_run_id_fkey"
            columns: ["run_id"]
            referencedRelation: "feed_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_runs: {
        Row: {
          categories_unmapped: number
          feed_source_id: number
          finished_at: string | null
          id: number
          matches_queued: number
          message: string | null
          offers_expired: number
          offers_new: number
          offers_unchanged: number
          offers_updated: number
          peak_rss_mb: number | null
          price_changes: number
          products_new: number
          rows_invalid: number
          rows_read: number
          rows_valid: number
          started_at: string
          status: string
        }
        ComputedFields: never
        Insert: {
          categories_unmapped?: number
          feed_source_id: number
          finished_at?: string | null
          id?: never
          matches_queued?: number
          message?: string | null
          offers_expired?: number
          offers_new?: number
          offers_unchanged?: number
          offers_updated?: number
          peak_rss_mb?: number | null
          price_changes?: number
          products_new?: number
          rows_invalid?: number
          rows_read?: number
          rows_valid?: number
          started_at?: string
          status?: string
        }
        Update: {
          categories_unmapped?: number
          feed_source_id?: number
          finished_at?: string | null
          id?: never
          matches_queued?: number
          message?: string | null
          offers_expired?: number
          offers_new?: number
          offers_unchanged?: number
          offers_updated?: number
          peak_rss_mb?: number | null
          price_changes?: number
          products_new?: number
          rows_invalid?: number
          rows_read?: number
          rows_valid?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_runs_feed_source_id_fkey"
            columns: ["feed_source_id"]
            referencedRelation: "feed_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_sources: {
        Row: {
          created_at: string
          etag: string | null
          id: number
          is_active: boolean
          last_modified: string | null
          last_row_count: number | null
          last_run_at: string | null
          merchant_id: number
          name: string
          next_run_at: string
          options: NonNullable<Json>
          schedule_minutes: number
          type: string
          updated_at: string
          url: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          etag?: string | null
          id?: never
          is_active?: boolean
          last_modified?: string | null
          last_row_count?: number | null
          last_run_at?: string | null
          merchant_id: number
          name: string
          next_run_at?: string
          options?: NonNullable<Json>
          schedule_minutes?: number
          type: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          etag?: string | null
          id?: never
          is_active?: boolean
          last_modified?: string | null
          last_row_count?: number | null
          last_run_at?: string | null
          merchant_id?: number
          name?: string
          next_run_at?: string
          options?: NonNullable<Json>
          schedule_minutes?: number
          type?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_sources_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_requests: {
        Row: {
          feed_source_id: number
          id: number
          picked_at: string | null
          requested_at: string
          requested_by: string | null
          status: string
        }
        ComputedFields: never
        Insert: {
          feed_source_id: number
          id?: never
          picked_at?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          feed_source_id?: number
          id?: never
          picked_at?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_requests_feed_source_id_fkey"
            columns: ["feed_source_id"]
            referencedRelation: "feed_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      match_queue: {
        Row: {
          candidates: NonNullable<Json>
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: number
          offer_id: number
          product_id: number
          reason: string
          status: string
        }
        ComputedFields: never
        Insert: {
          candidates?: NonNullable<Json>
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: never
          offer_id: number
          product_id: number
          reason: string
          status?: string
        }
        Update: {
          candidates?: NonNullable<Json>
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: never
          offer_id?: number
          product_id?: number
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_queue_offer_id_fkey"
            columns: ["offer_id"]
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_queue_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          affiliate_network: string | null
          cpc_enabled: boolean
          created_at: string
          description: string | null
          has_affiliate: boolean
          id: number
          is_active: boolean
          logo_path: string | null
          name: string
          rating_avg: number | null
          rating_count: number
          shipping_info: string | null
          slug: string
          updated_at: string
          website: string
        }
        ComputedFields: never
        Insert: {
          affiliate_network?: string | null
          cpc_enabled?: boolean
          created_at?: string
          description?: string | null
          has_affiliate?: boolean
          id?: never
          is_active?: boolean
          logo_path?: string | null
          name: string
          rating_avg?: number | null
          rating_count?: number
          shipping_info?: string | null
          slug: string
          updated_at?: string
          website: string
        }
        Update: {
          affiliate_network?: string | null
          cpc_enabled?: boolean
          created_at?: string
          description?: string | null
          has_affiliate?: boolean
          id?: never
          is_active?: boolean
          logo_path?: string | null
          name?: string
          rating_avg?: number | null
          rating_count?: number
          shipping_info?: string | null
          slug?: string
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      moderation_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: number
          reason: string | null
          target_id: string
          target_type: string
        }
        ComputedFields: never
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: never
          reason?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: never
          reason?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          affiliate_url: string | null
          availability: string
          brand_raw: string | null
          category_raw: string | null
          currency: string
          expired_at: string | null
          external_id: string
          feed_source_id: number | null
          first_seen_at: string
          gtin: string | null
          id: number
          image_url: string | null
          is_active: boolean
          last_seen_at: string
          match_method: string | null
          match_score: number | null
          merchant_id: number
          mpn: string | null
          old_price: number | null
          price: number
          product_id: number
          shipping_cost: number | null
          shipping_days: string | null
          title: string
          total_price: number | null
          updated_at: string
          url: string
        }
        ComputedFields: never
        Insert: {
          affiliate_url?: string | null
          availability?: string
          brand_raw?: string | null
          category_raw?: string | null
          currency?: string
          expired_at?: string | null
          external_id: string
          feed_source_id?: number | null
          first_seen_at?: string
          gtin?: string | null
          id?: never
          image_url?: string | null
          is_active?: boolean
          last_seen_at?: string
          match_method?: string | null
          match_score?: number | null
          merchant_id: number
          mpn?: string | null
          old_price?: number | null
          price: number
          product_id: number
          shipping_cost?: number | null
          shipping_days?: string | null
          title: string
          total_price?: never
          updated_at?: string
          url: string
        }
        Update: {
          affiliate_url?: string | null
          availability?: string
          brand_raw?: string | null
          category_raw?: string | null
          currency?: string
          expired_at?: string | null
          external_id?: string
          feed_source_id?: number | null
          first_seen_at?: string
          gtin?: string | null
          id?: never
          image_url?: string | null
          is_active?: boolean
          last_seen_at?: string
          match_method?: string | null
          match_score?: number | null
          merchant_id?: number
          mpn?: string | null
          old_price?: number | null
          price?: number
          product_id?: number
          shipping_cost?: number | null
          shipping_days?: string | null
          title?: string
          total_price?: never
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_feed_source_id_fkey"
            columns: ["feed_source_id"]
            referencedRelation: "feed_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          last_notified_at: string | null
          last_notified_price: number | null
          notify_email: boolean
          notify_push: boolean
          product_id: number
          target_price: number
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          last_notified_at?: string | null
          last_notified_price?: number | null
          notify_email?: boolean
          notify_push?: boolean
          product_id: number
          target_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          last_notified_at?: string | null
          last_notified_price?: number | null
          notify_email?: boolean
          notify_push?: boolean
          product_id?: number
          target_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          availability: string
          id: number
          offer_id: number
          price: number
          product_id: number
          recorded_at: string
          shipping_cost: number | null
        }
        ComputedFields: never
        Insert: {
          availability: string
          id?: never
          offer_id: number
          price: number
          product_id: number
          recorded_at?: string
          shipping_cost?: number | null
        }
        Update: {
          availability?: string
          id?: never
          offer_id?: number
          price?: number
          product_id?: number
          recorded_at?: string
          shipping_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_offer_id_fkey"
            columns: ["offer_id"]
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_distinct: {
        Row: {
          created_at: string
          product_a: number
          product_b: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          product_a: number
          product_b: number
        }
        Update: {
          created_at?: string
          product_a?: number
          product_b?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_distinct_product_a_fkey"
            columns: ["product_a"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_distinct_product_b_fkey"
            columns: ["product_b"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          height: number | null
          id: number
          product_id: number
          sort_order: number
          source_url: string | null
          storage_path: string
          width: number | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          height?: number | null
          id?: never
          product_id: number
          sort_order?: number
          source_url?: string | null
          storage_path: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: never
          product_id?: number
          sort_order?: number
          source_url?: string | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_redirects: {
        Row: {
          created_at: string
          old_slug: string
          product_id: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          old_slug: string
          product_id: number
        }
        Update: {
          created_at?: string
          old_slug?: string
          product_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_redirects_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: number | null
          category_id: number | null
          created_at: string
          description: string | null
          gtins: string[]
          id: number
          image_path: string | null
          max_price: number | null
          merged_into: number | null
          min_price: number | null
          mpn_norm: string | null
          offer_count: number
          search_tsv: unknown
          slug: string
          specs: NonNullable<Json>
          status: string
          title: string
          title_norm: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          brand_id?: number | null
          category_id?: number | null
          created_at?: string
          description?: string | null
          gtins?: string[]
          id?: never
          image_path?: string | null
          max_price?: number | null
          merged_into?: number | null
          min_price?: number | null
          mpn_norm?: string | null
          offer_count?: number
          search_tsv?: unknown
          slug: string
          specs?: NonNullable<Json>
          status?: string
          title: string
          title_norm?: never
          updated_at?: string
        }
        Update: {
          brand_id?: number | null
          category_id?: number | null
          created_at?: string
          description?: string | null
          gtins?: string[]
          id?: never
          image_path?: string | null
          max_price?: number | null
          merged_into?: number | null
          min_price?: number | null
          mpn_norm?: string | null
          offer_count?: number
          search_tsv?: unknown
          slug?: string
          specs?: NonNullable<Json>
          status?: string
          title?: string
          title_norm?: never
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merged_into_fkey"
            columns: ["merged_into"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email_alerts: boolean
          id: string
          locale: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          display_name?: string | null
          email_alerts?: boolean
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email_alerts?: boolean
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          category_id: number | null
          created_at: string
          ends_at: string
          id: number
          is_active: boolean
          label: string
          merchant_id: number
          product_id: number | null
          starts_at: string
        }
        ComputedFields: never
        Insert: {
          category_id?: number | null
          created_at?: string
          ends_at: string
          id?: never
          is_active?: boolean
          label?: string
          merchant_id: number
          product_id?: number | null
          starts_at: string
        }
        Update: {
          category_id?: number | null
          created_at?: string
          ends_at?: string
          id?: never
          is_active?: boolean
          label?: string
          merchant_id?: number
          product_id?: number | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_category_id_fkey"
            columns: ["category_id"]
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: number
          last_used_at: string | null
          p256dh: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: never
          last_used_at?: string | null
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: never
          last_used_at?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      review_reports: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          details: string | null
          id: number
          reason: string
          reporter_id: string | null
          review_id: number
          status: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          details?: string | null
          id?: never
          reason: string
          reporter_id?: string | null
          review_id: number
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          details?: string | null
          id?: never
          reason?: string
          reporter_id?: string | null
          review_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          created_at: string
          id: number
          merchant_id: number
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          rating: number
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          body: string
          created_at?: string
          id?: never
          merchant_id: number
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          rating: number
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          merchant_id?: number
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          rating?: number
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_merchant_id_fkey"
            columns: ["merchant_id"]
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: NonNullable<Json>
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: NonNullable<Json>
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      view_history: {
        Row: {
          product_id: number
          user_id: string
          viewed_at: string
        }
        ComputedFields: never
        Insert: {
          product_id: number
          user_id: string
          viewed_at?: string
        }
        Update: {
          product_id?: number
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "view_history_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      enqueue_due_feeds: { Args: Record<PropertyKey, never>; Returns: number }
      expire_stale_offers: { Args: Record<PropertyKey, never>; Returns: number }
      f_unaccent: { Args: { "": string }; Returns: string }
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      norm_text: { Args: { "": string }; Returns: string }
      offer_lowest_30d: { Args: { p_offer_id: number }; Returns: number }
      product_lowest_30d: { Args: { p_product_id: number }; Returns: number }
      product_offers: {
        Args: { p_product_id: number }
        Returns: {
          availability: string
          currency: string
          has_affiliate: boolean
          history_days: number
          last_seen_at: string
          lowest_30d: number
          merchant_id: number
          merchant_name: string
          merchant_rating: number
          merchant_rating_count: number
          merchant_slug: string
          offer_id: number
          old_price: number
          price: number
          shipping_cost: number
          shipping_days: string
          title: string
          total_price: number
        }[]
      }
      purge_view_history: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      refresh_product_stats: {
        Args: { p_product_ids: number[] }
        Returns: undefined
      }
      register_click: {
        Args: { p_is_bot?: boolean; p_offer_id: number; p_source?: string }
        Returns: string
      }
      rollup_clicks: { Args: Record<PropertyKey, never>; Returns: undefined }
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
    Enums: {},
  },
} as const
