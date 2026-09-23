import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import NewIncidentForm from "./NewIncidentForm";

// This page always needs a live, per-request Supabase session (auth check,
// fresh lookup lists) and must never be statically prerendered at build
// time — without this, Next.js tries to prerender it during `next build`,
// which fails there because Supabase env vars/session aren't meaningfully
// available at build time. Same reasoning as the dashboard and incident
// profile pages, which already have this.
export const dynamic = "force-dynamic";

export default async function NewIncidentPage() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: disasterTypes }, { data: states }, { data: lgas }, { data: conditionalForms }] = await Promise.all([
    supabase.from("disaster_types").select("id, name, conditional_form_key").eq("is_active", true).order("name"),
    supabase.from("states").select("id, name").order("name"),
    supabase.from("lgas").select("id, name, state_id").order("name"),
    supabase
      .from("form_definitions")
      .select("id, key, form_sections(id, form_questions(id, key, label, field_type, options, order_index))")
      .like("key", "conditional_%"),
  ]);

  return (
    <NewIncidentForm
      disasterTypes={disasterTypes ?? []}
      states={states ?? []}
      lgas={lgas ?? []}
      conditionalForms={conditionalForms ?? []}
    />
  );
}
