# Exploration: Foundations — Multi-tenant core, RLS, auth, and design tokens

**Change**: `foundations-multitenant`
**Sources read**: `DiagramaDeClases.drawio` (730 lines, full parse), `Ejecucion Utopia (reorganizado).docx.txt` (242 lines, full read), `Utopía Sistema Oficial .html` (478KB, token-extracted — see method note), `node_modules/next/dist/docs/` (proxy.md, multi-tenant.md, authentication.md, testing/vitest.md), Supabase docs (Context7, pgTAP RLS testing).

---

## 1. Current State

Repo is a skeleton `create-next-app` (Next.js 16.2.10, React 19.2.4, TS5, Tailwind 4). No Supabase dependency, no ORM, no test runner, no `app/(routes)` beyond the default `layout.tsx`/`page.tsx`. `openspec/` SDD scaffolding exists (`config.yaml`, `project-context.md`, `testing-capabilities.md`) but no code has been written yet. This is a greenfield foundations change.

---

## 2. Full Entity Inventory (from `DiagramaDeClases.drawio`)

The diagram contains **19 entities** total. Foundations-layer entities are detailed in §3; the rest are inventory-only (out of scope for this change, listed for context/traceability).

| # | Entity | In this change's scope? |
|---|---|---|
| 1 | Tenant | ✅ Foundations |
| 2 | Modulo | ✅ Foundations |
| 3 | TenantModulo | ✅ Foundations |
| 4 | Usuario | ✅ Foundations |
| 5 | Rol | ✅ Foundations |
| 6 | Proveedor | ❌ later (proveedores/productos) |
| 7 | CargaProveedor | ❌ later — **note**: brief §3.2 calls this `IngresoMercaderia` with a `tipoIngreso` enum (compra/consignacion); diagram calls it `CargaProveedor` with no `tipoIngreso` field. Naming/field drift — flag for spec phase. |
| 8 | Producto | ❌ later |
| 9 | PrecioFormaPago | ❌ later |
| 10 | Categoria | ❌ later |
| 11 | ItemProducto (stock) | ❌ later |
| 12 | MovimientoItem | ❌ later |
| 13 | Venta | ❌ later |
| 14 | DetalleVenta | ❌ later |
| 15 | Gasto | ❌ later |
| 16 | CategoriaGasto | ❌ later |
| 17 | Consignacion | ❌ later |
| 18 | DetalleConsignacion | ❌ later — brief calls it `ConsignacionDetalle` (order swapped). Cosmetic but should be normalized once in spec. |
| 19 | RendicionProveedor | ❌ later |
| 20 | Comprobante | ❌ later |

**Entities required by the brief but ABSENT from the diagram** (important — see §7 open questions):
`Configuracion`, `Auditoria`, `Cliente`, `Reserva`, `DetalleReserva`, `CostoProducto`, `ReglaPrecio`. Of these, **`Configuracion` is directly relevant to this foundations change** (brief §3.1) and **`Auditoria`** is arguably foundational infrastructure (brief §4.5) even though the user's scope list for this change didn't name it explicitly.

---

## 3. Foundations-Layer Entities — Full Detail

### Tenant
| Field | Type | Notes |
|---|---|---|
| idTenant | uuid (PK) | |
| nombreComercial | string | |
| subdominio | string (unique) | drives tenant resolution |
| logoUrl | string | |
| colorPrimario | string | |
| **configFinanzas** | **json** | ⚠️ CONTRADICTS brief §3.1 — see §7 |
| estadoTenant | enum | values not specified in diagram |

### Modulo (fixed catalog, tenant-agnostic)
| Field | Type |
|---|---|
| idModulo | uuid (PK) |
| codigo | string |
| nombre | string |

### TenantModulo (feature-flag junction)
| Field | Type |
|---|---|
| idTenant | uuid (FK → Tenant) |
| idModulo | uuid (FK → Modulo) |
| habilitado | bool |

No explicit surrogate PK shown on the diagram — likely composite PK `(idTenant, idModulo)`. Confirm in design phase.

### Usuario
| Field | Type | Notes |
|---|---|---|
| idUsuario | uuid (PK) | |
| idTenant | uuid (FK) | |
| email | string | |
| nombreCompleto | string | |
| idRol | uuid (FK → Rol) | |
| estadoUsuario | enum | values not specified |

No password field — consistent with delegating credentials to Supabase Auth (`auth.users`); `Usuario` is a tenant-scoped profile table (`public.usuario`) referencing `auth.users(id)`.

### Rol
| Field | Type |
|---|---|
| idRol | uuid (PK) |
| idTenant | uuid (FK) |
| nombre | string |
| permisos | json |

`permisos` JSON structure is undefined in both diagram and brief — needs a schema decision (see §7).

### Relationships (from diagram edges relevant to this layer)
- Tenant 1 → * Usuario
- Tenant 1 → * TenantModulo
- Modulo 1 → * TenantModulo
- Rol 1 → * Usuario (via `idRol`)

### Diagram annotation (N0, verbatim, confirms brief intent)
> "CAPA MULTI-TENANT (azul): Tenant + Modulo + TenantModulo = feature flags por plan. Rol.permisos = permisos por usuario. TODA tabla de dominio lleva idTenant (FK) para RLS."

---

## 4. Design Tokens (from `Utopía Sistema Oficial .html`)

**Method note**: the file is a "bundled" static-preview export (~478 KB single line) where the real UI markup is embedded as a JSON-escaped string (`\"`, `\n`, `\u002F`) inside a `<script>` block, wrapped by a generic loading-screen shell (`<title>Bundled Page</title>`, no semantic classes on the outer shell). I un-escaped it to extract real tokens; do not trust naive greps against the raw file (they return false negatives for `class="..."` etc.).

`data-screen-label` markers found **7 reference screens**: `Dashboard`, `Inventario`, `Ficha de producto`, `Cargar producto`, `Vender`, `Rendición`, `Reportes`.

### Typography
- Headings/display: `'Archivo Black'` (used for large numerals/hero text, uppercase, tight negative letter-spacing e.g. `-.03em`)
- Body/UI: `'Archivo'` (sans-serif family, primary UI font)
- Mono/labels: `'Space Mono'` (used for small uppercase eyebrow labels, timestamps, badges — e.g. `font-size:11px; letter-spacing:.2em; text-transform:uppercase`)
- Font sizes observed: 10, 11, 12, 13, 14, 15, 17, 18, 20, 22, 23, 24, 26, 27, 28, 32, 36, 40, 60, 66, 74 (px) — not a strict modular scale; largest (60–74px) used for dashboard hero numerals/greeting.
- Font weights: 400, 500, 600, 700
- Letter-spacing: ranges from `-.03em` (large headings) to `.2em` (mono eyebrow labels), plus `.01`–`.18em` at various weights.

### Color system
⚠️ **Only ONE theme is present in the source file — a light/cream theme.** There is no dark-mode variant anywhere in the HTML (no `data-theme`, `.dark`, or `prefers-color-scheme` markers found). See §7 — this is a gap against the brief's "full dark AND light theming" requirement.

**App shell (light theme)**:
- Page background: `#F7F5F1` (warm cream)
- Primary text: `#141210` (near-black, warm)
- Top bar background: `rgba(247,245,241,.85)` with `backdrop-filter: blur(10px)` (sticky, translucent)
- Borders/dividers: `#EAE5DE`, `#E7E2DA`
- Card/panel backgrounds (cream variants): `#FCF6F0`, `#FBFAF7`, `#F0ECE6`, `#EFEAE2`
- Scrollbar thumb: `#d8d2c8` on `#F7F5F1` track

**Sidebar (persistently dark, NOT theme-driven)**:
- Background: `#131312`
- Logo badge: `linear-gradient(180deg,#5a5a5a 0%,#242424 45%,#0c0c0c 100%)` with `border:1px solid #5f5f5f`
- Sidebar text on dark: `#efeae2` / `#eaeaea`

**Accent / semantic colors**:
- Brand pink/salmon: `#E9A6BC` (accent dot, glows), `#F7E4EA` (light pink bg), `#C2607F` / `#c97e97` / `#8a5265` (darker pink, used for alert counters e.g. "7 requieren reposición")
- Terracotta (links/secondary accent): `#B87A5A` (link color), hover `#8a5638`
- Success green: `#3E8E5A` (e.g. "IA · 94% confianza" AI-confidence label), light bg `#E7F2EB`
- Neutral grays for secondary text: `#5a5652`, `#8a837a`, `#a29a8f`, `#9a938a`

**Excluded as noise** (belongs to the bundler tool's own error/loading overlay, not the app): `#2a1215`/`#ff8a80`/`#5c2b2e` (bundler error toast), `#131312` used for the outer loading-screen wrapper (coincidentally same value as the real sidebar — verify this isn't a false match in design phase).

### Radii
`2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 40px, 50%` — no single strict scale; `40px`/`50%` used for pill/circular badges and the logo mark, `6–12px` for cards/inputs, `2–5px` for small chips.

### Shadows
- Soft card shadow: `0 1px 4px rgba(0,0,0,0.08)` and `0 1px 4px rgba(0,0,0,0.12)`
- Accent glow (used sparingly, e.g. active state): `0 0 14px #E9A6BC`
- Raised button (dark): `inset 0 1px 0 rgba(255,255,255,.3), 0 3px 8px rgba(0,0,0,.55)`

### Spacing
`gap` values found: 2, 5, 7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26 px. `padding` values are similarly ad hoc (e.g. `13px 24px`, `16px 34px`) rather than a strict 4/8pt grid — closest to a loose ~2px-increment scale in the 8–34px range.

### Component patterns observed (from screen labels + inline styles)
- Sticky translucent top bar with blur
- Persistently-dark sidebar (fixed, independent of app theme)
- Card grid layout (`grid-template-columns: repeat(auto-fit, minmax(232px,1fr))`) for dashboard KPI tiles
- Mono, uppercase, wide-letter-spacing "eyebrow" labels above numeric KPIs (pattern for stat cards)
- Alert/counter tiles using accent color for the number (e.g. pink `#C2607F` for "7 requieren reposición")
- AI-confidence inline badge pattern (green text + icon) on the "Cargar producto" screen

**Gap**: this file gives strong visual DNA (fonts, warm-cream/dark-sidebar duality, accent palette, radii, shadows) but is a moodboard/mockup export, not a literal component library or a full design-token JSON. It also doesn't cover tables, forms, badges, or filters as distinct documented components — those must be inferred/designed to match the visual language, not copied literally (brief explicitly says "No copiar literalmente el HTML... usar únicamente como guía visual").

---

## 5. Next.js 16 Findings (read from `node_modules/next/dist/docs/`)

These are **hard breaking changes vs. Next.js 13–15 training data** — confirmed by direct doc reads, not assumption:

1. **`middleware.ts` is deprecated and renamed to `proxy.ts`** (`01-app/03-api-reference/03-file-conventions/proxy.md`, `01-app/01-getting-started/16-proxy.md`). Same file-root convention, same `NextRequest`/`NextResponse` API, function renamed `middleware` → `proxy`. A codemod exists (`npx @next/codemod@canary middleware-to-proxy .`). **Any tenant-resolution middleware for this change must be written as `proxy.ts`, not `middleware.ts`.**
2. **Proxy defaults to the Node.js runtime** (not Edge) as of v16 — this is actually favorable for us: a Supabase server client (which needs Node APIs) can run inside `proxy.ts` without Edge-runtime workarounds that were required pre-16.
3. **Proxy is explicitly documented as NOT a full auth/session solution.** The official guidance (`authentication.md`): use Proxy only for *optimistic* checks (read a cookie, redirect) — real authorization/tenant checks belong in a **Data Access Layer (DAL)** close to the data (Server Components, Server Actions, Route Handlers), using a memoized `verifySession()`-style helper. This maps directly onto the brief's "doble chequeo módulo + rol" requirement — the guard must live in a shared DAL/service function called from every entry point, not solely in `proxy.ts`.
4. `01-app/02-guides/multi-tenant.md` is a stub (7 lines) that just points to Vercel's "platforms-starter-kit" template — **no first-party Next.js multi-tenant guidance beyond Proxy fundamentals.** Don't expect an official recipe; we design our own tenant-resolution layer using Proxy + DAL.
5. **Server Functions (Server Actions) are not separate routes** — a Proxy `matcher` that excludes a path also skips Server Actions on that path. Explicit warning in the docs: never rely on Proxy alone for authz; always re-verify inside each Server Action/Route Handler. This directly reinforces the brief's "doble chequeo" non-negotiable — it's also a Next.js 16 platform-level warning, not just a business rule.
6. Vitest is the doc-recommended unit/integration test runner (`01-app/02-guides/testing/vitest.md`), matching the plan already captured in `testing-capabilities.md`. Note: Vitest doesn't support testing `async` Server Components directly — those need E2E (Playwright) or must be tested indirectly via the functions they call.

---

## 6. Options & Tradeoffs

### 6.1 Supabase client / data-access approach
| Option | Pros | Cons |
|---|---|---|
| **A. `supabase-js` only, raw queries via `.from()`/`.rpc()`** | Simplest, matches Supabase's own RLS testing patterns directly, no schema-drift risk between ORM and DB, official `@supabase/ssr` package handles cookie-based session for Next.js App Router cleanly | No compile-time query typing beyond generated types (`supabase gen types`); joins/complex queries get verbose |
| **B. `supabase-js` + Drizzle ORM (Postgres driver) alongside it** | Type-safe query builder, good for complex financial/report queries (later phases), migrations-as-code | Two sources of truth for schema (Drizzle schema vs Supabase migrations) unless carefully synced; adds a dependency this early; RLS still enforced at Postgres level regardless of ORM, so ORM choice doesn't change the RLS story |
| **C. Prisma** | Familiar, big ecosystem | Historically friction with Supabase's connection pooling (PgBouncer) and RLS session variables (`set_config` for `request.jwt.claims`) needs care; heavier for a "foundations" change |

**Lean**: Option A for this foundations change (auth, RLS, seed, tenant resolution don't need a query builder), revisit an ORM decision in a later data-heavy change (inventory/ventas) if raw queries get unwieldy. This is an **open question for the proposal phase**, not decided here.

### 6.2 RLS policy structure (idTenant filtering)
| Option | Pros | Cons |
|---|---|---|
| **A. Custom JWT claim (`app_metadata.tenant_id` in Supabase Auth) read via `auth.jwt()` in policy** | Standard Supabase pattern (pgTAP examples use `request.jwt.claim.sub`), works with `authenticated` role automatically, claim travels with the token so no extra round trip | Claim must be set at signup/invite time and kept in sync if a user's tenant ever changes (shouldn't, per model — one user belongs to one tenant); requires either a custom `access_token` hook or `app_metadata` update via service role |
| **B. Session variable set per-request (`set_config('app.tenant_id', ...)`) via a Postgres function called at connection time** | Works even without modifying JWT claims; flexible for future "admin impersonates tenant" cases | More moving parts (must guarantee the setter always runs before any query — easy to forget in a new code path, defeats "defense in depth"); doesn't fit the stateless-per-request model of serverless/edge functions as cleanly |
| **C. Lookup by `auth.uid()` → join to `usuario.idTenant` inside every policy (`idTenant = (select idTenant from usuario where id = auth.uid())`)** | No claim-sync step needed, always reflects current DB state | Extra subquery per RLS check on every table (performance cost at scale); still safe/correct, just slower |

**Lean**: A (JWT custom claim) for read performance + Supabase-idiomatic testing (matches the pgTAP examples verified via Context7), with C as a documented fallback/verification query. Needs an explicit decision + a policy-per-table naming convention before spec phase.

### 6.3 Tenant resolution (subdomain → tenant)
Grounded in the Next.js 16 Proxy docs read above:
| Option | Pros | Cons |
|---|---|---|
| **A. `proxy.ts` parses `request.headers.get('host')` subdomain, does an *optimistic* tenant lookup from a cached/edge-safe source, sets a header/cookie for downstream DAL to re-verify** | Matches official "optimistic checks with Proxy" pattern; single centralized place to reject obviously-wrong hosts early | Must NOT do the authoritative DB check here per Next.js's own guidance — the doc explicitly warns against slow data fetching in Proxy; local dev has no real subdomains (see §7 open question) |
| **B. No proxy involvement; tenant resolved entirely inside the DAL per-request from the authenticated user's `idTenant`, ignoring subdomain except for branding** | Simpler, avoids Proxy's "not a full session solution" pitfall entirely | Loses "reject wrong-tenant subdomain before rendering" UX; brief explicitly asks for "middleware de resolución de tenant por subdominio, ejecutado antes de cualquier acceso a datos" (§3.1) — this would not satisfy that literal requirement |

**Lean**: A, implemented as `proxy.ts` (not `middleware.ts` — hard Next.js 16 rename), doing lightweight subdomain parsing + header injection, with the DAL performing the authoritative tenant+RLS check on every data access (defense in depth, matches Next.js's own "verify auth inside each Server Function" warning).

### 6.4 Auth model
Brief mandates "Supabase auth" (stack line) + password change + per-profile settings (explicitly called out as previously-missing). Next.js auth guide favors either a custom DAL/session pattern or an auth library.
- **Supabase Auth (GoTrue) + `@supabase/ssr`** is the natural choice given the stack is already Supabase — session cookies, `auth.updateUser({ password })` for password change, `auth.uid()` for RLS. This isn't really an "option to weigh" so much as confirmed by the stack; flagged here mainly to note it must be paired with a `public.usuario` profile table (already modeled) synced via a trigger or app-level upsert on signup.
- Password change flow: Supabase provides `supabase.auth.updateUser({ password: newPassword })` — needs a re-auth/current-password check UX decision (Supabase doesn't require current password for this call by default, which may not be acceptable UX for a "change password" screen — open question).

### 6.5 Testing framework for RLS/concurrency
| Option | Pros | Cons |
|---|---|---|
| **A. pgTAP via Supabase CLI (`supabase test db`)** | Runs *inside* Postgres, tests RLS as SQL directly (verified via Context7 — `tests.create_supabase_user`, `tests.authenticate_as`, `results_eq`, `policies_are`, `tests.rls_enabled('public')`), fast, no app-layer noise, can assert "every table in `public` has RLS enabled" as one policy-hygiene test | Requires Supabase CLI + local Postgres (Docker) running; SQL-based tests are a different skill/tooling than the Vitest suite the rest of the app will use |
| **B. Vitest + real `supabase-js` clients signed in as different test users** | Same tool as the rest of the app (`testing-capabilities.md` already plans Vitest), tests the actual client-facing behavior (e.g. `select().eq()` returning empty vs error), doubles as an integration test of the DAL | Needs a running Supabase instance (local via CLI, or a dedicated test project) reachable from Vitest; slower than pgTAP; doesn't test policy definitions in isolation as cleanly |
| **C. Both** | pgTAP for tight RLS/policy-hygiene coverage at the DB layer, Vitest for DAL/integration-level "tenant A can't see tenant B via the app" coverage — this is what Supabase's own docs demonstrate side by side | Two test runners to maintain; more setup work up front |

**Lean**: C. Given the brief explicitly requires both "tests que confirmen que un tenant no puede ver ni modificar datos de otro" (§6.3) and the existing `testing-capabilities.md` plan already lists Vitest as the app-level runner, doing pgTAP for DB-level RLS proofs + Vitest for DAL-level integration is the most direct way to satisfy both. Concurrency tests (optimistic locking) are better suited to Vitest/integration tests that fire concurrent requests, since that's testing request-level races, not a static policy.

Either way, this requires the **Supabase CLI + local Postgres (Docker)** to be part of the dev environment — not yet confirmed as available in this environment (open question).

---

## 7. Open Questions (need product/architecture decisions before proposal phase)

1. **Tenant config storage contradiction**: diagram has `Tenant.configFinanzas : json`; brief §3.1 explicitly says preferences/params must live in a separate `Configuracion` (key/value, by section) entity and NOT in a Tenant json field, and that entity **does not exist in the diagram at all**. Per the brief's own stated priority ("1. Este documento. 2. El diagrama de clases."), the brief wins — but someone must design `Configuracion`'s schema (key/value pairs? typed columns? which sections?) since the diagram gives zero guidance here.
2. **Should `Auditoria` (brief §4.5) be part of THIS foundations change?** It's a transversal, tenant-scoped table that other guard/RLS work will want from day one (e.g., logging who changed a Rol's permissions), but the user's scope list for this change didn't name it. Recommend confirming before proposal.
3. **`Rol.permisos` JSON shape** is undefined anywhere in the sources — needs an explicit schema (list of permission strings? nested per-module map? matches `Modulo.codigo`?).
4. **RLS claim strategy** (§6.2: JWT custom claim vs session variable vs subquery) — needs an explicit decision; affects how tenant assignment/onboarding is implemented (custom claims typically require a Supabase Auth Hook or service-role `app_metadata` update at user creation).
5. **Local subdomain resolution in dev** — `localhost` doesn't naturally support `tenant.localhost` subdomains in all browsers/OS setups without `/etc/hosts` edits or a wildcard DNS/dev proxy. Needs a decided dev-environment convention (e.g., `*.localhost` works on modern Chrome/Firefox without hosts edits, but should be verified and documented for the team, or a fallback query-param/path override for dev).
6. **Password change UX**: should Supabase's `updateUser({ password })` require re-entry of the current password (not enforced by Supabase by default) given this was an explicitly-called-out prior-project failure? Needs a decision, since the brief treats this as non-negotiable but doesn't specify the confirmation flow.
7. **ORM decision deferral** (§6.1) — confirm it's acceptable to defer ORM choice past this foundations change (raw `supabase-js` for auth/tenant/RLS/seed), revisiting when inventory/sales/finance data-heavy changes start.
8. **Local Postgres/Docker availability** — pgTAP (`supabase test db`) requires Supabase CLI + Docker locally. Confirm this is available in the target dev/CI environment before committing to option C in §6.5.
9. **Dark mode source of truth gap** (§4) — the HTML has only ONE theme (light/cream app + permanently-dark sidebar, not a toggle). The brief demands full light AND dark theming everywhere. There is currently no dark-mode palette to reference — someone (design/product) needs to either derive one from the existing accent/neutral palette or provide it separately before UI work in later changes.
10. **Composite/surrogate key for `TenantModulo`** — diagram shows no dedicated PK column; confirm composite PK `(idTenant, idModulo)` is intended (affects RLS policy structure and upsert semantics for the seed data).
11. **Diagram version drift**: the brief's Anexo (§10) references `Utopia_Fase1_Diagrama_v2.drawio`, but the actual file provided is `DiagramaDeClases.drawio`. Given it's missing several entities the brief text clearly assumes exist (`Configuracion`, `Auditoria`, `Cliente`, `Reserva`, `ReglaPrecio`, `CostoProducto`) and has at least one internal contradiction on enum values elsewhere in the model (`ItemProducto.estadoItem`: diagram note N2 lists a `reservado` value that brief §4.6 explicitly says must NOT exist), this may be an older or partial revision. Worth flagging to the user/product owner — not blocking for this foundations change (none of the affected entities are in scope here) but likely to recur in later changes' explore phases.

---

## 8. Risks

- **RLS bypass via forgotten guard**: Next.js 16 explicitly warns that Server Actions can silently lose Proxy coverage if a route's matcher changes — reinforces that the "doble chequeo módulo + rol" and tenant RLS checks must be enforced in a shared DAL helper called everywhere, not assumed from Proxy alone. Mitigate with a lint rule / code-review checklist item + the pgTAP "RLS enabled on all tables" hygiene test.
- **Design token incompleteness**: the HTML source is a mockup export, not a documented design system — building actual reusable components (tables, forms, filters, badges) will require interpretive decisions not explicitly in the source, creating risk of inconsistency the brief explicitly warns against (§6.1 "Consistencia de patrones de UI").
- **No dark-mode reference** (see open question 9) — implementing "full dark/light theming" without a dark palette risks re-creating the exact kind of gap the brief says burned the prior project.
- **Testing infra stands up two runners** (pgTAP + Vitest) — more moving parts to get right in CI before any business logic can be verified; if Docker/Supabase CLI isn't available in CI, the pgTAP half of the plan blocks.
- **Diagram/brief drift** (open question 11) — increases the chance that later changes hit more diagram gaps; worth a lightweight "model reconciliation" pass before deeper phases if it keeps recurring.
- **Custom JWT claims for tenant_id** (if chosen per §6.2 option A) require either a Supabase Auth Hook or a service-role update step at user creation — an easy step to omit, silently breaking RLS for that user (defense-in-depth via option C subquery fallback recommended regardless of primary strategy).

---

## Ready for Proposal

**Partially.** The factual groundwork (entities, tokens, Next.js 16 constraints, testing options) is solid enough to write a proposal. However, open questions 1–4 (Configuracion schema, Auditoria scope, Rol.permisos shape, RLS claim strategy) and 9 (dark-mode source) are architecture-affecting and should be resolved — at least as explicit decisions/assumptions stated in the proposal — before writing delta specs, since they change table shapes and RLS policy design directly.

Recommend: bring open questions 1, 2, 3, 4, 6, 9 to the user/product owner explicitly during `sdd-propose`, and let 5, 7, 8, 10, 11 be captured as proposal-level assumptions/risks if no answer is available yet.
