# NEMA-NDIS — National Disaster Intelligence System

Production-track codebase: Next.js 14 (App Router, TypeScript) + Supabase
(Postgres, PostGIS, Auth, RLS). This is real application code — every
form submits to a real server action that writes to Postgres, every
dashboard number is a live query, authorization is enforced by database
Row Level Security, not just hidden buttons.

## Honest status — read this first

**I built this without network access**, so I could not run `npm install`,
could not create or connect to an actual Supabase project, and could not
run the test suite or a production build. That means:

- ✅ Every file here is real, complete source — not pseudocode, not a mock.
- ✅ The SQL migrations are syntactically real Postgres/PostGIS and are
  designed to run cleanly via `supabase db push` against an empty project.
- ✅ `tests/dataQuality.test.ts` is a real Vitest suite for the one piece of
  business logic that doesn't need a database to test — I could not execute
  it here (no npm registry access), so **you should run `npm test` yourself
  before trusting it**.
- ⚠️ I have not run this code against a live Supabase instance, so there
  will likely be small issues to fix on first run (a typo in a Supabase
  query embed, a Postgres syntax edge case) — normal for code that hasn't
  been compiled or executed yet. Treat this as a strong, real first draft
  that needs one real dev cycle (`npm install && npm run dev` against your
  Supabase project), not a finished, verified deployment.
- ⚠️ This implements Phases 1–8 of the spec's 12-phase plan (foundation,
  security/RLS, core data, NEMA 49-field reporting with data-quality and
  duplicate checks, incident engine, incident profile/timeline/updates).
  GIS map rendering, analytics, AI gateway, SITREP generation, and
  hardening (Phases 7 GIS rendering, 9–12) are database-modeled but not
  yet built as UI — see "What's not built yet" below.

## What's implemented and functionally real right now

- **Auth**: Supabase Auth email/password sign-in (`src/app/login`),
  session-aware middleware that redirects unauthenticated requests.
- **RBAC + RLS**: `supabase/migrations/0002_rls_policies.sql` enforces
  role- and state-scoped access at the database level (see the policy set
  for `incidents`, `reports`, and child tables). The frontend never
  assumes access — it just reflects whatever Postgres actually returns.
- **Dynamic form engine (data-driven, not hardcoded)**: disaster types,
  the 49-field initial report layout, and the per-disaster-type
  conditional question sets all live in `form_definitions` /
  `form_sections` / `form_questions` (migration 0003). The React form
  component (`src/app/incidents/new/NewIncidentForm.tsx`) fetches these
  from Supabase and renders the conditional section that matches whatever
  disaster type the user picks — there is no hardcoded JS object of
  questions.
- **Real incident creation** (`src/app/incidents/new/actions.ts`): runs
  data-quality checks (`src/lib/dataQuality.ts`), runs a real duplicate/
  incident-matching query (`src/lib/incidentMatching.ts`) against
  Postgres, surfaces candidates for a human to confirm rather than
  silently merging, generates the `NEMA-YYYY-NNNNNN` code via a Postgres
  sequence + default expression, and writes an audit log row.
- **Real incident updates** (`src/app/incidents/[id]/actions.ts`):
  inserts a new report + `incident_updates` row + `incident_history`
  rows per changed field (immutable history — old values are never
  overwritten) + `impacts` rows, all in one server action.
- **Live dashboard and incident profile**: both are server components
  querying Supabase directly; there are no hardcoded KPI numbers anywhere.

## What's not built yet (explicitly — not faked)

- GIS map rendering (MapLibre GL wired to PostGIS) — the schema and
  `location_point` geometry column are ready; the map UI component itself
  isn't built yet.
- AI Gateway, AI situation assessment, AI assistant, SITREP generation —
  `ai_analyses`, `ai_queries`, `sitreps` tables exist; no server code
  calls a model yet. Per spec section 67, the rest of the app must and
  does work without this.
- Verification workflow UI, assessments UI, response/needs management UI,
  evidence upload (Supabase Storage), analytics, alerts engine, search,
  import/export, admin/form-builder UI, notifications.
- E2E tests (Playwright) — only the pure-function unit tests exist so far.

## BUILD 02 additions (GIS + operational incident core)

See `BUILD_02_AUDIT.md` for exactly what was and wasn't run this session,
and `BUILD_02_COMPLETION_REPORT.md` for the full file-by-file breakdown.
Summary of what's new:

- **Live national incident map** (`src/components/IncidentMap.tsx`) — real
  MapLibre GL with GeoJSON clustering over `v_incident_map_feature`, a real
  Postgres view. Ships with OpenStreetMap raster tiles (no API key needed)
  — see "GIS configuration" below to point it at a different tile source.
- **National filters** (`src/components/FilterBar.tsx`) — disaster
  group/type, state, LGA, status, severity, verification, date range — all
  driven by URL query params, applied server-side to the same Supabase
  query that feeds the map, KPIs, and table (one filter system, per spec
  section 16, not three disconnected ones).
- **Active incidents table** (`src/components/IncidentTable.tsx`) —
  sortable, searchable, links to the full profile.
- **"What changed?"** — now a real comparison, not a static panel: the
  `incident_totals_as_of(cutoff)` SQL function (migration 0005) computes
  national totals as they stood at any point in time from report history;
  the dashboard calls it for "now" and for 6h/24h/7d ago and diffs them.
- **Provisional operational priority** (`src/lib/priority.ts` +
  `calculate_provisional_priority()` SQL function) — configurable,
  threshold-based, explicitly labeled non-authoritative per spec section 13.
  Thresholds live in the `priority_rules` table, editable by admins.
- **Status recommendation engine** (`src/lib/statusEngine.ts` +
  `suggest_status_transition()` SQL function) — after a rapid update, if
  the new figures cross a threshold, a row is written to
  `status_recommendations`. It is **never** applied automatically — the
  incident profile shows an Accept/Reject panel, and only "Accept" changes
  `incidents.status` (audited via `incident_history`).
- **Realtime** (`src/components/RealtimeIncidentWatcher.tsx`) — subscribes
  to Postgres changes on `incidents`/`reports`/`incident_updates` via
  Supabase Realtime when in "Realtime" mode; also supports 5/15/30/60-minute
  polling or manual refresh, matching spec section 18 exactly. Requires
  migration 0005's `alter publication supabase_realtime add table ...` to
  have been applied, or it will connect but never receive events.
- **Historical views** — `v_incidents_monthly`, `v_lga_recurrence` — real
  aggregations ready for a future trends/hotspots UI; no fabricated data.

### GIS configuration

`IncidentMap.tsx` ships with OpenStreetMap's public raster tiles so the map
works with zero configuration. For production use, OSM's tile server asks
that high-traffic sites not hotlink it — swap the `OSM_STYLE.sources.osm`
URL for a Mapbox/MapTiler style URL (with your own key) or a NEMA-hosted
tile service. Nothing else in the component needs to change; it's plain
MapLibre GL, not locked to any vendor.

### Realtime setup

Realtime requires the tables to be added to Postgres's `supabase_realtime`
publication (done in migration 0005) **and** Realtime to be enabled for
your Supabase project (Database → Replication in the dashboard — confirm
it's on for `incidents`, `reports`, `incident_updates`,
`status_recommendations`).

## Deploying this for real

### 1. Supabase

```bash
npm install
npx supabase login
npx supabase init            # if not already a supabase project locally
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push         # applies supabase/migrations/*.sql in order
```

Then generate real types against your actual schema:

```bash
npm run db:types
```

Migrations apply in order: `0001` (core schema) → `0002` (RLS) → `0003`
(reference data + form engine) → `0004` (**dev/staging only** — synthetic
seed data) → `0005` (BUILD 02: GIS view, priority engine, status
recommendation engine, historical views, realtime publication, indexes).

Do **not** run `0004_dev_seed_data.sql` against production — it is
synthetic simulation data, clearly flagged `is_simulation = true` in
every row, intended for a dev/staging project only.

In the Supabase dashboard, confirm:
- **Auth → Providers**: email/password enabled.
- **Storage**: create an `evidence` bucket (private) once you build the
  upload feature — not required for the current vertical slice.
- Create your first real user via Auth, then in the SQL editor promote
  them: `update profiles set role_id = (select id from roles where code = 'ADMIN') where id = '<their-auth-uid>';`

### 2. Environment variables

Copy `.env.example` to `.env.local` for local dev, and fill in the
`NEXT_PUBLIC_*` values from Supabase project settings → API. Set
`SUPABASE_SERVICE_ROLE_KEY` too (used only server-side, for audit
logging) — see the comments in `.env.example` for which variables are
safe to expose to the browser and which must never leave the server.

### 3. Local dev

```bash
npm install
npm run dev
```

### 4. Netlify

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Netlify: "Add new site" → import the repository. `@netlify/plugin-nextjs`
   is now listed in `package.json` devDependencies (this was previously
   missing and is the most likely cause of a deploy that fails immediately,
   before any build output — Netlify errors with "Plugin ... not found" when
   `netlify.toml` references a plugin that isn't installed).
3. Node version is pinned via `.nvmrc` and `netlify.toml`'s
   `[build.environment] NODE_VERSION` (20.11.1) — Next.js 14 requires
   Node ≥ 18.17, and Netlify's platform default can be older.
4. In Site configuration → Environment variables, add the same variables
   as `.env.example`, scoping `SUPABASE_SERVICE_ROLE_KEY` and any AI keys
   to **Functions** only (never as `NEXT_PUBLIC_*`). **This step is easy to
   miss and produces a different failure mode**: the build succeeds and the
   site "deploys", but every page immediately 500s, because middleware and
   every server component construct a Supabase client from
   `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` on every
   request. `src/lib/supabase/client.ts`, `server.ts`, and `src/middleware.ts`
   now throw/log a specific message naming exactly which variable is missing
   instead of a bare `supabaseUrl is required` — check the Netlify function
   logs (Functions tab) for that message if pages fail after a "successful"
   deploy.
5. Setting environment variables does not trigger a redeploy on its own —
   after adding/changing them, trigger a new deploy (Deploys → Trigger
   deploy → Clear cache and deploy site).
6. Deploy. Netlify will run `npm run build`.

If deployment still fails after the above, the exact error in Netlify's
deploy log (Deploys → the failed deploy → full log) is needed to diagnose
further — "failed to deploy" alone can mean a plugin error, a build error,
a function bundling error, or a runtime error, and each has a different
fix.

### 5. Tests

```bash
npm test
```

## Project structure

```
supabase/migrations/     Real SQL migrations — the source of truth for the schema
src/lib/                 Business logic that doesn't belong to a specific screen
                          (data quality, incident matching, Supabase clients)
src/middleware.ts         Session refresh + route protection
src/app/login/            Real Supabase Auth sign-in
src/app/page.tsx          National EOC dashboard (live queries)
src/app/incidents/new/    Dynamic initial report form + its server action
src/app/incidents/[id]/   Incident profile + rapid update + its server action
tests/                    Vitest unit tests
```

## What's not built yet (BUILD 03 candidates)

Per the BUILD 02 brief, these were deliberately deferred, not faked:
AI Gateway, automated SITREP generation, the alerts engine, and full
response-management UI. Also still open: verification workflow UI (the
`verification_status` field and `verification_events` table exist; there's
no reviewer screen yet), assessments UI, needs/response management UI,
evidence upload via Supabase Storage, analytics/trends UI over the new
historical views, global search, import/export, the admin/form-builder UI,
and E2E tests.

## Suggested next session

Tell me which of the "not built yet" items to do next — the natural order
is: (1) get this actually running against your Supabase project and fix
whatever surfaces, (2) MapLibre + PostGIS incident map, (3) verification
workflow, (4) AI Gateway with a real provider call grounded in a database
query, (5) SITREP generation.
