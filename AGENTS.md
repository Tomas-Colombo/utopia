<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# What this project is

Utopía is a multi-tenant SaaS for running a clothing store: inventory,
pricing, sales, instalments, consignment, expenses. One deployment serves many
tenants; the product is meant to be resold, so nothing may be hardcoded to one
store.

Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind 4 + Supabase
(Postgres with RLS). Package manager is **pnpm**. Windows host: only `rg` is
installed — no `bat`, `fd`, `sd`, `eza`, `jq` or `brew`.

**Do not trust the other docs in this repo.** `README.md` is still
`create-next-app` boilerplate and claims migrations "land starting in Slice 4";
there are 65 of them. `openspec/project-context.md` says the status is "Phase 1
initialization" and Supabase is "planned"; it is fully wired. Both describe an
earlier project. This file and the code are the current truth.

# Tenant isolation is the one invariant

Every domain table carries `id_tenant` and is protected by RLS policies that
filter by the `tenant_id` claim on the JWT. A query without an explicit tenant
filter is still safe, because RLS adds it — but **RLS is the only thing doing
it**. The service-role key bypasses RLS entirely; it belongs to
`lib/dal/supabase*.ts` (which gates it), `scripts/provision-tenant.mts`,
`tests/db/` and `e2e/`. Never reach for it from a route, an action or a
component.

RLS filters by tenant and **nothing else**. There is no per-user policy: any
user with a Supabase session sees the whole tenant. Per-user and per-module
restriction is an application concern, enforced by the guards below.

# Layers

```
app/**           routes, pages, Server Actions   — no SQL
components/**    UI                              — no SQL
lib/dal/**       the ONLY place that queries Supabase
supabase/        migrations + stored procedures  — business invariants live here
```

Writes go through stored procedures (`sp_*`) called from `lib/dal`, not through
table writes from the app. The procedures own atomicity and the invariants; a
multi-table operation assembled in TypeScript is a bug waiting for a crash
between two awaits.

**Legitimate exceptions to "no SQL outside `lib/dal`"**: authentication
(`app/(auth)/login/actions.ts`, `logoutAction`) and the session middleware
(`proxy.ts`). Auth is not domain data and middleware cannot use the server
client.

**Known violations — these are debt, not precedent.** Do not add to them, and
prefer moving one into `lib/dal` if you are already working in the file:

- `app/api/ventas/lookup-item/route.ts` queries `detalle_reserva` and `producto`
- `app/(app)/inventario/productos/[id]/ficha/page.tsx` queries `costo_producto`
- `components/theming/persistThemePreference.ts` queries `configuracion`

# Every mutation is a Server Action with three gates

A Server Action is a public POST endpoint. The TypeScript type of its argument
is erased at build time, so it proves nothing at runtime. In this order:

1. **Authorize.** `requireModuleRole(session, '<modulo>', '<accion>')`. Each
   module's `layout.tsx` also gates `ver` for the whole route group, but a
   layout is not a boundary for an action — the action is reachable without it.
2. **Validate.** A zod schema from `lib/validation/**`, with `safeParse`. The
   schema is built from the domain catalogue where one exists (see
   `permisosSchema`, assembled from `CATALOGO_PERMISOS`) so there are never two
   lists to drift apart. Use `strictObject`: unknown keys are rejected.
3. **Call the DAL.** Pass `parsed.data`, never the raw input.

Return `{ ok: true } | { ok: false, reason: string }`. `reason` is a stable
kebab-case slug, never prose and never a Postgres error.

# Errors the operator reads

`lib/errores/mensajes.ts` is the **only** place a user-facing error message
lives. The UI calls `mensajeDeError(reason)`; it never shows `res.reason` raw.

No jargon: the person reading it sells clothes. No "SKU", "tenant", "payload",
no table or constraint names. Spanish, voseo, full stop at the end. A test
enforces all of that, plus that no slug can escape untranslated.

When a stored procedure starts raising a new slug, add it to the catalogue and
to the inventory list in `lib/errores/mensajes.test.ts`.

# Don't call it done if you didn't run it

Before reporting a change as finished, run the project's gates:

```bash
npx tsc --noEmit && npx eslint && npx vitest run --exclude 'tests/db/**' && pnpm build
```

If one of them fails, it is not finished.

`tests/db/*` talks to a real Postgres and needs the local Supabase stack
(`supabase start`, which needs Docker running). When it is down those suites
fail with `ECONNREFUSED 127.0.0.1:54321` — report that as not verified, never as
passing. Same for `pnpm test:e2e`, which needs a live server and a database.

In whatever you write — commit message, PR body, summary — keep what you
verified separate from what you assume. If you never printed the page, write
"not verified"; do not write "check that it comes out clean". A report that
claims a check which never ran is worse than no report, because the reader stops
reviewing.

# Design for N, not for 1

Before writing a screen that processes a list, answer three questions: how many
queries per element, what happens at two hundred, and who controls that number.
If the number comes from a URL or from user input, it needs a cap and a dedupe.

An `await` inside a `for` is the tell: there is almost always a missing domain
function that resolves the whole batch in one query. Ad-hoc Supabase queries
outside `lib/dal/**` are forbidden, but satisfying that rule by calling another
use case's loader drags that use case's cost along with it — a loader that joins
movements, supplier and category is the right choice for the detail page that
displays them, and the wrong one for a label that prints a name. When nothing
existing fits, add the domain function that is missing.

# Tests

| Suite | Command | Needs |
| --- | --- | --- |
| Unit (colocated `*.test.ts`) | `npx vitest run --exclude 'tests/db/**'` | nothing |
| Unit + database | `pnpm test` | local Supabase + Docker |
| Database only (`tests/db/*`) | `npx vitest run tests/db` | local Supabase + Docker |
| End to end (`e2e/`) | `pnpm test:e2e` | dev server + database |

`pnpm test` is plain `vitest run`: it includes the database suites, so without
Docker it reports dozens of failures that say nothing about your change. The
first row is the one to run while working.

Coverage (`pnpm test:coverage`) measures a deliberate subset, listed in
`vitest.config.mts` with the reasoning: pure logic that runs without a browser,
a database or Next's request lifecycle. Routes, the DAL and domain components
are covered by the database and Playwright suites instead; a unit-coverage
number for them would measure how much got mocked. The thresholds sit just under
the measured reality on purpose. Adding a pure, fully tested module to the
`include` list is welcome; lowering a threshold to make a change pass is not.

Tests describe behaviour, not implementation, and live next to the code they
cover. The DB suites gate themselves on env vars, so a missing `.env.local`
makes them skip — which reads exactly like passing. Check the count.

# Conventions

- **Commits**: Conventional Commits, subject and body in Spanish. Never add
  `Co-Authored-By` or any AI attribution.
- **Comments and identifiers**: Spanish in the domain (`app/**`, `lib/dal/**`,
  `lib/<dominio>/**`) because the domain vocabulary is Spanish — `venta`,
  `consignacion`, `rendicion` have no honest English name here. English in
  `components/ui/**`, which are generic primitives, and in this file.
- **Comments explain why, not what.** The existing ones carry the reason a
  decision was taken and what broke before it; match that density and keep it
  when you touch the code around them.
- **UI copy**: Spanish, voseo ("Elegí un proveedor", "Agregá al menos un ítem").
- Write code that reads like the code around it.
