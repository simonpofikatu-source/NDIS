# BUILD 02 COMPLETION REPORT

## Features implemented

1. **National GIS foundation** — `v_incident_map_feature` view resolving
   coordinates from `incidents.location_point` (PostGIS) with fallback to
   the initial report's lat/long; real MapLibre GL clustering map.
2. **Incident popup** (map click) showing all fields listed in spec
   section 8 (ID, disaster type, state/LGA/ward/community, status,
   severity, verification, first reported, last updated, affected,
   displaced, fatalities, missing, injured) with a "VIEW INCIDENT" link.
3. **Full incident profile** — Situation, Human Impact, Displacement,
   Humanitarian Impact, Infrastructure, Livelihood, Needs sections, exactly
   matching spec section 9's structure, all sourced from real report data.
4. **Incident timeline with computed deltas** — every report/update event
   shows the change in affected/displaced/fatalities/injured/houses damaged
   versus the previous report, computed in the page, not hardcoded.
5. **Status recommendation engine** — `suggest_status_transition()` SQL
   function + TS mirror (`src/lib/statusEngine.ts`) + `status_recommendations`
   table + Accept/Reject UI (`StatusRecommendationPanel.tsx`). The system
   never changes `incidents.status` itself; only an explicit "Accept"
   server action does, and it's recorded in `incident_history`.
6. **Verification status kept separate from incident status** — this was
   already true in BUILD 01's schema (`incidents.status` and
   `incidents.verification_status` are distinct columns/enums) and remains
   true; the profile page displays them as two independent badges.
7. **Provisional operational priority** — `priority_rules` table (editable
   thresholds), `calculate_provisional_priority()` SQL function, TS mirror
   (`src/lib/priority.ts`), displayed on the incident profile with an
   explicit "not an approved NEMA methodology" label per spec section 13.
8. **Upgraded national dashboard** — KPI strip now matches spec section 14
   exactly (active/new/escalating incidents, states/LGAs affected,
   affected/displaced/fatalities/missing/injured), all from live queries.
9. **"What changed?" as a real comparison** — `incident_totals_as_of()` SQL
   function computes national totals as of any timestamp from report
   history; dashboard diffs "now" against 6h/24h/7d ago, selectable.
10. **National filters** — one filter system (URL query params) driving the
    map, KPIs, "what changed" context, and table together, per spec
    section 16 ("do not build separate disconnected filter systems").
11. **Active incidents table** — sortable, searchable, filterable, links to
    the profile, matching the exact column list in spec section 17.
12. **Realtime + configurable refresh** — Supabase Realtime subscription
    with a mode selector (Realtime / 5 / 15 / 30 / 60 min / Manual), per
    spec section 18, including a visible connection-status indicator so it
    never silently pretends to be live when it isn't.
13. **Historical data foundation** — `v_incidents_monthly`, `v_lga_recurrence`
    views; no UI built on top of them yet (correctly out of scope — spec
    section 19 asked for the foundation, not the UI).
14. **Role-based view architecture** — unchanged from BUILD 01's RLS
    design (already covers DG/Executive, EOC, Zonal, State/SEMA,
    Administrator via `is_national_role()`, `current_state_id()`,
    `current_zone_id()`); extended with policies for the two new tables
    (`priority_rules`, `status_recommendations`).
15. **Security review finding + fix**: found that rapid-update report rows
    weren't carrying `state_id`/`lga_id`/etc. from their parent incident,
    which would silently hide those rows from state-scoped (SEMA) users
    under RLS even though the incident itself was visible to them — a real
    cross-cutting access bug, not a hypothetical one. Fixed in
    `src/app/incidents/[id]/actions.ts`. See BUILD_02_AUDIT.md.
16. **Views run with `security_invoker = true`** — a second real security
    finding: Postgres views default to running with the *owner's*
    privileges, and Supabase migrations typically run as a role that can
    bypass RLS, which would have made every new view leak cross-state data
    regardless of the querying user's role. Every view in migration 0005
    explicitly sets `security_invoker = true` to close this.

## Files created

```
BUILD_02_AUDIT.md
BUILD_02_COMPLETION_REPORT.md
supabase/migrations/0005_build02_gis_and_priority.sql
src/lib/priority.ts
src/lib/statusEngine.ts
src/components/IncidentMap.tsx
src/components/FilterBar.tsx
src/components/IncidentTable.tsx
src/components/RealtimeIncidentWatcher.tsx
src/app/incidents/[id]/StatusRecommendationPanel.tsx
tests/priority.test.ts
tests/statusEngine.test.ts
```

## Files modified

```
supabase/migrations/0004_dev_seed_data.sql   (added a second report so the
                                               timeline/status-recommendation
                                               demo has real history)
src/app/page.tsx                             (replaced — BUILD 02 dashboard)
src/app/incidents/[id]/page.tsx              (replaced — full profile)
src/app/incidents/[id]/actions.ts            (added decideStatusRecommendation,
                                               status-recommendation check,
                                               fixed the RLS state_id bug above)
src/app/globals.css                          (added maplibre-gl CSS import)
README.md                                    (BUILD 02 sections)
```

## Tests

Added `tests/priority.test.ts` (5 cases) and `tests/statusEngine.test.ts`
(6 cases) covering the priority-scoring and status-recommendation pure
logic. Combined with BUILD 01's `tests/dataQuality.test.ts`, there are now
3 test files / 16 test cases total.

**I could not run them.** Same root cause as BUILD 01 and re-confirmed
this session: `npm install` fails with a 403 from the npm registry — no
outbound network access in this tool environment. See `BUILD_02_AUDIT.md`
for the exact commands and errors. Run `npm install && npm test` yourself
before trusting these pass; I've reviewed them by eye for correctness but
that is not a substitute for execution.

## Known limitations

- Untested against a live Postgres/Supabase instance — migration 0005 in
  particular does two things (`alter type ... add value`,
  `alter publication ... add table`) that are usually fine but are worth
  double-checking against your actual Supabase Postgres version.
- The map's tile source is OpenStreetMap's shared public server, fine for
  development, not appropriate for production traffic — see README "GIS
  configuration" for the one-line swap.
- No E2E tests yet (spec's full login→...→SITREP flow needs the modules
  that are explicitly deferred to a later build: verification UI,
  response management, AI, SITREP).
- `calculate_provisional_priority` and `suggest_status_transition` exist
  in both SQL (authoritative) and TypeScript (`src/lib/priority.ts`,
  `src/lib/statusEngine.ts`, for instant UI preview + unit testing) — if
  thresholds change, both need updating. This duplication is a deliberate
  tradeoff for testability without a database; flagging it as a
  maintenance risk rather than hiding it.

## Remaining risks

- `suggest_status_transition()` only compares the two most recent reports.
  An incident that oscillates (up, down, up) across many small updates
  could avoid triggering a recommendation that a longer trend window would
  catch. Acceptable for BUILD 02; worth revisiting if real usage shows
  missed escalations.
- `v_incident_map_feature`'s coordinate fallback (`location_point` else
  first report's lat/long) means an incident with neither will not appear
  on the map at all — it still appears in the table, so it isn't lost,
  but this should be surfaced as a data-quality flag in a future build
  rather than a silent map omission.

---

# BUILD 02 STATUS

```
FOUNDATION:       CARRIED FORWARD FROM BUILD 01 (unchanged, not re-verified live)
DATABASE:         MIGRATION WRITTEN, NOT EXECUTED — see BUILD_02_AUDIT.md
GIS:              CODE COMPLETE, NOT RUNTIME-VERIFIED
INCIDENT ENGINE:  CODE COMPLETE (status/verification/priority/timeline), NOT RUNTIME-VERIFIED
REALTIME:         CODE COMPLETE, NOT RUNTIME-VERIFIED (depends on Realtime being enabled in your project)
SECURITY:         RLS POLICIES WRITTEN + 2 REAL BUGS FOUND AND FIXED THIS SESSION, NOT PENETRATION-TESTED
TESTS:            16 TEST CASES WRITTEN, 0 EXECUTED (no network access to install dependencies)
BUILD:            NOT RUN (npm install fails — no network access in this environment)
```

I am not marking anything PASS. Every row above states exactly what was
and wasn't verified, per the instruction not to claim a pass without
actually testing it. The next real step is running `npm install && npm run
build && npm test` against this code with your own network access, and
`supabase db push` against an actual project — both of which are one
normal dev session, not a rebuild.
