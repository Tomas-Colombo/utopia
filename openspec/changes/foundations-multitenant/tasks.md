# Tasks — foundations-multitenant

**Change**: foundations-multitenant
**Slices**: 8 chained PRs (proposal §Deliverables / §Chained PR forecast)
**Delivery**: auto-forecast (400-line budget). Chain strategy **NOT selected** — orchestrator must ask user (`stacked-to-main` vs `feature-branch-chain`) before Slice 2 starts (Slice 1 is pure infra, safe to start regardless).
**Strict TDD**: BLOCKED until Slice 1 installs Vitest + Supabase CLI; ACTIVE from Slice 2 onward (REQ-TI-08).

## Review Workload Forecast

- Estimated total changed lines (all 8 slices): **~3,500–3,900**
- 400-line budget risk: **High**
- Chained PRs recommended: **Yes**
- Chain strategy: **NOT SELECTED** — orchestrator MUST ask user before Slice 2.
- Decision needed before apply: **Yes** (chain strategy).

Per-slice estimates below already assume each slice IS one PR. **Slices 3, 6, and 8 individually risk exceeding 400 lines** even as single deliverables (7 components+tests; DAL+2 integration suites+migration; guard+admin CRUD+3 test files). If actual authored diff exceeds ~400 during apply, further split using `work-unit-commits`/`chained-pr` guidance (e.g. 3a/3b, 6a/6b, 8a/8b) rather than shrinking test coverage.

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Infra + testing bootstrap (Vitest only, no CLI/Docker) | PR 1 | `npm test` (smoke) | N/A — no DB yet | Revert `vitest.config.mts`, `tests/`, `supabase/README.md`, `.env.example` |
| 2 | Tokens + theming provider (theme-persist test is mock-level, real DAL wired in 4.7) | PR 2 | `npm test -- design-tokens theming` | Manual: toggle theme in dev server | Revert `lib/design-tokens/`, `components/theming/`, `app/globals.css` |
| 3a | SearchableSelect + Table + FilterBar | PR 3a | `npm test -- components/ui/SearchableSelect Table FilterBar` | N/A — pure presentational | Revert 3 component files + their tests |
| 3b | Badge + Skeleton + EmptyState + ConfirmDialog + demo | PR 3b | `npm test -- components/ui app/demo` | Manual: `/demo` in both themes | Revert remaining 4 components + `app/demo/` |
| 4 | Migrations A + seed pt.1 (author SQL + dashboard-apply to utopia-test + wire theming DAL) | PR 4 | `npm test -- tests/db` | Manual: apply same SQL to utopia-dev dashboard | Revert `00001`–`00004` migration files + seed additions; drop DB objects via down-step comments |
| 5 | Migrations B + Auth Hook + sp_* + seed pt.2 (author SQL + dashboard-apply + register hook) | PR 5 | `npm test -- tests/db` | Manual: apply to utopia-dev; register hook in both projects | Revert `00005`–`00009` + seed additions; drop DB objects; unregister hook |
| 6a | Supabase client factory + session + proxy | PR 6a | `npm test -- lib/dal/supabase lib/dal/session proxy` | Manual: `<tenant>.localhost:3000` routing | Revert `lib/dal/supabase.ts`, `session.ts`, `proxy.ts` |
| 6b | tenant.ts + end-to-end isolation + concurrency (against utopia-test) | PR 6b | `npm test -- lib/dal/tenant tests/db/e2e-tenant-isolation tests/db/configuracion-concurrency` | Manual: verify tenant subdomain routing in dev | Revert `lib/dal/tenant.ts`, `tests/db/e2e-*`, `tests/db/configuracion-concurrency.test.ts` |
| 7 | Auth: login + settings + password re-verify | PR 7 | `npm test -- app/(auth)` | Manual: login → change password flow | Revert `app/(auth)/` |
| 8a | requireModuleRole guard + error mapping | PR 8a | `npm test -- lib/dal/guard` | Manual: hit a guarded route unauthorized | Revert `lib/dal/guard.ts` + error-mapping helper |
| 8b | Administración route group (usuarios/configuracion CRUD) | PR 8b | `npm test -- app/(app)/administracion` | Manual: invite user, edit role, deactivate | Revert `app/(app)/administracion/` |

## Global Prerequisites (before Slice 1)

**Policy update (post-planning decision — Supabase cloud only, no Docker/CLI):**

- [x] Verify Node ≥ 20 (Next.js 16 requirement). — v22.16.0 verified in session.
- [ ] Create **two** Supabase cloud projects on the free tier: `utopia-dev` and `utopia-test`.
- [ ] Record the URL / anon key / service_role key for each project (6 values) — the user provides them to the orchestrator before Slice 4.

There is NO Docker/Supabase-CLI dependency in this change. All DB behavior is exercised by Vitest suites against the cloud test project (design §12/§13).

---

## Slice 1 — Infra + Testing (~140 lines)

**Goal**: Bootstrap Vitest tooling + env template + migration folder layout. NO business code, NO Supabase CLI, NO Docker.
**Closes**: REQ-TI-01, REQ-TI-02, REQ-TI-03. Unblocks strict TDD for Slice 2+.
**Depends on**: none.

### 1.1 Testing dependencies
- [x] Install devDependencies: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `axe-core`, `@vitest/coverage-v8`.
- [x] Install runtime dep: `@supabase/supabase-js` and `@supabase/ssr` (needed by Slice 2 theming provider Server Action stub + all later slices).
- [x] Create `vitest.config.mts` (jsdom env, path aliases `@/lib/*`, `@/components/*`, coverage thresholds per REQ-TI-07: `lib/dal/` ≥80%, overall ≥60%).
- [x] Add npm scripts to `package.json`: `test`, `test:watch`, `test:coverage`. (No `test:db` — DB behavior tests live under `tests/db/*` and run inside `test`.)
- [x] Create `tests/setup.ts` with `@testing-library/jest-dom` matchers.
- [x] Smoke test `tests/smoke.test.ts` asserting `1 + 1 === 2` runs green (bootstrap proof, not TDD-governed).

### 1.2 Migration folder scaffold (no CLI — plain SQL files)
- [x] Create empty `supabase/migrations/` and `supabase/seed.sql` (empty, header comment: "Applied via Supabase dashboard SQL editor to both utopia-dev and utopia-test").
- [x] Create `supabase/README.md` documenting: (a) migration naming `NNNNN_verb_scope.sql`, (b) manual apply order to dashboard SQL editor, (c) rollback via the down-step comment header in each file, (d) Auth Hook dashboard registration checklist (Auth → Hooks → Custom Access Token → select `public.custom_access_token_hook`).

### 1.3 Env template
- [x] Create `.env.example` with the 8 vars from design §13: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL_TEST`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST`, `SUPABASE_SERVICE_ROLE_KEY_TEST`, `UTOPIA_ROOT_DOMAIN`, `UTOPIA_ROOT_DOMAIN_DEV`.
- [x] Verify `.env.local` is in `.gitignore`. (Found existing `.env*` pattern also silently ignored `.env.example`, which design §13 requires to be committed — added `!.env.example` negation plus explicit `.env*.local` line.)
- [x] Update `README.md` "Local setup" section: (1) create utopia-dev + utopia-test Supabase projects, (2) fill `.env.local` with 6 keys + 2 domains, (3) `npm install`, (4) `npm test`, (5) apply migrations via dashboard when they land in Slice 4+.

### 1.4 Verification
- [x] `npm test` runs the smoke test green.
- [x] `tsc --noEmit` passes on the skeleton.

**Exit criteria**: all 1.4 green. No business code added. No Supabase project needed yet (needed before Slice 4 per Global Prerequisites).

---

## Slice 2 — Design Tokens + Theming Provider (~380 lines)

**Goal**: Light palette + derived dark palette + `data-theme` toggle + Tailwind 4 `@theme`. No components yet.
**Closes**: REQ-DS-01, REQ-DS-02, REQ-DS-03, REQ-DS-04, REQ-DS-05, REQ-DS-06, REQ-DS-07.
**Depends on**: Slice 1.

### 2.1 Tokens (TDD)
- [x] RED `lib/design-tokens/tokens.test.ts` — every hex from design §8.2 exists on exported `lightTokens`.
- [x] GREEN `lib/design-tokens/tokens.ts` — light palette (REQ-DS-01).
- [x] RED `lib/design-tokens/dark.test.ts` — every hex from design §8.3 exists on `darkTokens`; contrast helper asserts ≥4.5:1 body text/terracota/success vs `--bg #1A1815` (REQ-DS-03/04).
- [x] GREEN `lib/design-tokens/dark.ts` — derived dark palette (design §8.3, sidebar `--sidebar-bg` fixed `#131312`).

### 2.2 Tailwind 4 CSS-first config + fonts
- [x] Rewrite `app/globals.css`: `:root`/`:root[data-theme="dark"]` custom properties + `@theme inline` mapping (design §8.5) (REQ-DS-02).
- [x] Load `next/font` (Archivo Black, Archivo, Space Mono) in `app/layout.tsx` (design §8.4).

### 2.3 ThemeProvider (TDD)
- [x] RED `components/theming/ThemeProvider.test.tsx` — reads `localStorage['utopia-theme']`; falls back to `prefers-color-scheme`; writes `data-theme` on `<html>`; exposes `useTheme()` (REQ-DS-05).
- [x] GREEN `components/theming/ThemeProvider.tsx` (design §8.6).
- [x] RED `components/theming/ThemeToggle.test.tsx` — click toggles theme, updates DOM + storage, no reload.
- [x] GREEN `components/theming/ThemeToggle.tsx`; wire into `app/layout.tsx`.
- [x] RED `components/theming/theme-persist.test.tsx` — theme choice also written to `configuracion(seccion='perfil', clave='theme')` via Server Action (REQ-DS-06). NOTE: this test is a mock-level contract test only — the real `configuracion` table doesn't exist until Slice 4; assert the Server Action call shape, not a live DB write.
- [x] GREEN — stub Server Action calling the (not-yet-existing) DAL write; wire real DAL call in Slice 4/6 follow-up task 4.7.

### 2.4 Verification
- [x] All Vitest suites green.
- [x] `tsc --noEmit` clean.
- [ ] Manual: dev server renders both themes; sidebar stays `#131312` in light theme (REQ-DS-07, spec §3.2). — pending user visual confirmation (not this agent's job per instructions).

**Exit criteria**: all 2.4 green. Sidebar dark constant verified via token assertion, not visual inspection alone.

---

## Slice 3 — Base Components + Demo Screen (~950 lines total — SPLIT into 3a/3b at apply time)

**Goal**: 7 base components + `/demo` consuming all in both themes. Etapa 0 closer.
**Closes**: REQ-DS-08 through REQ-DS-18.
**Depends on**: Slice 2.

Each component: RED → GREEN → REFACTOR, keyboard nav + ARIA + relevant empty/loading/error states.

### 3a.1 SearchableSelect
- [x] RED `components/ui/SearchableSelect.test.tsx` — search filter, ↑↓/Enter/Esc, disabled option, empty-results state (REQ-DS-09).
- [x] GREEN `components/ui/SearchableSelect.tsx`.

### 3a.2 Table
- [x] RED `components/ui/Table.test.tsx` — aligned/centered columns, Badge on "estado" column, empty state, loading skeleton (REQ-DS-10). Note: loading state uses a `data-testid="table-loading"` placeholder that Slice 3b will swap for the real Skeleton.
- [x] GREEN `components/ui/Table.tsx`.

### 3a.3 FilterBar
- [x] RED `components/ui/FilterBar.test.tsx` — live URL-param updates, debounced text, no submit button, "Clear filters" only when active (REQ-DS-11).
- [x] GREEN `components/ui/FilterBar.tsx`.

### 3b.1 Badge
- [x] RED `components/ui/Badge.test.tsx` — variants (success/warning/danger/neutral), never color-only (aria-label) (REQ-DS-10 dependency).
- [x] GREEN `components/ui/Badge.tsx`.

### 3b.2 Skeleton
- [x] RED `components/ui/Skeleton.test.tsx` — width/height props, `aria-busy=true` (REQ-DS-13).
- [x] GREEN `components/ui/Skeleton.tsx`.

### 3b.3 EmptyState
- [x] RED `components/ui/EmptyState.test.tsx` — required `cta` prop enforced at type level + runtime guard; no render without it (REQ-DS-12).
- [x] GREEN `components/ui/EmptyState.tsx`.

### 3b.4 ConfirmDialog
- [x] RED `components/ui/ConfirmDialog.test.tsx` — focus trap, Esc cancels, Enter confirms, `role="dialog"` + `aria-modal` (REQ-DS-14).
- [x] GREEN `components/ui/ConfirmDialog.tsx`.

### 3b.5 Demo screen (Etapa 0 closer)
- [x] Create `app/demo/page.tsx` rendering all 7 components with sample data (REQ-DS-16). NOTE: created at `app/demo/page.tsx`, not `app/(app)/demo/page.tsx` as design §8.8 states — the `(app)` route group (with its shell layout) does not exist yet in this codebase (it is scoped to a later slice); `app/(app)/demo` would 404 with no matching layout. Flagged as a design deviation below; safe to move under `(app)` once that route group lands.
- [x] RED `tests/a11y/demo-contrast.test.tsx` — contrast checked in both themes (REQ-DS-04/17). NOTE: filename is `.test.tsx` (not `.test.ts` as tasks.md states) because it renders JSX (`<DemoPage />`), which requires the `.tsx` extension under this project's esbuild/oxc transform. NOTE 2: axe-core's `color-contrast` rule is inoperable in jsdom without the native `canvas` package (verified empirically — see apply report); a real WCAG 2.1 contrast walker was written directly in the test file instead (same formula as `lib/design-tokens/dark.test.ts`), and axe-core is still run for structural ARIA/role coverage.
- [x] GREEN — satisfied; `tsc --noEmit` zero errors on demo + all 7 components (REQ-DS-18).

### 3.9 Verification (both 3a and 3b)
- [x] All Vitest suites green (84/84, 14 files).
- [x] `tsc --noEmit` clean.
- [x] `/demo` renders correctly in both themes (verified via automated contrast walker + component tests); axe contrast test green. Manual visual confirmation in the dev server is still a pending user step (not this agent's job per instructions).

**Exit criteria**: demo consumes all 7 components; both themes verified; axe AA green (Etapa 0 closer). **✅ ETAPA 0 CLOSED** — 84/84 tests, tsc clean, eslint clean.

---

## Slice 4 — Migrations A: tenant, modulo, tenant_modulo, configuracion (~320 lines)

**Goal**: DB schema for tenant-agnostic + tenant-scoped catalog tables, RLS from first migration.
**Closes**: REQ-MTD-01 through REQ-MTD-09, REQ-MTD-11/12 (seed pt.1).
**Depends on**: Slice 1 + Global Prerequisites (utopia-dev + utopia-test cloud projects exist; keys in `.env.local`).
**Approach**: Vitest DB-behavior test RED (fails against utopia-test cloud) → migration authored → apply via dashboard SQL editor to utopia-test → test GREEN → apply same SQL to utopia-dev.

### 4.1 Test-project harness
- [x] Create `lib/dal/supabase-test.ts` — factory that reads ONLY `NEXT_PUBLIC_SUPABASE_URL_TEST` / `_KEY_TEST` / `SERVICE_ROLE_KEY_TEST`, throws if any is missing. **Deviation**: does not `import 'server-only'` — that package is not an installed dependency and this slice may not add new deps; server-only-ness is enforced by convention (only ever imported from `tests/db/*`) instead of a build-time guard. Documented in apply-progress.
- [x] Create `tests/db/_helpers.ts` — `hasTestDb` boolean gate, `withScopedTenant(prefix)` fixture-slug helper, `resetTestData()` no-op stub (see design §12 safety note).
- [x] RED `tests/db/_smoke.test.ts` — `describe.skipIf(!hasTestDb)`; `service_role` client connects to utopia-test via an admin-only call; asserts env vars are `_TEST`-scoped. **Deviation**: uses `auth.admin.listUsers` instead of a literal `select now()` — `now()`/`version()` live in `pg_catalog`, not exposed via PostgREST/supabase-js without a custom RPC wrapper outside design §4's scope.
- [ ] GREEN — blocked: `utopia-dev`/`utopia-test` cloud projects do not exist yet; `.env.local` has no `_TEST` keys. Suite is `describe.skipIf`-gated and verified to skip cleanly (imports + type-checks). **Policy update (this apply run)**: DB testing postponed to end of Slice 8 per explicit instruction — this is a known, approved gap, not a silent skip.

### 4.2 Extensions + helpers
- [x] Author `supabase/migrations/00001_extensions_and_enums.sql` — `pgcrypto`, `set_updated_at()`, `auth_tenant_id()`, enums `tenant_estado`/`usuario_estado` (design §4). Down-step in header comment.
- [ ] Apply to utopia-test via dashboard SQL editor. — blocked, no cloud project yet (see 4.1).
- [x] RED `tests/db/helpers-behavior.test.ts` — `describe.skipIf(!hasTestDb)`; as authenticated with no claim, `select auth_tenant_id()` returns NULL; `tenant_estado` enum accepts every design value and rejects an unknown one.
- [ ] GREEN — blocked (postponed to Slice 8, see 4.1).

### 4.3 tenant
- [x] RED `tests/db/tenant.test.ts` — `describe.skipIf(!hasTestDb)`; table exists (service_role query); duplicate `subdominio` rejected (spec 3.1); authenticated claim A SELECT vs. non-matching claim (REQ-MTD-09).
- [x] Author `supabase/migrations/00002_tenant.sql` (design §4.1: table + trigger + `tenant_select_own` RLS, reversible down-step per REQ-MTD-10).
- [ ] Apply to utopia-test. Test GREEN. — blocked, no cloud project yet (see 4.1).

### 4.4 modulo + tenant_modulo
- [x] RED `tests/db/modulo.test.ts` — `describe.skipIf(!hasTestDb)`; as authenticated, SELECT `modulo` returns rows; INSERT/UPDATE/DELETE rejected (REQ-MTD-08, spec 3.3). As `service_role`, INSERT works.
- [x] RED `tests/db/tenant-modulo.test.ts` — `describe.skipIf(!hasTestDb)`; cross-tenant SELECT returns 0 (REQ-MTD-06/07); duplicate `(id_tenant, id_modulo)` INSERT rejected on PK (spec 3.4).
- [x] Author `supabase/migrations/00003_modulo_tenant_modulo.sql` (design §4.2/§4.3, composite PK REQ-MTD-04).
- [ ] Apply to utopia-test. Test GREEN. — blocked, no cloud project yet (see 4.1).

### 4.5 configuracion
- [x] RED `tests/db/configuracion.test.ts` — `describe.skipIf(!hasTestDb)`; cross-tenant SELECT returns 0, own tenant SELECT returns own rows (REQ-MTD-07, spec 3.2); duplicate `(id_tenant, seccion, clave)` INSERT rejected on PK (REQ-MTD-05).
- [x] Author `supabase/migrations/00004_configuracion.sql` (design §4.4).
- [ ] Apply to utopia-test. Test GREEN. — blocked, no cloud project yet (see 4.1).

### 4.6 Seed part 1
- [x] Author `supabase/seed.sql` — INSERT fixed `modulo` catalog (`inventario`, `ventas`, `precios`, `consignaciones`, `rendiciones`, `reportes`, `administracion`), idempotent via `on conflict (codigo) do nothing`.
- [ ] Apply to utopia-test via dashboard SQL editor. — blocked, no cloud project yet (see 4.1).
- [x] RED `tests/db/seed-idempotency.test.ts` — `describe.skipIf(!hasTestDb)`; run the seed insert twice via `service_role`, assert row count unchanged (REQ-MTD-12, spec 3.5).
- [ ] GREEN — blocked (postponed to Slice 8, see 4.1).

### 4.7 Wire theming Server Action to real DAL (follow-up to Slice 2 stub)
- [x] Replace the stub `configuracion` write from Slice 2 task 2.3 with a real DAL call to `configuracion` (upsert `seccion='perfil', clave='theme'`), gated on an authenticated session (`components/theming/persistThemePreference.ts`). New minimal DAL: `lib/dal/errors.ts`, `lib/dal/supabase.ts`, `lib/dal/session.ts` (all TDD, all mocked-Supabase tested).
- [x] RED/GREEN test replacing `theme-persist.test.tsx` → `components/theming/persistThemePreference.test.ts` — mocked Supabase client asserts exact upsert payload (`buildThemeConfiguracionPayload` + `id_tenant` from session), `verifySession` invocation, and the `no-session` graceful-failure branch. **Note**: this is a mocked round-trip, not a live-DB round-trip — the literal "row exists in configuracion for current tenant" integration assertion from the original task wording needs a real `utopia-test` project (Slice 8).

### 4.8 Verification
- [x] `npm test` — 102 passed, 18 skipped (7 `tests/db/*` files skip cleanly via `describe.skipIf`), 0 failed.
- [x] `tsc --noEmit` — 0 errors.
- [x] `eslint app components lib tests` — 0 errors, 0 warnings.
- [ ] Manual: apply same migrations 00001–00004 + seed to utopia-dev via dashboard. — blocked, no cloud project yet.

**Exit criteria**: partially met. Migration SQL authored and reviewed-ready; `tests/db/*` suites written test-first and proven to skip cleanly (import + type-check); RLS design proven only on paper until `utopia-test` exists. Full "green against utopia-test" exit criterion is explicitly deferred to end of Slice 8 per this run's instructions — re-run 4.1–4.6's GREEN steps once the cloud projects and `.env.local` keys exist.

---

## Slice 5 — Migrations B: rol, usuario, auditoria, Auth Hook (~420 lines)

**Goal**: Complete foundation schema; enable JWT `tenant_id` claim.
**Closes**: REQ-AG-01/02, REQ-AUTH-04, REQ-AL-01/05/06, REQ-AUTH-02/03, REQ-MTD-06 (remaining tables).
**Depends on**: Slice 4.
**Approach**: Vitest DB-behavior tests against utopia-test cloud (same as Slice 4); migrations applied via dashboard SQL editor.

### 5.1 rol
- [x] RED `tests/db/rol.test.ts` — cross-tenant access denied; INSERT with `permisos` shape `{ [modulo]: string[] }` accepted; sample jsonb-path query `permisos->'inventario' ? 'crear'` returns true (REQ-AG-02). Written as a `describe.skipIf(!hasTestDb)` stub (agility mode, no cloud project yet).
- [x] Author `supabase/migrations/00005_rol.sql` (design §4.5).
- [ ] Apply to utopia-test. Test GREEN. — blocked, no cloud project yet (see 4.1).

### 5.2 usuario
- [x] RED `tests/db/usuario.test.ts` — table exists with FK→`auth.users(id)` (verify via information_schema as service_role) (REQ-AUTH-04); cross-tenant SELECT returns 0 rows; INSERT of `usuario` without corresponding `auth.users` row rejected on FK. Written as a `describe.skipIf(!hasTestDb)` stub.
- [x] Author `supabase/migrations/00006_usuario.sql` (design §4.6).
- [ ] Apply to utopia-test. Test GREEN. — blocked, no cloud project yet (see 4.1).

### 5.3 auditoria (threat-matrix: audit tampering)
- [x] RED `tests/db/auditoria.test.ts` — as authenticated with matching claim, INSERT works and SELECT own tenant works; UPDATE/DELETE rejected (REQ-AL-05, threat-matrix "audit tampering"); cross-tenant SELECT returns 0 (REQ-AL-06); as `service_role`, UPDATE/DELETE STILL rejected because no permissive policy exists (proves immutability is structural). Written as a `describe.skipIf(!hasTestDb)` stub.
- [x] Author `supabase/migrations/00007_auditoria.sql` (design §4.7).
- [ ] Apply to utopia-test. Test GREEN. — blocked, no cloud project yet (see 4.1).

### 5.4 Auth Hook
- [x] Author `supabase/migrations/00008_auth_hook_tenant_id.sql` (design §5).
- [ ] Apply to utopia-test via dashboard SQL editor. — blocked, no cloud project yet (see 4.1).
- [ ] **Manual step**: register the hook in utopia-test dashboard: Auth → Hooks → Custom Access Token → select `public.custom_access_token_hook`. Document exact clicks in `supabase/README.md`. — checklist documented in `supabase/README.md`; actual dashboard click-through blocked, no cloud project yet.
- [x] RED `tests/db/auth-hook-claim.test.ts` — (a) service_role creates a real `auth.users` + matching `public.usuario` row for tenant A; sign in via `signInWithPassword`; decode the returned JWT (manual base64url decode, no `jose` dep); assert `tenant_id` claim equals tenant A's uuid (REQ-AUTH-02/03). (b) create an `auth.users` WITHOUT a `public.usuario` row; sign in; decode JWT; assert `tenant_id` claim absent. Written as a `describe.skipIf(!hasTestDb)` stub; case (c) (hook re-fires on every token issue) deferred to full DB-behavior pass at end of Slice 8 for brevity in agility mode.
- [ ] GREEN — passes after hook registered. — blocked, no cloud project yet.

### 5.5 RLS hygiene (threat-matrix: RLS bypass via forgotten guard)
- [x] RED `tests/db/rls-enforcement.test.ts` — for each foundation table (`tenant`, `modulo`, `tenant_modulo`, `configuracion`, `rol`, `usuario`, `auditoria`): assert that as `authenticated` with NO `tenant_id` claim, every SELECT returns 0 rows AND every INSERT/UPDATE/DELETE is rejected (excepting `modulo` SELECT which is permitted to all authenticated by design §4.2). As `service_role`, all pass (REQ-TI-09, compensates dropped `rls_enabled.test.sql`). Written as a `describe.skipIf(!hasTestDb)` stub.
- [ ] GREEN — passes because prior migrations enabled RLS + proper policies; this suite locks it in as a regression gate. — blocked, no cloud project yet.

### 5.6 sp_* audit-wrapped mutation function (moved earlier from Slice 6b per orchestrator clarification below)
- [x] Author `supabase/migrations/00009_seed_setup_functions.sql` — define `sp_update_usuario(...)` and `sp_change_password_user(...)` helpers per design §10 (`sp_<verb>_<entity>` convention).
- [ ] Apply to utopia-test. — blocked, no cloud project yet (see 4.1).
- [x] RED `tests/db/sp-audit-atomicity.test.ts` — call `sp_update_usuario` with a valid payload, assert both the `usuario` row updates AND an `auditoria` row is inserted in the same transaction; force a failure (e.g., invalid FK) and assert BOTH roll back (REQ-AL-03). Written as a `describe.skipIf(!hasTestDb)` stub.
- [ ] GREEN — passes. — blocked, no cloud project yet.

### 5.7 Seed part 2
- [x] Extend `supabase/seed.sql` — ≥2 tenants (`utopia-demo`, `boutique-alfa`) + 1 rol each ("Administrador") + link ALL 7 modulos via `tenant_modulo` + 1 `configuracion` per tenant (`perfil`/`theme`). Idempotent via `on conflict do nothing` (REQ-MTD-11, spec 3.5).
- [ ] Apply to utopia-test via dashboard. — blocked, no cloud project yet (see 4.1).

### 5.8 Verification
- [x] `npm test` — all non-DB suites pass; 7 new DB-behavior suites (rol, usuario, auditoria, auth-hook-claim, rls-enforcement, sp-audit-atomicity, plus seed-idempotency from Slice 4) skip cleanly via `describe.skipIf(!hasTestDb)`.
- [x] `tsc --noEmit` — 0 errors.
- [x] `eslint app components lib tests` — 0 errors.
- [ ] Manual: apply migrations 00005–00009 + extended seed to utopia-dev via dashboard; register hook in utopia-dev too. — blocked, no cloud project yet.

**Exit criteria**: partially met, same policy as Slice 4. Migration SQL for `rol`/`usuario`/`auditoria`/Auth Hook/`sp_*` authored and reviewed-ready; `tests/db/*` suites written per design/spec and proven to skip cleanly (import + type-check); RLS/Auth-Hook/atomicity behavior proven only on paper until `utopia-test` exists. Full "green against utopia-test" exit criterion explicitly deferred to end of Slice 8 per this run's instructions.

---

## Slice 6 — Tenant Resolution + DAL Skeleton + Cross-tenant Isolation (SPLIT into 6a/6b, ~470 lines total)

**Goal**: `proxy.ts` + DAL functions + end-to-end cross-tenant isolation tests via real client sign-in. **Etapa 1 closer**.
**Closes**: REQ-TR-01 through REQ-TR-11, REQ-AUTH-10, REQ-TI-04/05/07/10/11.
**Depends on**: Slice 5 (sp_* functions and auth hook already live in utopia-test).

### 6a.1 Supabase client factory (threat-matrix: service-role key exposure)
- [x] RED `lib/dal/supabase.test.ts` — server/browser/service clients constructed with correct URL/keys; service client never importable from a `'use client'` module (import-graph assertion, threat-matrix "service-role key exposure"). Already existed from Slice 4; verified against design §5 during Slice 6 apply — no gaps found, comment header already states "server only... never import this from a 'use client' module".
- [x] GREEN `lib/dal/supabase.ts` (design §5). Already existed from Slice 4; unchanged this slice.

### 6a.2 verifySession + errors
- [x] RED `lib/dal/session.test.ts` — throws `AuthorizationError('no-session')` with no JWT; returns `{user,tenantId}` when `tenant_id` claim present; `cache()` memoizes within a render (REQ-AUTH-10). Already existed from Slice 4/5 (JWT claim decoding fixed in Slice 5 task 5.8); verified against design §5 during Slice 6 apply — no gaps found.
- [x] GREEN `lib/dal/session.ts` + `lib/dal/errors.ts` (design §5/§7). Already existed; unchanged this slice.

### 6a.3 proxy.ts (threat-matrix: reserved-subdomain routing)
- [x] RED `proxy.test.ts` — reserved subdomains (`www`,`admin`,`api`,`app`) route to landing (REQ-TR-09); missing subdomain → landing (REQ-TR-11, both prod bare root and dev bare root with port); valid subdomain sets `x-utopia-tenant-subdomain` header for both prod (REQ-TR-04) and `*.localhost` dev (REQ-TR-08); `UTOPIA_ROOT_DOMAIN` override honored; matcher excludes `/_next/static`, `/_next/image`, `/api/health`, static assets (via `next/experimental/testing/server`'s `unstable_doesMiddlewareMatch` — the installed Next 16.2.10 build still exports the pre-rename `unstable_doesMiddlewareMatch`, NOT `unstable_doesProxyMatch` as the newer docs prose suggests; verified directly against the installed `.d.ts`, not assumed from docs text).
- [x] GREEN `proxy.ts` (design §6, verbatim logic — module-level `RESERVED`/`ROOT_PROD`/`ROOT_DEV`, host/port strip, reserved+bare-root → `NextResponse.next()` with no header, valid subdomain → `NextResponse.next({request:{headers}})`).

### 6b.1 verifyTenantMatch (threat-matrix: subdomain spoofing)
- [x] RED `lib/dal/tenant.test.ts` — throws `tenant-mismatch` when subdomain header is null/empty (no `verifySession()` call, short-circuit); throws when no tenant matches the subdomain; throws when the resolved tenant's `id_tenant` ≠ session's `tenantId` (spoofing, spec 3.4); passes (resolves void) when matched; `getTenantSubdomainFromHeaders()` reads the header via `next/headers` or returns null.
- [x] GREEN `lib/dal/tenant.ts` (design §7) — `verifyTenantMatch` wrapped in React `cache()`; queries `tenant` by `subdominio` (not by `id_tenant`, a minor direction-swap from the design §7 pseudocode but functionally identical: both directions compare the same two values) then compares `id_tenant` against the session.

### 6b.2 End-to-end cross-tenant isolation via real sign-in (Vitest, against utopia-test)
- [x] RED `tests/db/e2e-tenant-isolation.test.ts` — using `service_role`, create two real Supabase Auth tenants/users (`test_<uuid>_` slugged via `withScopedTenant`); sign in as user A via `signInWithPassword`; obtain a real session (with Auth Hook claim); using the anon client with that session, SELECT `configuracion` for tenant B → 0 rows (REQ-TI-10); attempt INSERT into tenant B's `configuracion` → rejected. Written as a `describe.skipIf(!hasTestDb)` structural stub (agility mode, no cloud project yet — see 4.1 policy).
- [ ] GREEN — blocked: no cloud project yet. Postponed to end of Slice 8 per this run's explicit instruction (same policy as Slices 4/5).

### 6b.3 Concurrency test
- [x] RED `tests/db/configuracion-concurrency.test.ts` — two concurrent INSERTs, same `(id_tenant, seccion, clave)`, fire via `Promise.allSettled` — exactly one rejects on PK (REQ-TI-11, spec test-infrastructure 3.3). `describe.skipIf(!hasTestDb)` structural stub.
- [ ] GREEN — blocked: no cloud project yet. Postponed to end of Slice 8.

### 6.7 Verification
- [x] `npm test` — 124 passed, 49 skipped, 0 failed, 35 files (adds 4 new non-skipped suites: `proxy.test.ts`, `lib/dal/tenant.test.ts`, plus 2 new `describe.skipIf` stubs — `tests/db/e2e-tenant-isolation.test.ts`, `tests/db/configuracion-concurrency.test.ts`; `lib/dal/supabase.test.ts`/`session.test.ts` already existed from Slices 4/5).
- [ ] Manual: `<tenant>.localhost:3000` reaches app; `www.localhost:3000` routes to landing. — blocked, no dev server / cloud project verification performed by this agent per instructions.

**Exit criteria (Etapa 1 closer) — partially met, same policy as Slices 4/5**: all Slice 6 CODE is complete, type-checked, and unit/structural-tested (proxy resolution logic, DAL tenant-match logic, matcher exclusions). The literal end-to-end isolation test ("los tests de aislamiento pasan antes de avanzar", proposal verbatim) is authored and proven to skip cleanly, but its GREEN run against `utopia-test` is explicitly deferred to end of Slice 8 per this run's instructions, consistent with Slices 4/5. **✅ ETAPA 1 CLOSED (code-complete)** — foundation DB tables (Slices 4-5) + tenant resolution (`proxy.ts` + `lib/dal/tenant.ts`) + cross-tenant isolation infrastructure (E2E + concurrency stubs) are all delivered; only the live-DB GREEN proof remains, scheduled for the end-of-Slice-8 full DB-behavior pass.

---

## Slice 7 — Auth: Login + Settings + Password Re-verify (~410 lines)

**Goal**: Login flow, per-user settings, password change with current-password re-verification.
**Closes**: REQ-AUTH-01, REQ-AUTH-05/06/07/08/09, REQ-DS-06 (theme sync wired for real, see 2.3 stub follow-up).
**Depends on**: Slice 6.

### 7.1 Login page
- [x] `app/(auth)/login/LoginForm.test.tsx` — smoke test (agility mode, no strict RED-first TDD this run): renders email/password inputs + submit button.
- [x] `app/(auth)/login/page.tsx` + `LoginForm.tsx` + `actions.ts` (`signInWithPassword`, design §5). `app/(auth)/layout.tsx` added as the shared centered-card auth shell.
- **Deviation**: file layout is `LoginForm.tsx` (Client Component) + `actions.ts` + `LoginForm.test.tsx`, not the single `login.test.tsx` named above — matches this run's explicit instructions. Full spec 3.1/3.2 (session + redirect / wrong-password) behavioral coverage deferred to live-DB pass (no cloud project yet, same policy as Slices 4-6); the smoke test only proves the form renders the right fields/labels/autocomplete.

### 7.2 Settings shell
- [x] `app/(auth)/settings/SettingsView.test.tsx` — smoke test: renders email, role placeholder, and the password-change form fields/button.
- [x] `app/(auth)/settings/page.tsx` (`verifySession`-backed Server Component, redirects to `/login` on `AuthorizationError`) + `SettingsView.tsx` (Client Component: profile info + password section).
- [x] Real `configuracion` DAL write for theme persistence — already wired in `components/theming/persistThemePreference.ts` since Slice 4 (task 4.7); re-verified this slice, no change needed — REQ-DS-06.
- **Deviation**: role name is a literal placeholder (`"—"`) — `Session` has no `rolId`/role-name field until Slice 8 (guard work); "reachable from profile menu on every screen" (REQ-AUTH-09) is NOT wired this slice — there is no app shell/profile menu yet (Slice 8 territory). `/settings` and `/login` are directly reachable by URL only.

### 7.3 Password change flow (SECURITY-CRITICAL)
- [x] `app/(auth)/settings/password-actions.test.ts` — 5 cases: correct current password → success + audit RPC called with `p_id_usuario`; WRONG current → rejected, `updateUser` NOT called (mock assertion, REQ-AUTH-06); mismatched confirm → rejected, Supabase never called; below-minimum-length new password → rejected, Supabase never called (REQ-AUTH-07); audit RPC throwing → password change still reports success (best-effort).
- [x] `app/(auth)/settings/PasswordChangeForm.tsx` (client-side min-length + confirm-match validation in `onSubmit`, blocks the Server Action on failure) + `app/(auth)/settings/password-actions.ts` — `signInWithPassword({email, password: currentPassword})` first, `updateUser({password: newPassword})` only on success (REQ-AUTH-05).
- **Deviation**: file is `password-actions.ts` (flat, alongside `page.tsx`), not the nested `password/actions.ts` path named above — matches this run's explicit instructions.

### 7.4 Audit password change
- [x] Covered inside `password-actions.test.ts` (not a separate `password-audit.test.ts` file, per this run's instructions) — asserts `rpc('sp_change_password_user', { p_id_usuario })` is called on success and is best-effort (failure doesn't flip a successful password change to failed). The RPC itself (migration `00009`) inserts `cambios: '{}'::jsonb` — no password value ever reaches the audit row.
- [x] `sp_change_password_user` RPC wired inside `changePasswordAction`, called AFTER `updateUser` succeeds.
- **Note**: the real audit row only exists once `utopia-dev`/`utopia-test` cloud projects exist and this RPC actually runs against a live DB (same postponement policy as Slices 4-6) — this slice proves the call shape/best-effort behavior via mocks only.

### 7.5 Verification
- [x] All Vitest suites green: 131 passed / 49 skipped (0 failed), 38 files.
- [x] `npx tsc --noEmit` — 0 errors.
- [x] `npx eslint app components lib tests` — 0 errors, 0 warnings.
- [ ] Manual: login → settings → wrong current password rejected → correct current password succeeds → next login uses new password. — blocked, no dev server / cloud project verification performed by this agent per instructions (same policy as prior slices).

**Exit criteria**: password change (current-password re-verify) works in both themes (code-complete, styled with existing tokens); audit RPC call wired and best-effort; wrong-current-password rejected before touching auth DB (proven via mock assertion — `updateUser` never called). Live-DB GREEN proof postponed to end of Slice 8, consistent with Slices 4-6.

---

## Slice 8 — Access Guard + Administración Skeleton (SPLIT into 8a/8b, ~660 lines total)

**Goal**: `requireModuleRole` DAL helper + Administración route group with user/configuracion CRUD skeleton. **Etapa 2 closer**.
**Closes**: REQ-AG-01 through REQ-AG-09, REQ-ADM-01 through REQ-ADM-10.
**Depends on**: Slice 7.

### 8a.1 requireModuleRole guard (both-condition, threat-matrix: RLS/guard bypass)
- [ ] RED `lib/dal/guard.test.ts` — module enabled + role has action → passes (spec 3.1); module disabled + role has action → throws `module-disabled` (spec 3.3); module enabled + role lacks action → throws `no-permission` (spec 3.2); `accion` absent from list → fail-closed (spec 3.5).
- [ ] GREEN `lib/dal/guard.ts` (design §7/§9): `cache()`-wrapped `loadTenantModulo`/`loadRolPermisos`.

### 8a.2 Auth error → HTTP/UI mapping
- [ ] RED `app/api/_middleware/auth-error.test.ts` — API layer maps `AuthorizationError` → 403 JSON `{code,message}` (REQ-AG-08); UI wrapper redirects to `/no-autorizado` (REQ-AG-09).
- [ ] GREEN — implement `handleAuthError` mapping helper (design §9).

### 8b.1 Administración route group
- [ ] RED `app/(app)/administracion/layout.test.tsx` — non-admin role → redirect `/no-autorizado`; admin role → renders; link absent from main sidebar (REQ-ADM-01, spec 3.4/3.5).
- [ ] GREEN `app/(app)/administracion/layout.tsx` calls `requireModuleRole(session,'administracion','ver')` (REQ-ADM-02).

### 8b.2 User CRUD (invite + edit + soft-delete + reset)
- [ ] RED `app/(app)/administracion/usuarios/crud.test.ts` — invite creates `auth.users`+`public.usuario` (REQ-ADM-03/04); edit updates `nombre_completo`+`id_rol` via `sp_update_usuario` (REQ-ADM-05); deactivate flips `estado_usuario='inactivo'` AND bans the auth user (REQ-ADM-06/07); reset triggers `admin.generateLink`/`updateUserById` (REQ-ADM-08).
- [ ] GREEN — Server Actions calling `auth.admin.inviteUserByEmail` + `supabase.rpc('sp_update_usuario', ...)` (design §11).

### 8b.3 Audit administración
- [ ] RED `app/(app)/administracion/usuarios/audit.test.ts` — every invite/edit/deactivate writes `auditoria` row (`entidad='usuario'`, correct `accion`, `entidad_id`, `cambios`) (REQ-ADM-10).
- [ ] GREEN — wire RPC/`logAudit` in each action.

### 8b.4 Configuracion CRUD skeleton
- [ ] RED `app/(app)/administracion/configuracion/list.test.tsx` — lists entries for current tenant grouped by `seccion`; create/edit/delete updates DB; audit rows written (REQ-ADM-09/10).
- [ ] GREEN `app/(app)/administracion/configuracion/page.tsx` + `actions.ts` (uses `lib/dal/audit.ts logAudit` directly, not RPC, per design §10 fallback path).

### 8.7 Verification
- [ ] All Vitest suites green; `npm run test:db` still green (no regression).
- [ ] Manual: admin invites user → user receives email, can log in; non-admin hitting `/administracion` redirects.

**Exit criteria (Etapa 2 closer)**: "ningún endpoint responde sin validar módulo+rol" (proposal, verbatim) — no Administración endpoint responds without the guard; user CRUD works under guard; audit rows written.

---

## Post-slice: SDD Verify + Archive

- [ ] Run `sdd-verify` after Slice 8 to confirm all 88 REQ-* satisfied by delivered code + tests.
- [ ] Run `sdd-archive` to move specs into `openspec/specs/` (main specs).

## Gaps Found (flagged, not invented)

- ~~[ORCHESTRATOR-BLOCKED] Design §14 groups migration `00009_seed_setup_functions.sql` under "resolution/audit = slice 6" but its only concrete example (`sp_update_usuario`) is consumed by Slice 8's admin edit flow.~~ **Resolved**: `sp_*` functions moved to Slice 5 (task 5.6) so they exist before both the isolation E2E in Slice 6 and the admin flow in Slice 8 that consumes them. Design §14 remains as-authored (the migration filename `00009_seed_setup_functions.sql` is unchanged); only its slice grouping shifted.

## Decision Log (post-planning updates applied to design.md and tasks.md)

- **2026-07-24** — Dropped pgTAP + Supabase CLI + Docker from this change. All DB behavior is exercised by Vitest suites under `tests/db/*` against a dedicated Supabase cloud project (`utopia-test`). Rationale: user environment has Docker Desktop off and Supabase CLI missing; enabling both was blocking start-of-apply. Trade-off: policy-definition coverage (pgTAP inspects the SQL of a policy) is replaced by policy-effect coverage (Vitest asserts the observable behavior for `authenticated` and `service_role` clients). Impact: design §12/§13/§15 updated; Slices 1/4/5/6 rewritten; Slice 8 references `sp_*` (moved from Slice 6b to Slice 5.6) still valid. Migration file numbering unchanged. See `sdd/foundations-multitenant/product-decisions` topic in Engram for the persisted decision.
