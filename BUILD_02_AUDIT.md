# BUILD 02 AUDIT

Run on this environment, which has **no outbound network access** (confirmed
below) and no linked Supabase project.

## Commands actually executed

```
$ npm install
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/@supabase%2fssr
```
**Result: FAILED.** The npm registry is unreachable from this tool sandbox.
No `node_modules` exists, so every subsequent command that depends on an
installed package fails at the shell level, not at the code level:

```
$ npm run build   → sh: 1: next: not found
$ npm test        → sh: 1: vitest: not found
$ npm run lint    → sh: 1: next: not found
$ npx supabase --version → npm error 403 (same registry block)
```

**I am not claiming any of these passed.** They did not run at all — there
is no build output, no test report, and no lint report to point to. This is
a hard limitation of the current tool environment (no internet egress), not
a statement about whether the code itself is correct.

## What I could actually verify

Since I can't execute TypeScript/Next.js/Vitest here, I did a manual static
review instead, which is a materially weaker check than running the real
toolchain:

- Read every file in `src/` and `supabase/migrations/` back end-to-end for
  syntax errors, mismatched braces/JSX tags, and import-path consistency
  (`@/lib/...`, `@/components/...` against `tsconfig.json`'s `paths`).
- Cross-checked every column name used in a Supabase `.select()` string
  against the actual column names in the migration files (a common source
  of silent runtime bugs with Supabase's string-based query builder).
- Checked that every new SQL migration is valid, idempotent-once, ordered
  correctly, and doesn't reference a table/column before it's created.

I found and fixed one real bug this way this session: see "Fixes made."
I did **not** find every possible bug this way — type errors, in
particular, are very hard to catch by eye. **You should run
`npm install && npm run build && npm test` yourself before deploying,
exactly as BUILD 01's README already said.**

## Fixes made this session

- `src/app/page.tsx` (dashboard): the original BUILD 01 query embedded
  `reports:reports!reports_incident_id_fkey(...)` assuming Supabase's
  default foreign-key constraint name. Real Postgres/Supabase FK constraint
  names follow the pattern `<table>_<column>_fkey`, so this should actually
  be `reports_incident_id_fkey` only if the column is literally named
  `incident_id` on `reports` — which it is, so the embed name was correct,
  but I've added an explicit named foreign key constraint in
  `0005_build02_gis_and_priority.sql` (`fk_reports_incident`) so the
  relationship name is guaranteed rather than relying on Postgres's default
  naming convention, which can silently differ across Postgres versions.
- Fixed the dashboard's "latest report" logic: BUILD 01 ordered by
  `created_at` on the *referenced table* inside the embed, which Supabase's
  JS client supports but is easy to get subtly wrong; BUILD 02 replaces
  this fragile embedded-order pattern with a proper SQL view
  (`v_incident_latest_report`) so "what is the current figure for this
  incident" is computed once, correctly, in the database — not
  re-derived in JavaScript on every page load.

## Known limitations carried into BUILD 02

- Still unverified against a live Postgres instance — same caveat as
  BUILD 01.
- No CI configured, so nothing currently runs these checks automatically.
  Recommended next step once this repo is pushed to GitHub: add a GitHub
  Actions workflow running `npm ci && npm run build && npm test` on every
  PR (not built in this session — flagged as a real gap, not silently
  skipped).

## Remaining risks

- The map component (`IncidentMap.tsx`) uses `maplibre-gl`, which needs
  its CSS imported and is a browser-only library — it's wrapped in a
  dynamic, client-only component, but this has not been runtime-verified.
- Realtime subscriptions (`src/components/RealtimeIncidentWatcher.tsx`)
  assume Supabase Realtime is enabled for the `incidents`/`reports` tables
  (`alter publication supabase_realtime add table ...`, included in the new
  migration) — if that migration hasn't been applied, the subscription
  will silently receive no events rather than erroring, which is called
  out in the component's comments and in the README.
