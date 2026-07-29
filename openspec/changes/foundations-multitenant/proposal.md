# Proposal: Foundations — Multi-tenant core, RLS, auth, and design system

**Change**: `foundations-multitenant`
**Covers**: Planificacion Etapa 0 (design system) + Etapa 1 (multi-tenant DB with RLS) + Etapa 2 (auth, users, roles, module+role guard). Etapas 3+ are OUT of scope.

## Intent

Establish the reusable foundation every later Utopia module depends on: a light/dark design system with base components, a fully RLS-isolated multi-tenant Postgres schema for the foundation entities, and an auth layer with a mandatory module+role double-check guard. Nothing here implements domain logic (inventory, sales, finance) — it builds the scaffolding those modules will reuse without reinvention.

## Motivation

- **Etapa 0** is the highest-leverage RNF work: if base components are weak, every later screen reinvents UI — the exact failure the brief prohibits (§6.1 "Consistencia de patrones de UI").
- **Etapa 1** requires RLS active from the first migration; tenant isolation is a security hole if deferred (Anexo §1, brief §6.3).
- **Etapa 2** closes documented prior-project failures the brief calls out explicitly (Anexo "Pendientes"): missing password change, missing per-user settings, and no dark mode.
- The project is greenfield: no Supabase, no test runner, no components. This change bootstraps all three so `sdd-apply` can enforce strict TDD from here forward.

## Scope

### In Scope

**Etapa 0 — Design system**
- Scaffold domain-oriented folder structure (decoupled domain services).
- Design tokens (color, type, spacing, radii, shadows) derived from `Utopía Sistema Oficial .html`; light palette + **derived** dark palette; theming provider with persistence; Tailwind 4 config.
- ~7 base components sufficient to demo the pattern: SearchableSelect, standard Table, live Filter pattern, status Badge, Skeleton, EmptyState (with CTA), ConfirmDialog.
- One demo screen consuming all base components in both themes.

**Etapa 1 — Multi-tenant DB + RLS**
- Supabase cloud project + local dev via Supabase CLI; `.env.local` variables.
- Migration system (`supabase/migrations`).
- Foundation tables: `Tenant`, `Modulo`, `TenantModulo`, `Usuario`, `Rol`, `Configuracion`, `Auditoria`.
- RLS policy per table filtering by `idTenant`, enabled from the first migration; unique/index constraints where the brief mandates them.
- Auditoria written via a DAL helper called from every mutation (not triggers).
- Seed: ≥2 tenants, distinct roles + modules.
- Tenant-resolution `proxy.ts` (subdomain) + authoritative DAL check.
- Isolation tests: pgTAP (DB-level) + Vitest (DAL integration).

**Etapa 2 — Auth + guard + Administración skeleton**
- Login flow (Supabase Auth + `@supabase/ssr`).
- Password change with current-password re-verification.
- Per-user profile/settings screen (all roles).
- Module+role guard as a shared DAL helper (`permisos[modulo]?.includes(accion)`).
- Administración module skeleton: user CRUD under RLS, Configuracion sections skeleton (not visible to the main business).

**Testing infrastructure (blocking)**
- Install Vitest + @testing-library/react + @testing-library/user-event.
- Install Supabase CLI (Docker); configure pgTAP via `supabase test db`.
- npm scripts: `test`, `test:watch`, `test:coverage`, `test:db`. Strict TDD becomes ACTIVE for this change's apply phase onward.

### Out of Scope
- Inventory, products, categories, item state machine, QR (Etapa 3).
- Prices, price rules, price pipeline (Etapa 4).
- Sales, customers, reservations (Etapa 5).
- Consignations, returns, `MovimientoItem` (Etapa 6).
- Provider rendition, expenses (Etapa 7).
- Reports, dashboard, alerts (Etapa 8).
- Etapa 9 final polish. **Exception**: Auditoria IS in scope here.
- ORM choice (raw `supabase-js` for this change; revisit in a data-heavy change).
- Any entity in the exploration not named in the In Scope list is explicitly deferred.

## Capabilities

### New Capabilities
- `design-system`: tokens (light + derived dark), theming provider, base components, demo screen.
- `multi-tenant-data`: foundation tables, RLS policies, seed, migration system.
- `tenant-resolution`: subdomain parsing in `proxy.ts` + authoritative DAL tenant check.
- `auth`: login, password change with re-verification, per-user settings.
- `access-guard`: module+role double-check DAL helper.
- `audit-log`: `Auditoria` entity + DAL write helper invoked from every mutation.
- `administration`: user CRUD + Configuracion sections skeleton.
- `test-infrastructure`: Vitest + pgTAP harness, scripts, RLS isolation suites.

### Modified Capabilities
- None (greenfield — no existing specs).

## Approach / High-level design

Decisions below are settled, not options.

1. **Configuracion entity** `(idTenant, seccion, clave, valor jsonb, tipo)` key/value. Overrides the diagram's `Tenant.configFinanzas jsonb`.
2. **Auditoria in this change**, written via a DAL helper called from every mutation — NOT Postgres triggers, NOT deferred to Etapa 9.
3. **Rol.permisos shape** `{ [moduloCodigo]: string[] }` — e.g. `{ inventario: ["ver","crear","editar"] }`. Guard = `permisos[modulo]?.includes(accion)`.
4. **RLS strategy**: JWT custom claim `tenant_id` set by a Supabase Auth Hook at user creation (idiomatic, pgTAP-testable). Subquery fallback (`idTenant = (select idTenant from usuario where id = auth.uid())`) documented for cases where the claim can't be trusted (service-role admin ops); JWT claim is the primary path.
5. **Password change UX**: re-verify current password via `signInWithPassword` before `updateUser({ password })`. Non-negotiable — fixes a documented prior-project failure.
6. **Dark mode**: derive the dark palette from the light-only HTML in `sdd-design`. Invert neutrals (`#F7F5F1` cream → dark warm neutral; `#141210` text → light warm neutral) and adapt accents (`#E9A6BC` pink, `#B87A5A` terracotta, `#3E8E5A` success) for contrast. Sidebar stays permanently dark in both themes.
7. **Supabase from ZERO**: create cloud project + local dev via Supabase CLI + `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
8. **Tenant resolution via subdomain**: `tenant.utopia.app` in prod, `*.localhost` in dev (verified on Chrome/Firefox without hosts edits). Implemented in `proxy.ts` (Next.js 16 rename — NOT `middleware.ts`). Proxy does OPTIMISTIC parse + header injection; the DAL performs the authoritative check (defense in depth).

## Deliverables (by slice)

| # | Slice | Concrete artifacts |
|---|-------|--------------------|
| 1 | Infra + testing | Vitest + Testing Library, Supabase CLI, pgTAP scaffold, `.env.local`, `vitest.config.ts`, `package.json` scripts |
| 2 | Tokens + theming | Design tokens (light + derived dark), theming provider + persistence, Tailwind 4 config |
| 3 | Base components + demo | SearchableSelect, Table, Filter pattern, Badge, Skeleton, EmptyState, ConfirmDialog + demo page (Etapa 0 closer) |
| 4 | Migrations A | `Tenant`, `Modulo`, `TenantModulo`, `Configuracion` + RLS + seed |
| 5 | Migrations B | `Usuario`, `Rol`, `Auditoria` + RLS + Auth Hook for JWT `tenant_id` claim |
| 6 | Tenant resolution | `proxy.ts` + DAL skeleton + isolation tests (pgTAP + Vitest) — Etapa 1 closer |
| 7 | Auth | Login, password change with re-verify, per-user settings |
| 8 | Guard + Administración | Module+role guard DAL helper + Administración skeleton with user CRUD — Etapa 2 closer |

## Chained PR forecast

This change WILL exceed the 400-line budget by a wide margin. Forecast: 8 chained PRs, each ≤400 authored lines, each passing its own tests before the next. Boundaries map 1:1 to the Deliverables slices above. `sdd-tasks` will finalize slice sizing; this proposal only forecasts them.

- **400-line budget risk**: High
- **Chained PRs recommended**: Yes
- Slice order enforces dependencies: infra → tokens → components → schema A → schema B → resolution/isolation → auth → guard/admin.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json`, `vitest.config.ts` | New/Modified | Test runner, scripts, deps |
| `supabase/` | New | CLI config, `migrations/`, `seed.sql`, `tests/` (pgTAP) |
| `app/` | Modified | Theming provider, demo screen, auth + settings + Administración routes |
| `proxy.ts` | New | Tenant subdomain resolution (Next.js 16) |
| `lib/dal/` | New | Tenant check, module+role guard, Auditoria helper |
| `components/` | New | Base component library |
| `styles`/tokens | New | Design tokens + Tailwind config |
| `.env.local` | New | Supabase URL/keys |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Next.js 16 breakages (`middleware.ts` deprecated) | High | Use `proxy.ts`; codemod `npx @next/codemod@canary middleware-to-proxy .`. Proxy defaults to Node runtime (supabase-js works). Proxy is NOT authoritative auth — real checks in the DAL. Server Actions can escape a proxy matcher, so the DAL guard is mandatory defense in depth. |
| Docker/Supabase CLI unavailable in dev/CI | Med | Call out as a dev-env prerequisite; pgTAP half blocks without Docker. Verify before slice 1 closes. |
| Dark-mode derivation from light-only HTML | Med | Derive palette in `sdd-design` (decision 6); validate contrast (WCAG) on the demo screen in both themes. |
| JWT `tenant_id` claim not set at user creation | Med | Auth Hook sets it; document + implement subquery fallback (decision 4) as defense in depth; pgTAP "RLS enabled on all tables" hygiene test. |
| Testing infra bootstraps two runners (pgTAP + Vitest) | Med | Stand both up in slice 1 before any business logic; treat green tests as slice gate. |
| Diagram/brief drift (`Configuracion`/`Auditoria` absent from diagram) | Low | Brief wins per its own source priority; decisions 1–2 settle both. Flag recurring drift for later changes' explore. |

## Assumptions

- `*.localhost` wildcard subdomains work in dev on Chrome/Firefox without hosts edits (verified; no fallback path prefix needed).
- ORM deferred past this change; raw `supabase-js` suffices for auth/tenant/RLS/seed.
- Components not literally shown in the HTML mockup (Table, Filter, EmptyState) are extrapolated to match the visual language — the brief says use the HTML as a guide, not to copy literally.
- `TenantModulo` uses composite PK `(idTenant, idModulo)` (confirm in design).
- One user belongs to one tenant (no cross-tenant membership), so the JWT claim never needs mid-life resync.

## Dependencies

- Supabase cloud account + local Docker (Supabase CLI).
- Next.js 16 docs under `node_modules/next/dist/docs/` (mandatory pre-code review per AGENTS.md).

## Rollback Plan

- Each slice is an isolated chained PR; revert the offending PR without touching earlier slices.
- DB migrations are additive and reversible via Supabase migration down-steps; seed is idempotent.
- No production tenants exist yet (greenfield), so schema rollback carries no data-loss risk.
- Theming/components are additive; reverting a component PR leaves earlier slices working.

## Success Criteria

- [ ] **Etapa 1 (verbatim)**: "los tests de aislamiento pasan antes de avanzar" — a tenant cannot see or modify another tenant's data (pgTAP + Vitest green).
- [ ] **Etapa 2 (verbatim)**: "ningún endpoint responde sin validar módulo+rol" — no endpoint responds without validating module+role.
- [ ] **Etapa 0**: one demo screen consumes ALL base components, compiles (`tsc --noEmit`), and works in both light and dark modes.
- [ ] Password change (with current-password re-verify) and per-user settings exist and are tested in both themes.
- [ ] RLS enabled on every foundation table (pgTAP hygiene test asserts it).
- [ ] Seed provisions ≥2 tenants with distinct roles + modules.
- [ ] `test`, `test:watch`, `test:coverage`, `test:db` scripts run; strict TDD active for apply.

## Next SDD phase

Recommend `sdd-spec` — turn the eight capabilities above into delta specs with Given/When/Then scenarios and RFC 2119 requirements (RLS isolation, module+role guard, password re-verify, theming coverage).
