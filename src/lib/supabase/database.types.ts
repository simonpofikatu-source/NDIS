/**
 * This file is a hand-written placeholder. It is NOT the real generated
 * types file, because generating it requires running the Supabase CLI
 * against your actual linked project — something that can't be done
 * without network access and your project credentials.
 *
 * After you've applied the migrations in supabase/migrations/ to your
 * Supabase project, generate the real file with:
 *
 *   npx supabase login
 *   npx supabase link --project-ref YOUR_PROJECT_REF
 *   npm run db:types
 *
 * That command overwrites this file with full types for every table,
 * view, and enum in your database, and every query in this codebase
 * will then be type-checked against your actual schema.
 *
 * Until then, this minimal shape keeps the rest of the app compiling.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
    Views: Record<string, { Row: Record<string, unknown> }>;
    Functions: Record<string, unknown>;
    Enums: Record<string, string>;
  };
}
