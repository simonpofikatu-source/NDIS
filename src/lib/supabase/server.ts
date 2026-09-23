import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
// NOTE: not applying a <Database> generic to createServerClient below — see
// the matching note in client.ts. database.types.ts is a hand-written
// placeholder until `npm run db:types` is run against a real linked
// Supabase project; passing it as the generic makes Supabase's query
// builder silently collapse result types to `never` instead of erroring,
// which is what broke the Netlify build. Untyped (permissive) queries are
// the honest state until real types exist.

/**
 * Session-scoped server client. Runs every query as the logged-in user, so
 * Row Level Security policies apply exactly as they would for that user in
 * the browser. Use this for all normal reads/writes.
 */
export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. See README.md 'Environment variables'."
    );
  }
  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component without a mutable cookie store;
            // middleware.ts refreshes the session on every request instead.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // see note above
          }
        },
      },
    }
  );
}

/**
 * Service-role client. Bypasses RLS entirely — use ONLY in server actions /
 * route handlers for the specific, narrow cases that legitimately need it
 * (e.g. writing audit_logs, which regular roles cannot insert into by
 * design). Never import this into anything that runs in the browser.
 */
export function createServiceRoleSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Server-only privileged operations (audit logging, etc.) are unavailable until it is configured."
    );
  }
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: { get: () => undefined, set: () => {}, remove: () => {} },
  });
}
