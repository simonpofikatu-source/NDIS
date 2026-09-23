import { createBrowserClient } from "@supabase/ssr";
// NOTE: not applying the <Database> generic here — see database.types.ts.
// That file is a hand-written placeholder (real types require running the
// Supabase CLI against your linked project, which needs network access and
// project credentials this environment doesn't have). Supabase's query
// builder cannot statically parse a .select("...") string against that
// placeholder's generic shape and silently collapses the result type to
// `never` instead of erroring — which broke the Netlify build with a
// misleading "Property X does not exist on type 'never'" error nowhere
// near the actual cause. Omitting the generic here falls back to permissive
// (effectively `any`) typing for every query, which is honest given real
// types don't exist yet, and avoids that failure mode everywhere at once
// instead of one query at a time. Re-add <Database> once you've run
// `npm run db:types` against your real project (see database.types.ts).

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Fails loudly and specifically rather than the cryptic "supabaseUrl is
    // required" the underlying library throws otherwise. If you're seeing
    // this on Netlify, the environment variables weren't set in Site
    // configuration -> Environment variables (or were set but not
    // redeployed afterward — Netlify only picks up new env vars on a new
    // build, not automatically).
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. See README.md 'Environment variables'."
    );
  }
  return createBrowserClient(url, anonKey);
}
