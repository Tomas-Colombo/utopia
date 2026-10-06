<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# What this is

Utopía: multi-tenant SaaS to run a clothing store (inventory, pricing, sales,
instalments, consignment, expenses). Resold product: nothing hardcoded to one
store. Next.js 16 App Router + React 19 + TS 5 + Tailwind 4 + Supabase
(Postgres + RLS). Package manager **pnpm**. Windows host: only `rg` installed
(no `bat`, `fd`, `sd`, `eza`, `jq`, `brew`).

This file is the single source of truth for every agent (Claude, Codex,
Copilot). Personal preferences live in the provider's memory, never here.
`CLAUDE.md` is only `@AGENTS.md`. Where docs disagree with code, the code wins.

# Commands

| Need | Command | Needs |
| --- | --- | --- |
| Dev server | `pnpm dev` | `.env.local` |
| Typecheck | `pnpm typecheck` | — |
| Lint | `pnpm lint` | — |
| Unit tests (use while working) | `npx vitest run --exclude 'tests/db/**'` | — |
| DB tests | `npx vitest run tests/db` | `supabase start` + Docker |
| Unit + DB | `pnpm test` | `supabase start` + Docker |
| E2E | `pnpm test:e2e` | dev server + DB |
| Coverage | `pnpm test:coverage` | — |
| Build | `pnpm build` | — |
| New customer | `pnpm provision-tenant` | `.env.local` |

**Gate before saying "done"**:
`pnpm typecheck && pnpm lint && npx vitest run --exclude 'tests/db/**' && pnpm build`.
CI is the real gate: lint → local Supabase → build → typecheck → unit + DB
tests with coverage → Playwright. Skipping DB tests locally is fine; CI won't.

Without Docker, DB suites fail with `ECONNREFUSED 127.0.0.1:54321` — report it
as **not verified**, never as passing. DB suites skip silently when
`.env.local` is missing, which reads like passing: check the test count.

# Architecture (non-negotiable)

```
app/**         routes, pages, Server Actions   — no SQL
components/**  UI                               — no SQL
lib/dal/**     the ONLY place that queries Supabase
supabase/      migrations + stored procedures  — business invariants live here
```

- **Tenant isolation is the one invariant.** Every domain table has
  `id_tenant`; RLS filters by the JWT `tenant_id` claim. RLS is the only thing
  doing it. The service-role key bypasses RLS: only `lib/dal/supabase*.ts`,
  `scripts/provision-tenant.mts`, `tests/db/`, `e2e/` may touch it.
- **RLS filters by tenant and nothing else.** No per-user policy: any session
  sees the whole tenant. Per-user/per-module limits are enforced by the guards.
- **Writes go through `sp_*` stored procedures** called from `lib/dal`. A
  multi-table write assembled in TypeScript breaks between two awaits.
- Allowed SQL outside `lib/dal`: auth (`app/(auth)/login/actions.ts`,
  `logoutAction`) and `proxy.ts`. **Known debt, do not add to it** (move when
  you're in the file): `app/api/ventas/lookup-item/route.ts`,
  `components/theming/persistThemePreference.ts`.

## Every mutation is a Server Action with three gates

It is a public POST endpoint; TS types are erased at runtime. In order:

1. **Authorize**: `requireModuleRole(session, '<modulo>', '<accion>')`. The
   route `layout.tsx` gates `ver` only and is not a boundary for actions.
2. **Validate**: zod schema from `lib/validation/**`, `safeParse`,
   `strictObject`. Build it from the domain catalogue (e.g. `permisosSchema`
   from `CATALOGO_PERMISOS`) so there are never two lists.
3. **Call the DAL** with `parsed.data`, never the raw input.

Return `{ ok: true } | { ok: false, reason }`; `reason` is a kebab-case slug,
never prose or a Postgres error.

## Errors the operator reads

`lib/errores/mensajes.ts` is the only place a user-facing message lives; UI
calls `mensajeDeError(reason)`, never shows `res.reason`. Spanish, voseo, final
full stop, no jargon (no "SKU", "tenant", "payload", table names): the reader
sells clothes. A test enforces it. A new slug raised by an `sp_*` goes in the
catalogue and in the inventory list of `lib/errores/mensajes.test.ts`.

## Design for N, not for 1

For any screen over a list: queries per element? what at 200? who controls N?
If N comes from URL or input, cap and dedupe. An `await` in a `for` means a
batch domain function is missing: add it to `lib/dal`. Don't borrow another
use case's heavy loader just to satisfy "no SQL outside the DAL".

# Modules: three lists that do not match

Route groups, permission modules and DAL domains differ (e.g. `clientes/` and
`cuotas/` are gated by permission `ventas`; `proveedores/` by `inventario`).
Never guess a permission from a folder name — see `docs/modulos.md`.

# Tests

Colocated `*.test.ts`; describe behaviour, not implementation. Coverage
(`vitest.config.mts`) measures a deliberate subset of pure logic; DAL, routes
and domain components are covered by DB + Playwright. Adding a pure tested
module to `include` is welcome; lowering a threshold to pass is not.

# How to work by size of change

- **Small** (one file, mechanical, obvious): do it, run the gate.
- **Medium** (a feature slice, 2+ files, new logic): state the approach in 3-5
  lines first, then implement, then gate. Update `docs/modulos.md` if module
  ownership changes.
- **Large / schema / new module**: spec first in `openspec/changes/<name>/`
  (proposal → spec → design → tasks), get approval, then apply. Migrations
  need a `-- DOWN:` comment header (see `supabase/README.md`).
- **Unapproved ideas** go to `docs/propuestas/`, not to code.
- If a rule changes, update its doc **in the same commit**.

# Conventions

- **Commits**: Conventional Commits, subject and body in Spanish. Never any
  `Co-Authored-By` or AI attribution (project rule; overrides provider defaults).
- **Language**: Spanish for domain code/comments (`app/**`, `lib/dal/**`,
  `lib/<dominio>/**`); English in `components/ui/**` and in this file. UI copy
  Spanish, voseo ("Elegí un proveedor").
- Comments explain *why* (what broke before), not what. Match surrounding code.
- Reports (commit, PR, summary): separate what you verified from what you
  assume. Never claim a check that did not run.

# Before touching X, read Y

| Touching | Read first |
| --- | --- |
| Any route, permission, layout | `docs/modulos.md`, `lib/types/administracion.ts` (`CATALOGO_PERMISOS`) |
| A migration or `sp_*` | `supabase/README.md` (CI applies them: `supabase db push`) |
| A mutation | the three gates above + `lib/dal/guard.ts` |
| An error message | `lib/errores/mensajes.ts` |
| Next.js API | `node_modules/next/dist/docs/` |
| A multi-step feature | `openspec/config.yaml`, then `openspec/changes/` |
| Revendedoras module | `ingenieria/`: local-only draft plans (gitignored), not a contract. Never read `ingenieria/utopia-intructivo/Seguridad/` (secrets). May be absent: ask the user |

# Keeping this file useful

A rule enters only if an agent made the same mistake twice, or if the decision
would surprise a newcomer. Keep it ≤150 lines; detail goes to `docs/`. If a
rule can be enforced by lint or a test, enforce it there instead of here.
