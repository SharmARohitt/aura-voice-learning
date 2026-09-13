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
      concept_edges: {
        Row: {
          created_at: string
          from_concept: string
          id: string
          relation: string
          to_concept: string
          weight: number
        }
        Insert: {
          created_at?: string
          from_concept: string
          id?: string
          relation?: string
          to_concept: string
          weight?: number
        }
        Update: {
          created_at?: string
          from_concept?: string
          id?: string
          relation?: string
          to_concept?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_edges_from_concept_fkey"
            columns: ["from_concept"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_edges_to_concept_fkey"
            columns: ["to_concept"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          aliases: string[]
          chapter: string
          class_level: string
          created_at: string
          description: string | null
          exams: string[]
          hindi_terms: string[]
          hinglish_terms: string[]
          id: string
          name: string
          slug: string
          subject: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          chapter?: string
          class_level?: string
          created_at?: string
          description?: string | null
          exams?: string[]
          hindi_terms?: string[]
          hinglish_terms?: string[]
          id?: string
          name: string
          slug: string
          subject?: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          chapter?: string
          class_level?: string
          created_at?: string
          description?: string | null
          exams?: string[]
          hindi_terms?: string[]
          hinglish_terms?: string[]
          id?: string
          name?: string
          slug?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          approval_status: string
          board: string
          chapter: string
          class_level: string
          content: string | null
          content_hash: string | null
          created_at: string
          exams: string[]
          id: string
          language: string
          metadata: Json
          page_count: number | null
          parent_document_id: string | null
          source_id: string | null
          source_type: string
          source_url: string | null
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          board?: string
          chapter?: string
          class_level?: string
          content?: string | null
          content_hash?: string | null
          created_at?: string
          exams?: string[]
          id?: string
          language?: string
          metadata?: Json
          page_count?: number | null
          parent_document_id?: string | null
          source_id?: string | null
          source_type?: string
          source_url?: string | null
          subject?: string
          title: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          board?: string
          chapter?: string
          class_level?: string
          content?: string | null
          content_hash?: string | null
          created_at?: string
          exams?: string[]
          id?: string
          language?: string
          metadata?: Json
          page_count?: number | null
          parent_document_id?: string | null
          source_id?: string | null
          source_type?: string
          source_url?: string | null
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          chunks_created: number
          created_at: string
          created_by: string | null
          documents_created: number
          duplicates_skipped: number
          duration_ms: number | null
          embedding_failures: number
          embeddings_created: number
          error: string | null
          finished_at: string | null
          id: string
          input_title: string | null
          input_url: string | null
          job_type: string
          log: Json
          payload: Json
          retry_count: number
          source_id: string | null
          stage: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          chunks_created?: number
          created_at?: string
          created_by?: string | null
          documents_created?: number
          duplicates_skipped?: number
          duration_ms?: number | null
          embedding_failures?: number
          embeddings_created?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input_title?: string | null
          input_url?: string | null
          job_type?: string
          log?: Json
          payload?: Json
          retry_count?: number
          source_id?: string | null
          stage?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          chunks_created?: number
          created_at?: string
          created_by?: string | null
          documents_created?: number
          duplicates_skipped?: number
          duration_ms?: number | null
          embedding_failures?: number
          embeddings_created?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input_title?: string | null
          input_url?: string | null
          job_type?: string
          log?: Json
          payload?: Json
          retry_count?: number
          source_id?: string | null
          stage?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_metrics: {
        Row: {
          created_at: string
          detail: Json
          id: string
          metric: string
          unit: string
          value: number
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          metric: string
          unit?: string
          value?: number
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          metric?: string
          unit?: string
          value?: number
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          approval_status: string
          board: string
          chapter: string
          class_level: string
          concept: string | null
          concepts: string[]
          confidence: number
          content: string
          content_hash: string
          course_id: string | null
          created_at: string
          difficulty: string
          document_id: string | null
          embedded_at: string | null
          embedding: string | null
          embedding_version: string | null
          examples: string[]
          exams: string[]
          external_id: string | null
          formulas: string[]
          id: string
          keywords: string[]
          language: string
          learning_objective: string | null
          lecture_id: string | null
          lecture_number: number | null
          lecture_title: string | null
          page_number: number | null
          prerequisites: string[]
          section: string | null
          source_id: string | null
          source_name: string
          source_type: string
          source_url: string | null
          subject: string
          subtopic: string | null
          teacher: string | null
          timestamp_end: string | null
          timestamp_start: string | null
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          approval_status?: string
          board?: string
          chapter?: string
          class_level?: string
          concept?: string | null
          concepts?: string[]
          confidence?: number
          content: string
          content_hash: string
          course_id?: string | null
          created_at?: string
          difficulty?: string
          document_id?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_version?: string | null
          examples?: string[]
          exams?: string[]
          external_id?: string | null
          formulas?: string[]
          id?: string
          keywords?: string[]
          language?: string
          learning_objective?: string | null
          lecture_id?: string | null
          lecture_number?: number | null
          lecture_title?: string | null
          page_number?: number | null
          prerequisites?: string[]
          section?: string | null
          source_id?: string | null
          source_name?: string
          source_type?: string
          source_url?: string | null
          subject?: string
          subtopic?: string | null
          teacher?: string | null
          timestamp_end?: string | null
          timestamp_start?: string | null
          title?: string
          topic?: string
          updated_at?: string
        }
        Update: {
          approval_status?: string
          board?: string
          chapter?: string
          class_level?: string
          concept?: string | null
          concepts?: string[]
          confidence?: number
          content?: string
          content_hash?: string
          course_id?: string | null
          created_at?: string
          difficulty?: string
          document_id?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_version?: string | null
          examples?: string[]
          exams?: string[]
          external_id?: string | null
          formulas?: string[]
          id?: string
          keywords?: string[]
          language?: string
          learning_objective?: string | null
          lecture_id?: string | null
          lecture_number?: number | null
          lecture_title?: string | null
          page_number?: number | null
          prerequisites?: string[]
          section?: string | null
          source_id?: string | null
          source_name?: string
          source_type?: string
          source_url?: string | null
          subject?: string
          subtopic?: string | null
          teacher?: string | null
          timestamp_end?: string | null
          timestamp_start?: string | null
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_edits: {
        Row: {
          action: string
          after_value: Json | null
          before_value: Json | null
          chunk_id: string | null
          created_at: string
          document_id: string | null
          edited_by: string | null
          field: string | null
          id: string
        }
        Insert: {
          action: string
          after_value?: Json | null
          before_value?: Json | null
          chunk_id?: string | null
          created_at?: string
          document_id?: string | null
          edited_by?: string | null
          field?: string | null
          id?: string
        }
        Update: {
          action?: string
          after_value?: Json | null
          before_value?: Json | null
          chunk_id?: string | null
          created_at?: string
          document_id?: string | null
          edited_by?: string | null
          field?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_edits_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "knowledge_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_edits_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          class_level: string
          created_at: string
          goal: string
          id: string
          language: string
          name: string
          onboarded_at: string | null
          subjects: string[]
          updated_at: string
        }
        Insert: {
          class_level?: string
          created_at?: string
          goal?: string
          id: string
          language?: string
          name?: string
          onboarded_at?: string | null
          subjects?: string[]
          updated_at?: string
        }
        Update: {
          class_level?: string
          created_at?: string
          goal?: string
          id?: string
          language?: string
          name?: string
          onboarded_at?: string | null
          subjects?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          access_status: string
          checksum: string | null
          chunk_count: number
          crawl_status: string
          created_at: string
          document_count: number
          excerpt_only: boolean
          id: string
          last_crawled_at: string | null
          license: string
          name: string
          notes: string
          publisher: string
          robots_allowed: boolean | null
          source_type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          access_status?: string
          checksum?: string | null
          chunk_count?: number
          crawl_status?: string
          created_at?: string
          document_count?: number
          excerpt_only?: boolean
          id?: string
          last_crawled_at?: string | null
          license?: string
          name: string
          notes?: string
          publisher?: string
          robots_allowed?: boolean | null
          source_type?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          access_status?: string
          checksum?: string | null
          chunk_count?: number
          crawl_status?: string
          created_at?: string
          document_count?: number
          excerpt_only?: boolean
          id?: string
          last_crawled_at?: string | null
          license?: string
          name?: string
          notes?: string
          publisher?: string
          robots_allowed?: boolean | null
          source_type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_knowledge_editor: { Args: never; Returns: boolean }
      match_knowledge_chunks: {
        Args: {
          filter_chapter?: string
          filter_class?: string
          filter_exam?: string
          filter_subject?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      search_knowledge_chunks: {
        Args: {
          filter_chapter?: string
          filter_class?: string
          filter_exam?: string
          filter_subject?: string
          match_count?: number
          query_text: string
        }
        Returns: {
          approval_status: string
          board: string
          chapter: string
          class_level: string
          concept: string | null
          concepts: string[]
          confidence: number
          content: string
          content_hash: string
          course_id: string | null
          created_at: string
          difficulty: string
          document_id: string | null
          embedded_at: string | null
          embedding: string | null
          embedding_version: string | null
          examples: string[]
          exams: string[]
          external_id: string | null
          formulas: string[]
          id: string
          keywords: string[]
          language: string
          learning_objective: string | null
          lecture_id: string | null
          lecture_number: number | null
          lecture_title: string | null
          page_number: number | null
          prerequisites: string[]
          section: string | null
          source_id: string | null
          source_name: string
          source_type: string
          source_url: string | null
          subject: string
          subtopic: string | null
          teacher: string | null
          timestamp_end: string | null
          timestamp_start: string | null
          title: string
          topic: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "knowledge_chunks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "editor" | "user"
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
      app_role: ["admin", "editor", "user"],
    },
  },
} as const
