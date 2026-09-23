"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// useSearchParams() requires a Suspense boundary around whatever calls it —
// Next.js enforces this at build time (it needs to be able to statically
// render everything above the boundary while deferring the search-param-
// dependent part). Splitting into an outer page (safe to prerender) and an
// inner form component (wrapped in Suspense) satisfies that requirement.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6">
      <div className="text-center">
        <div className="text-xs tracking-[0.15em] text-eoc-muted font-bold">
          NEMA NATIONAL EMERGENCY OPERATIONS CENTRE
        </div>
        <div className="text-xl font-bold mt-1">National Disaster Intelligence System</div>
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(params.get("next") || "/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6">
      <div className="text-center">
        <div className="text-xs tracking-[0.15em] text-eoc-muted font-bold">
          NEMA NATIONAL EMERGENCY OPERATIONS CENTRE
        </div>
        <div className="text-xl font-bold mt-1">National Disaster Intelligence System</div>
      </div>

      <form onSubmit={handleSubmit} className="w-80 bg-eoc-panel border border-eoc-border rounded p-5 flex flex-col gap-3">
        {error && (
          <div className="text-xs bg-[#3A1414] border border-[#8C2E2E] text-[#F0A0A0] rounded px-2.5 py-2">
            {error}
          </div>
        )}
        <label className="text-xs text-eoc-muted">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full bg-eoc-bg border border-[#262F3D] rounded px-2.5 py-1.5 text-sm text-eoc-text outline-none"
          />
        </label>
        <label className="text-xs text-eoc-muted">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full bg-eoc-bg border border-[#262F3D] rounded px-2.5 py-1.5 text-sm text-eoc-text outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="mt-2 bg-[#1F3A80] border border-[#3D6FE0] text-[#DCE6FB] text-sm font-semibold rounded px-3 py-2 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-[11px] text-eoc-muted text-center mt-1">
          Accounts are provisioned by an administrator. Contact your NEMA administrator for access.
        </p>
      </form>
    </div>
  );
}
