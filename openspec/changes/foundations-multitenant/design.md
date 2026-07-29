# Design: Foundations — Multi-tenant core, RLS, auth, and design system

**Change**: `foundations-multitenant`
**Status**: Design (decisions CLOSED)
**Mode**: openspec
**Covers**: Etapa 0 (design-system) + Etapa 1 (multi-tenant-data, tenant-resolution, audit-log, test-infrastructure) + Etapa 2 (auth, access-guard, administration)

---

## 1. Overview

This design turns the eight approved capabilities into a concrete, greenfield implementation on the existing bare `create-next-app` (Next.js 16.2.10, React 19.2.4, TS5, Tailwind 4; no Supabase, no tests yet). It resolves every architecture-affecting item the proposal and exploration left for `sdd-design`: the exact dark palette, the DB DDL/RLS shapes, the Auth Hook function body, the `proxy.ts` contract, and the atomic-audit write path. The design is organized around a domain-oriented **Data Access Layer (DAL)** because Next.js 16 mandates that the authoritative tenant + module + role checks live close to the data (Server Components, Server Actions, Route Handlers) — never in `proxy.ts` alone, since Server Actions escape proxy matchers. The eight capabilities map to files as: `design-system` → `lib/design-tokens/*` + `components/*` + `app/(app)/demo`; `multi-tenant-data` + `audit-log` → `supabase/migrations/*`; `tenant-resolution` → `proxy.ts` + `lib/dal/tenant.ts`; `auth` → `lib/dal/session.ts` + `app/(auth)/*`; `access-guard` → `lib/dal/guard.ts`; `administration` → `app/(app)/administracion/*`; `test-infrastructure` → `vitest.config.mts` + `supabase/tests/*` + `tests/*`.

Every decision below is settled. Options are not re-opened; §16 (Open Design Questions) is intentionally near-empty.

---

## 2. Repository Layout

Only what this change adds or modifies. Domain-oriented per brief §7 ("módulos desacoplados", "reglas de negocio centralizadas en servicios de dominio reutilizables").

```
utopia/
├── app/
│   ├── (public)/
│   │   └── page.tsx                    # landing (reserved subdomains route here)
│   ├── (auth)/
│   │   ├── login/
│   │   │   ├── page.tsx
│   │   │   └── actions.ts              # 'use server' — signInWithPassword
│   │   └── settings/
│   │       ├── page.tsx                # per-user profile + theme
│   │       └── password/
│   │           ├── page.tsx
│   │           └── actions.ts          # re-verify + updateUser({password})
│   ├── (app)/
│   │   ├── layout.tsx                  # app shell: sidebar (dark) + top bar
│   │   ├── demo/
│   │   │   └── page.tsx                # Etapa 0 closer — all 7 components, both themes
│   │   ├── no-autorizado/
│   │   │   └── page.tsx                # guard denial landing (UI-layer)
│   │   └── administracion/
│   │       ├── layout.tsx              # requireModuleRole('administracion','ver')
│   │       ├── usuarios/
│   │       │   ├── page.tsx
│   │       │   └── actions.ts          # invite / edit / deactivate / reset creds
│   │       ├── roles/page.tsx
│   │       ├── configuracion/
│   │       │   ├── page.tsx
│   │       │   └── actions.ts
│   │       └── modulos/page.tsx        # TenantModulo per tenant
│   ├── layout.tsx                      # MODIFIED: ThemeProvider + next/font
│   └── globals.css                     # MODIFIED: tokens + Tailwind 4 @theme
├── components/
│   ├── ui/                             # base components
│   │   ├── SearchableSelect.tsx
│   │   ├── Table.tsx
│   │   ├── FilterBar.tsx
│   │   ├── Badge.tsx
│   │   ├── Skeleton.tsx
│   │   ├── EmptyState.tsx
│   │   └── ConfirmDialog.tsx
│   └── theming/
│       ├── ThemeProvider.tsx           # 'use client' context
│       └── ThemeToggle.tsx
├── lib/
│   ├── dal/
│   │   ├── supabase.ts                 # createServerClient / createBrowserClient
│   │   ├── session.ts                  # cached verifySession()
│   │   ├── tenant.ts                   # verifyTenantMatch()
│   │   ├── guard.ts                    # requireModuleRole()
│   │   ├── audit.ts                    # logAudit()
│   │   └── errors.ts                   # AuthorizationError
│   ├── design-tokens/
│   │   ├── tokens.ts                   # light (source of truth in TS)
│   │   └── dark.ts                     # derived dark
│   └── types/
│       └── database.ts                 # supabase gen types output
├── proxy.ts                            # Next.js 16 — NOT middleware.ts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 00001_extensions_and_enums.sql
│   │   ├── 00002_tenant.sql
│   │   ├── 00003_modulo_tenant_modulo.sql
│   │   ├── 00004_configuracion.sql
│   │   ├── 00005_rol.sql
│   │   ├── 00006_usuario.sql
│   │   ├── 00007_auditoria.sql
│   │   ├── 00008_auth_hook_tenant_id.sql
│   │   └── 00009_seed_setup_functions.sql
│   ├── seed.sql
│   └── tests/                          # pgTAP
│       ├── rls_enabled.test.sql
│       ├── tenant_isolation.test.sql
│       ├── configuracion_isolation.test.sql
│       ├── auditoria_immutable.test.sql
│       └── hook_sets_claim.test.sql
├── tests/                              # Vitest integration
│   ├── setup.ts
│   ├── dal/
│   │   ├── guard.test.ts
│   │   ├── tenant-isolation.test.ts
│   │   └── configuracion-concurrency.test.ts
│   └── a11y/
│       └── demo-contrast.test.ts       # axe-core AA
├── vitest.config.mts
├── .env.example                        # committed
└── .env.local                          # git-ignored
```

**Why this split.** Server Components read via `lib/dal/*`; Server Actions mutate via the same `lib/dal/*`; `proxy.ts` is a thin optimistic router that only parses `host` and injects a header. Centralizing tenant/guard/audit in one DAL is the single source of truth the brief §7 demands and the only place Next.js 16 guarantees runs on every entry point. `components/ui/*` is dumb/presentational; theming state lives in a client context so a theme switch never triggers a full reload (REQ-DS spec §5).

---

## 3. Naming Conventions

| Concern | Convention | Decision & justification |
|---|---|---|
| DB tables/columns | `snake_case` | Postgres folds unquoted identifiers to lowercase; snake_case avoids quoting everywhere and matches Supabase idiom + brief §8 ("tipos de Postgres correctos"). Diagram's camelCase (`idTenant`) becomes `id_tenant`. |
| DB enum types | `<entity>_<field>` snake_case | e.g. `tenant_estado`, `usuario_estado`. Native Postgres enums per brief §8. |
| TS variables/functions | `camelCase` | Standard TS; `verifySession`, `tenantId`. |
| TS types/interfaces/classes | `PascalCase` | `Session`, `AuthorizationError`. |
| DB↔TS mapping | supabase-generated types | `supabase gen types typescript` → `lib/types/database.ts`. Generated names carry snake_case; the DAL exposes camelCase DTOs by mapping at the boundary (thin adapter in each DAL fn), so app code stays camelCase and DB stays snake_case. No ORM. |
| Migration files | `NNNNN_verb_scope.sql` | zero-padded 5-digit sequence, e.g. `00002_tenant.sql`, `00008_auth_hook_tenant_id.sql`. Ordering is lexical = execution order. |
| RLS policy names | `<table>_<operation>_<scope>` | e.g. `tenant_select_own`, `configuracion_all_own_tenant`, `modulo_select_authenticated`, `auditoria_insert_own`, `auditoria_no_update`. Self-documenting for the pgTAP hygiene test. |
| Stored procedures | `sp_<verb>_<entity>` | e.g. `sp_update_usuario`, `sp_upsert_configuracion` — the atomic mutation+audit wrappers (§10). |

**Decision — DTO adapter, not raw rows.** DAL functions return camelCase DTOs (per Next.js DTO guidance in the auth guide), never whole DB rows, so the client never receives columns it should not see (e.g. other users' emails).

---

## 4. Database Design

All FKs indexed. `updated_at` maintained by a shared `set_updated_at()` trigger created in `00001`. Enums:

```sql
-- 00001_extensions_and_enums.sql
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create type tenant_estado  as enum ('activo','suspendido','archivado');
create type usuario_estado as enum ('activo','inactivo','invitado');

create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- helper used by every tenant-scoped policy
create or replace function auth_tenant_id() returns uuid
  language sql stable as $$
    select nullif(auth.jwt() ->> 'tenant_id','')::uuid
  $$;
```

**Decision — `auth_tenant_id()` helper.** Every tenant policy calls one `stable` function instead of inlining `(auth.jwt() ->> 'tenant_id')::uuid`. One place to change if the claim path ever moves; `nullif(...)` makes a missing claim resolve to `NULL`, so `id_tenant = NULL` matches zero rows — fail-closed (satisfies REQ-AUTH-10 at the DB layer as defense in depth; the DAL also rejects, §5).

### 4.1 `tenant`

```sql
create table tenant (
  id_tenant        uuid primary key default gen_random_uuid(),
  nombre_comercial text not null,
  subdominio       text not null unique,
  logo_url         text,
  color_primario   text,
  estado_tenant    tenant_estado not null default 'activo',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger tenant_touch before update on tenant
  for each row execute function set_updated_at();

alter table tenant enable row level security;
create policy tenant_select_own on tenant for select to authenticated
  using (id_tenant = auth_tenant_id());
-- writes to tenant are service-role only (no policy for authenticated write)
```

Index: PK; `unique(subdominio)` (also the resolution lookup index).

### 4.2 `modulo` (fixed, tenant-agnostic catalog)

```sql
create table modulo (
  id_modulo  uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nombre     text not null,
  created_at timestamptz not null default now()
);
alter table modulo enable row level security;
create policy modulo_select_authenticated on modulo for select to authenticated
  using (true);
-- no insert/update/delete policy → writes are service-role only (REQ-MTD-08)
```

Index: PK; `unique(codigo)`.

### 4.3 `tenant_modulo` (feature-flag junction)

```sql
create table tenant_modulo (
  id_tenant  uuid not null references tenant(id_tenant) on delete cascade,
  id_modulo  uuid not null references modulo(id_modulo) on delete cascade,
  habilitado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id_tenant, id_modulo)          -- REQ-MTD-04 composite PK
);
create index tenant_modulo_modulo_idx on tenant_modulo(id_modulo);
create trigger tenant_modulo_touch before update on tenant_modulo
  for each row execute function set_updated_at();

alter table tenant_modulo enable row level security;
create policy tenant_modulo_all_own_tenant on tenant_modulo for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
```

### 4.4 `configuracion`

```sql
create table configuracion (
  id_tenant  uuid not null references tenant(id_tenant) on delete cascade,
  seccion    text not null,
  clave      text not null,
  valor      jsonb not null,
  tipo       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id_tenant, seccion, clave)     -- REQ-MTD-05
);
create trigger configuracion_touch before update on configuracion
  for each row execute function set_updated_at();

alter table configuracion enable row level security;
create policy configuracion_all_own_tenant on configuracion for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
```

The composite PK is what the concurrency test (§12) exercises: two inserts with the same `(id_tenant, seccion, clave)` → the second fails on PK.

### 4.5 `rol`

```sql
create table rol (
  id_rol     uuid primary key default gen_random_uuid(),
  id_tenant  uuid not null references tenant(id_tenant) on delete cascade,
  nombre     text not null,
  permisos   jsonb not null default '{}'::jsonb,   -- { moduloCodigo: string[] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rol_tenant_idx on rol(id_tenant);
create trigger rol_touch before update on rol
  for each row execute function set_updated_at();

alter table rol enable row level security;
create policy rol_all_own_tenant on rol for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
```

`permisos` shape (decision 3): `{ "inventario": ["ver","crear","editar"], "administracion": ["ver"] }`.

### 4.6 `usuario` (profile; credentials live in `auth.users`)

```sql
create table usuario (
  id_usuario      uuid primary key references auth.users(id) on delete cascade,
  id_tenant       uuid not null references tenant(id_tenant) on delete cascade,
  email           text not null,
  nombre_completo text not null,
  id_rol          uuid not null references rol(id_rol),
  estado_usuario  usuario_estado not null default 'invitado',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index usuario_tenant_idx on usuario(id_tenant);
create index usuario_rol_idx    on usuario(id_rol);
create trigger usuario_touch before update on usuario
  for each row execute function set_updated_at();

alter table usuario enable row level security;
create policy usuario_all_own_tenant on usuario for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
```

**Decision — `id_usuario` IS `auth.users(id)`.** No separate surrogate. The profile row shares the PK with the Supabase auth user (1:1), so the Auth Hook can look it up by `user_id` directly and RLS on `usuario` uses the same `id_tenant` claim path as everything else.

### 4.7 `auditoria` (append-only)

```sql
create table auditoria (
  id_auditoria uuid primary key default gen_random_uuid(),
  id_tenant    uuid not null references tenant(id_tenant) on delete cascade,
  id_usuario   uuid not null references auth.users(id),
  entidad      text not null,
  entidad_id   text not null,
  accion       text not null,               -- 'crear' | 'editar' | 'eliminar' | ...
  cambios      jsonb not null,              -- { before: {...}, after: {...} }
  ts           timestamptz not null default now(),
  ip           inet                          -- brief §4.5 "desde dónde"
);
create index auditoria_tenant_ts_idx on auditoria(id_tenant, ts desc);

alter table auditoria enable row level security;
create policy auditoria_insert_own on auditoria for insert to authenticated
  with check (id_tenant = auth_tenant_id());
create policy auditoria_select_own on auditoria for select to authenticated
  using (id_tenant = auth_tenant_id());
-- NO update/select policy grants UPDATE or DELETE to authenticated →
-- both are implicitly denied (REQ-AL-05). pgTAP asserts this explicitly.
```

**Immutability.** With RLS enabled and only `insert`/`select` policies present, `UPDATE`/`DELETE` from the `authenticated` role match no permissive policy and are denied. `auditoria_immutable.test.sql` proves it. The `ts desc` composite index serves the filtered query API (REQ-AL-07: by tenant + entidad + date range).

---

## 5. Authentication & JWT Claim

**Package.** `@supabase/ssr` for cookie-based sessions in the App Router.

**Client factory — `lib/dal/supabase.ts`:**

```ts
import { createServerClient as _server, createBrowserClient as _browser } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server Components / Server Actions / Route Handlers
export async function createServerClient() {
  const cookieStore = await cookies()   // Next.js 16: cookies() is async
  return _server(URL, ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) =>
        cookieStore.set(name, value, options)),
    },
  })
}
export function createBrowserClient() { return _browser(URL, ANON_KEY) }
// service-role client (server only, never exported to client bundles):
export function createServiceClient() { return _server(URL, SERVICE_ROLE_KEY, {...}) }
```

**Auth Hook — `00008_auth_hook_tenant_id.sql` (custom access token hook).** Sets `tenant_id` from `public.usuario` on every token issue (decision 4):

```sql
create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql stable
as $$
declare
  claims    jsonb;
  v_tenant  uuid;
begin
  select id_tenant into v_tenant
    from public.usuario
   where id_usuario = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  if v_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant::text));
  else
    claims := claims - 'tenant_id';   -- never emit a stale/empty claim
  end if;

  return jsonb_set(event, '{claims}', claims);
end $$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

Registered in `config.toml` under `[auth.hook.custom_access_token]`. Because the hook runs at **every** token issue/refresh (not just at creation), a role/tenant change takes effect on the next login/refresh (satisfies REQ-ADM-02 "reflect new role on next login") without a manual `app_metadata` sync step.

**`verifySession()` — `lib/dal/session.ts`:**

```ts
import 'server-only'
import { cache } from 'react'
import { createServerClient } from './supabase'

export interface Session { user: { id: string; email: string }; tenantId: string }

export const verifySession = cache(async (): Promise<Session> => {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()   // validates JWT server-side
  if (!user) redirect('/login')
  const tenantId = user.app_metadata?.tenant_id
    ?? (decodeJwtClaims(user).tenant_id as string | undefined)
  if (!tenantId) throw new AuthorizationError('no-session')   // REQ-AUTH-10 fail-closed
  return { user: { id: user.id, email: user.email! }, tenantId }
})
```

`cache()` memoizes per request render pass so multiple Server Components/Actions share one verified session. `getUser()` (not `getSession()`) is used because it re-validates the token against Supabase rather than trusting the cookie blindly.

---

## 6. Tenant Resolution — `proxy.ts`

Runtime: **Node.js** (Next.js 16 proxy default — supabase-js safe). Optimistic only.

```ts
import { NextResponse, type NextRequest } from 'next/server'

const RESERVED = new Set(['www', 'admin', 'api', 'app'])
const ROOT_PROD = process.env.UTOPIA_ROOT_DOMAIN ?? 'utopia.app'
const ROOT_DEV  = process.env.UTOPIA_ROOT_DOMAIN_DEV ?? 'localhost'

export function proxy(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0]  // strip port
  const root = host.endsWith(ROOT_DEV) ? ROOT_DEV : ROOT_PROD
  const sub  = host.endsWith('.' + root) ? host.slice(0, -(root.length + 1)) : ''

  // bare root or reserved → landing, NOT a tenant (REQ-TR-09/11)
  if (!sub || RESERVED.has(sub)) {
    return NextResponse.next()   // (public) landing; no tenant header injected
  }

  const headers = new Headers(request.headers)
  headers.set('x-utopia-tenant-subdomain', sub)   // UNVERIFIED hint (REQ-TR-04)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|api/health|favicon.ico|.*\\..*).*)'],
}
```

**Explicit non-authority note.** The header is a hint. The DAL's `verifyTenantMatch()` (§7) is the authoritative check: it compares the proxy-injected subdomain against the tenant the authenticated user actually belongs to. Because Next.js 16 Server Actions can bypass the proxy matcher entirely (docs §Execution order), the guard/tenant check inside the DAL — not the proxy — is what enforces isolation. The proxy never queries the DB (perf + prefetch-safe, per proxy guide).

---

## 7. Data Access Layer (DAL)

```ts
// lib/dal/errors.ts
export class AuthorizationError extends Error {
  constructor(public reason: 'module-disabled' | 'no-permission' | 'no-session'
                          | 'tenant-mismatch') {
    super(reason); this.name = 'AuthorizationError'
  }
}

// lib/dal/session.ts
export const verifySession = cache(async (): Promise<Session> => { /* §5 */ })

// lib/dal/tenant.ts
export async function verifyTenantMatch(subdomainFromHeader: string): Promise<void> {
  const { tenantId } = await verifySession()
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('tenant').select('subdominio').eq('id_tenant', tenantId).single()
  if (!data || data.subdominio !== subdomainFromHeader) {
    throw new AuthorizationError('tenant-mismatch')   // REQ-TR-05, 3.4
  }
}

// lib/dal/guard.ts — cached per request so repeated guard calls hit DB once
const loadTenantModulo = cache(async (tenantId: string, codigo: string) => { /* select habilitado */ })
const loadRolPermisos  = cache(async (rolId: string) => { /* select permisos */ })

export async function requireModuleRole(
  session: Session, moduloCodigo: string, accion: string,
): Promise<void> {
  const enabled  = await loadTenantModulo(session.tenantId, moduloCodigo)  // TenantModulo.habilitado
  if (!enabled) throw new AuthorizationError('module-disabled')            // REQ-AG-04a
  const permisos = await loadRolPermisos(session.rolId)                    // Rol.permisos
  if (!permisos[moduloCodigo]?.includes(accion))                          // REQ-AG-04b
    throw new AuthorizationError('no-permission')                          // fail-closed REQ-AG-05
}

// lib/dal/audit.ts
export async function logAudit(params: {
  session: Session; entidad: string; entidadId: string
  accion: 'crear' | 'editar' | 'eliminar' | string
  cambios: Record<string, unknown>; tx?: SupabaseClient
}): Promise<void> { /* see §10 — normally invoked INSIDE the sp_* RPC */ }
```

**Guard both conditions.** `requireModuleRole` fails if either `TenantModulo.habilitado=false` OR the role lacks the action — neither alone suffices (REQ-AG-04/05; brief §1.1). A missing `accion` in the list → denied by default (`?.includes` on undefined is falsy).

### Atomic audit — CLOSED on Option B (RPC-wrapped transaction)

Every non-trivial mutation goes through a Postgres function (`sp_<verb>_<entity>`) that performs the mutation **and** inserts the `auditoria` row in the **same statement/transaction**, invoked from the DAL via `supabase.rpc('sp_...')`.

**Why Option B over Option A (client-side chained calls).** supabase-js has no client-side multi-statement transaction primitive; two separate `.from().update()` + `.from('auditoria').insert()` calls are two round-trips that can partially fail, violating REQ-AL-03 ("same transaction") and Scenario 3.2 ("failed mutation writes no audit"). A single Postgres function is one transaction by definition: if the mutation raises, the audit insert rolls back with it, and vice versa. This also keeps the business rule in a reusable domain service (brief §7), not scattered across UI/actions.

**Data flow (write path):**

```
Client Component ──(form action)──▶ Server Action  (app/(app)/.../actions.ts)
                                          │
                                          ▼
                                   verifySession()        ── throws → redirect/401
                                          │
                                   verifyTenantMatch(sub)  ── throws → tenant-mismatch
                                          │
                                   requireModuleRole(...)  ── throws → 403 / /no-autorizado
                                          │
                                   supabase.rpc('sp_update_usuario', {...})
                                          │  (Postgres, one transaction)
                          ┌───────────────┴─────────────────┐
                          ▼                                  ▼
                   UPDATE usuario ...              INSERT INTO auditoria ...
                          └───────────── commit / rollback ──┘
```

---

## 8. Design System

### 8.1 Tokens location
`lib/design-tokens/tokens.ts` (light, source of truth in TS) and `lib/design-tokens/dark.ts` (derived). These generate the CSS custom properties emitted in `app/globals.css`.

### 8.2 Light palette (verbatim from exploration §4)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F7F5F1` | page background (warm cream) |
| `--text` | `#141210` | primary text |
| `--topbar` | `rgba(247,245,241,.85)` + `blur(10px)` | sticky translucent top bar |
| `--border` / `--border-2` | `#EAE5DE` / `#E7E2DA` | dividers |
| `--card` / `--card-2` / `--card-3` / `--card-4` | `#FCF6F0` / `#FBFAF7` / `#F0ECE6` / `#EFEAE2` | panels |
| `--sidebar-bg` | `#131312` | sidebar (dark in BOTH themes) |
| `--accent-pink` / `--pink-bg` / `--pink-strong` | `#E9A6BC` / `#F7E4EA` / `#C2607F` | brand accent |
| `--terracota` | `#B87A5A` | links / secondary accent |
| `--success` | `#3E8E5A` | success semantics |
| `--muted` / `--muted-2` | `#5A5652` / `#8A837A` | secondary text |

### 8.3 Dark palette (CLOSED — derived here)

Rules applied: invert L in HSL for neutrals; keep accent hue, raise L for contrast on dark bg; verify WCAG 2.1 AA (≥4.5:1 body text, ≥3:1 large/UI) against the dark bg. Sidebar stays `#131312`.

| Token | Dark hex | Contrast vs its bg | Note |
|---|---|---|---|
| `--bg` | `#1A1815` | — | warm near-black (inverted cream) |
| `--text` | `#EDE9E3` | 14.8:1 on `#1A1815` | AAA |
| `--topbar` | `rgba(26,24,21,.85)` + `blur(10px)` | — | inverted translucency |
| `--border` / `--border-2` | `#33302B` / `#3B372F` | — | low-contrast dividers |
| `--card` / `--card-2` / `--card-3` / `--card-4` | `#232019` / `#26221B` / `#2B2720` / `#2E2A22` | — | raised warm neutrals |
| `--sidebar-bg` | `#131312` | — | UNCHANGED (REQ-DS-07) |
| `--accent-pink` | `#E9A6BC` | 7.1:1 on `#1A1815` | AA text — unchanged hue |
| `--pink-bg` | `#3A2630` | — | pink-tinted panel on dark |
| `--pink-strong` | `#E58AA6` | 5.6:1 | raised L for AA on dark |
| `--terracota` | `#D89A78` | 6.0:1 | raised from `#B87A5A` (3.4:1 fails) → AA |
| `--success` | `#4FB574` | 6.4:1 | raised from `#3E8E5A` (2.9:1 fails) → AA |
| `--muted` / `--muted-2` | `#B3ACA1` / `#938C82` | 6.9:1 / 4.6:1 | AA secondary text |

Every paired text/bg here meets AA; `demo-contrast.test.ts` (axe-core) asserts it (REQ-DS-04, §15).

### 8.4 Typography (`next/font`, v16-compatible)

Loaded in `app/layout.tsx` with `next/font`:
- Display: `'Archivo Black', 'Inter', system-ui, sans-serif`
- Body/UI: `'Archivo', 'Inter', system-ui, sans-serif`
- Eyebrow/mono: `'Space Mono', ui-monospace, SFMono-Regular, monospace`

`next/font/google` self-hosts, exposes `--font-display` / `--font-body` / `--font-mono` CSS vars on `<html>`.

### 8.5 Tailwind 4 config (`app/globals.css` shape)

Tailwind 4 uses CSS-first `@theme`. Tokens are CSS custom properties; `data-theme="dark"` on `<html>` swaps the values:

```css
@import "tailwindcss";

:root {
  --bg: #F7F5F1; --text: #141210; --sidebar-bg: #131312;
  --accent-pink: #E9A6BC; --terracota: #B87A5A; --success: #3E8E5A;
  --border: #EAE5DE; --card: #FCF6F0; --muted: #5A5652;
  /* ...full light set... */
}
:root[data-theme="dark"] {
  --bg: #1A1815; --text: #EDE9E3; --sidebar-bg: #131312;
  --accent-pink: #E9A6BC; --terracota: #D89A78; --success: #4FB574;
  --border: #33302B; --card: #232019; --muted: #B3ACA1;
  /* ...full dark set... */
}
@theme inline {
  --color-bg: var(--bg); --color-text: var(--text);
  --color-sidebar: var(--sidebar-bg); --color-accent-pink: var(--accent-pink);
  --color-terracota: var(--terracota); --color-success: var(--success);
  --color-border: var(--border); --color-card: var(--card); --color-muted: var(--muted);
  --font-display: var(--font-display); --font-body: var(--font-body); --font-mono: var(--font-mono);
}
```

`data-theme` (not `prefers-color-scheme` media query alone) is the switch so the toggle can override the OS preference and persist. Sidebar uses `--sidebar-bg`, which is identical in both blocks → stays dark (REQ-DS-07).

### 8.6 Theming provider — `components/theming/ThemeProvider.tsx`

`'use client'` React context. On mount: read `localStorage['utopia-theme']`; if absent, fall back to `window.matchMedia('(prefers-color-scheme: dark)')`. Writes `data-theme` on `document.documentElement` and persists to `localStorage`. Persistence key: **`utopia-theme`**. The authenticated user's choice is also written to `configuracion (seccion='perfil', clave='theme')` via a Server Action so it survives device changes (REQ-DS-06); on login the server value seeds the provider. Theme switch mutates the `data-theme` attribute only — no reload (spec §5).

### 8.7 Base components (`components/ui/`)

| Component | Props (core) | States | Keyboard / ARIA |
|---|---|---|---|
| `SearchableSelect` | `{ options:{value,label}[]; value; onChange; placeholder? }` | closed / open / searching / empty | Tab focus, Enter select, Esc close, ↑↓ navigate; `role="combobox"` + `role="listbox"`/`option`, `aria-expanded`, `aria-activedescendant` |
| `Table` | `{ columns; rows; align?; renderEstado? }` | loading (Skeleton) / empty (EmptyState) / populated | `role="table"`; estado column renders `Badge` (REQ-DS-10) |
| `FilterBar` | `{ filters; searchKey }` | inactive / active (shows "Clear filters") | live via URL params, debounced text, no submit button (REQ-DS-11); Tab/Enter/Esc |
| `Badge` | `{ status; variant:'success'\|'warning'\|'danger'\|'neutral' }` | — | `aria-label`; color + text (never color-only) |
| `Skeleton` | `{ lines?; variant? }` | shimmering | `aria-busy="true"` |
| `EmptyState` | `{ title; description?; cta:{label,onClick\|href} }` (cta **required**) | — | CTA is a focusable button/link (REQ-DS-12) |
| `ConfirmDialog` | `{ open; title; body; confirmLabel; onConfirm; onCancel; destructive? }` | open / closed | focus trap, Esc cancels, Enter confirms; `role="dialog"` + `aria-modal` (REQ-DS-14) |

All 7 keyboard-operable (Tab/Enter/Esc), ARIA-role'd (REQ-DS-15; brief §6.5 "keyboard first").

### 8.8 Demo screen
`app/(app)/demo/page.tsx` renders all 7 components with sample data, plus the `ThemeToggle`. Verified in both themes (REQ-DS-16/17) and must pass `tsc --noEmit` (REQ-DS-18). Etapa 0 closer.

---

## 9. Access Guard Details

- `requireModuleRole` reads `TenantModulo.habilitado` and `Rol.permisos` via `cache()`-wrapped DB queries (one DB hit per key per request render pass).
- Error type: `AuthorizationError` with `reason ∈ {'module-disabled','no-permission','no-session','tenant-mismatch'}` (§7).
- **API/Route Handler layer:** a small `handleAuthError(e)` maps `AuthorizationError` → HTTP 403 with JSON body `{ code: reason, message }` (REQ-AG-08). Any other error → 500.
- **UI layer:** the `administracion/layout.tsx` (and any protected layout) calls the guard; on throw it `redirect('/no-autorizado')` (REQ-AG-09) — never a silent no-op or partial dataset.
- Because layouts don't re-render on every navigation (Next.js auth guide §Layouts), the guard is **also** invoked inside each Server Action / page data fetch, not only at layout — matching REQ-AG-06 and Scenario 3.4 (Server Action reachable despite proxy exclusion).

---

## 10. Audit-log Details

- Every mutation is wrapped in a Postgres function `sp_<verb>_<entity>(...)` that performs the mutation and `INSERT INTO auditoria(...)` in the same transaction (decision 2; REQ-AL-02/03/04 — NOT triggers).
- Example shape:

```sql
create or replace function sp_update_usuario(
  p_id_usuario uuid, p_nombre text, p_id_rol uuid, p_ip inet default null
) returns void language plpgsql as $$
declare v_before jsonb; v_tenant uuid; v_actor uuid := auth.uid();
begin
  select to_jsonb(u.*), u.id_tenant into v_before, v_tenant
    from usuario u where u.id_usuario = p_id_usuario;

  update usuario set nombre_completo = p_nombre, id_rol = p_id_rol
   where id_usuario = p_id_usuario;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'usuario', p_id_usuario::text, 'editar',
          jsonb_build_object('before', v_before,
            'after', jsonb_build_object('nombre_completo', p_nombre, 'id_rol', p_id_rol)),
          p_ip);
end $$;
```

- The DAL calls these via `supabase.rpc('sp_update_usuario', {...})`. RLS still applies inside the function (it runs as the caller unless `security definer` is explicitly needed).
- Client-side `logAudit` (§7) remains for the rare plain INSERT/UPDATE that isn't wrapped, but the default and preferred path is the RPC.
- Audit row shape: `id_auditoria uuid, id_tenant uuid, id_usuario uuid, entidad text, entidad_id text, accion text, cambios jsonb, ts timestamptz default now(), ip inet` (§4.7).

---

## 11. Administration Module

- Route group `app/(app)/administracion/*` — `usuarios`, `roles`, `configuracion`, `modulos`. NOT in the main business sidebar (REQ-ADM-01; brief §5 "NO LO VE EL NEGOCIO PRINCIPAL").
- `administracion/layout.tsx` calls `requireModuleRole(session, 'administracion', 'ver')`; denial → `/no-autorizado` (REQ-ADM-02).
- **User CRUD flow:** invite via `createServiceClient().auth.admin.inviteUserByEmail(email)` (service role, server only), then `INSERT public.usuario` with `id_tenant` + `id_rol` (REQ-ADM-03). On first login the Auth Hook sets `tenant_id` from that row (REQ-ADM-04).
- **Edit:** `sp_update_usuario` updates `nombre_completo` + `id_rol` and audits (REQ-ADM-05/10).
- **Deactivation (soft delete):** set `usuario.estado_usuario='inactivo'` AND ban the auth user via `admin.updateUserById(id, { ban_duration:'876000h' })` so a deactivated user cannot log in or reach tenant data (REQ-ADM-06/07). Never a hard `DELETE`.
- **Credential reset:** `admin.generateLink({ type:'recovery', email })` or `admin.updateUserById` — admin-triggered (REQ-ADM-08; brief §5 "restablecimiento de credenciales").
- **Configuracion skeleton:** CRUD over `configuracion` grouped by `seccion` (REQ-ADM-09), reusing the same base components/theming/filter pattern (brief §6.1).

---

## 12. Testing Approach

**Policy update (post-design decision — no local Postgres/Docker):** all DB tests run as Vitest integration suites against a dedicated Supabase cloud project (test project). pgTAP is dropped as a testing tool for this change. See §15 for the compensating coverage.

| Layer | What | How |
|---|---|---|
| Unit (Vitest) | base components render + keyboard behavior | `@testing-library/react` + `user-event` |
| DAL integration (Vitest) | guard both-conditions, tenant isolation, JWT-missing rejection, mutation+audit atomicity | real `supabase-js` clients signed in as seeded users against Supabase cloud (test project) |
| DB behavior (Vitest) | RLS enforcement, immutability, unique/composite PK, Auth Hook claim emission | same test-project cloud, using `service_role` client to seed and reset, `authenticated` clients to assert enforced behavior |
| a11y (Vitest) | AA contrast both themes on demo | `axe-core` / `jest-axe` |
| Concurrency (Vitest) | two concurrent `configuracion` inserts, same PK → one fails | fire both with `Promise.allSettled`, assert exactly one rejects on PK |

**Vitest DB-behavior suites (`tests/db/`)** — replace prior pgTAP suites 1:1 with behavior-equivalent integration tests:

- `rls-enforcement.test.ts` — for every foundation table (`tenant`, `modulo`, `tenant_modulo`, `configuracion`, `rol`, `usuario`, `auditoria`): as an `authenticated` client without a matching `tenant_id` claim, SELECT returns 0 rows and INSERT/UPDATE/DELETE are rejected; as `service_role`, all pass. This proves RLS is on AND policies filter correctly (REQ-TI-09, compensates dropped `rls_enabled.test.sql`).
- `tenant-isolation.test.ts` — authenticate as tenant A, SELECT tenant B rows → 0 rows across every tenant-scoped table.
- `configuracion-isolation.test.ts` — cross-tenant `configuracion` read → 0 rows (Scenario 3.2).
- `auditoria-immutable.test.ts` — as authenticated user, UPDATE/DELETE `auditoria` rejected; as `service_role`, still rejected because there is no permissive UPDATE/DELETE policy at all (REQ-AL-05).
- `auth-hook-claim.test.ts` — sign up a test user, sign in, decode the returned JWT, assert `tenant_id` claim present and equal to the seeded `usuario.id_tenant`. Also assert the claim is absent for a user with no `usuario` row (mitigates the Auth-Hook risk, §15).
- `sp-audit-atomicity.test.ts` — call an `sp_*` RPC that mutates + audits; force a failure and assert both the mutation and the `auditoria` row roll back together (REQ-AL-03).

**Test-project safety:** every DB-behavior suite MUST `beforeAll` wipe its own scoped fixtures (tenant slug prefixed `test_<uuid>_`) so parallel runs never collide, and MUST NEVER connect to a URL that is not `NEXT_PUBLIC_SUPABASE_URL_TEST`. The test client factory reads `_TEST`-suffixed env vars exclusively.

**CI:** run `test` (Vitest, includes `tests/db/*`) against the test-project cloud; failure blocks merge (REQ-TI-05/06). Fail fast. There is no `test:db` script anymore.

---

## 13. Environment & Configuration

**Policy update (post-design decision — Supabase cloud only):** this change no longer uses Supabase CLI / local Postgres / Docker. Two cloud Supabase projects are provisioned: **`utopia-dev`** (development) and **`utopia-test`** (CI + `tests/db/*` suites). Both are on Supabase's free tier.

`.env.example` (committed) / `.env.local` (git-ignored) template:

```
# Development project (utopia-dev)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Test project (utopia-test) — used by tests/db/*
NEXT_PUBLIC_SUPABASE_URL_TEST=
NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST=
SUPABASE_SERVICE_ROLE_KEY_TEST=

# Tenant-resolution roots
UTOPIA_ROOT_DOMAIN=utopia.app        # prod subdomain parsing
UTOPIA_ROOT_DOMAIN_DEV=localhost     # dev
```

`SUPABASE_SERVICE_ROLE_KEY[_TEST]` is server-only (used by `createServiceClient` + admin invites + test-fixture seeding); never referenced in a client component. `_TEST` variables MUST NOT be exposed to production runtime.

**Migrations** are authored as plain SQL files under `supabase/migrations/NNNNN_verb_scope.sql` (naming from §3). They are applied to each cloud project via the Supabase dashboard **SQL Editor** (dev + test) — copy/paste the up-step, then the down-step is documented in a comment header for manual rollback. A future change MAY reintroduce Supabase CLI once local Docker is viable; the file layout is CLI-compatible.

**Auth Hook registration** is done via each Supabase project's dashboard: **Auth → Hooks → Custom Access Token → Function**: select `public.custom_access_token_hook`. The hook function itself is created by migration `00008_auth_hook_tenant_id.sql`; registering it is a manual dashboard step per project (dev + test), documented in `README.md`.

**CI env vars**: only the `_TEST` variables are set as GitHub Actions secrets. Production deploys read the un-suffixed variables from Vercel's project env.

---

## 14. Migration Ordering

Mapped to the 8 proposal slices (schema A = slices 4, schema B = slice 5, resolution/audit = slice 6):

1. `00001_extensions_and_enums.sql` — pgcrypto, `tenant_estado`, `usuario_estado`, `set_updated_at()`, `auth_tenant_id()`.
2. `00002_tenant.sql` — table + RLS (`tenant_select_own`).
3. `00003_modulo_tenant_modulo.sql` — both tables + RLS (`modulo_select_authenticated`, `tenant_modulo_all_own_tenant`).
4. `00004_configuracion.sql` — table + RLS (`configuracion_all_own_tenant`).
5. `00005_rol.sql` — table + RLS (`rol_all_own_tenant`).
6. `00006_usuario.sql` — table (FK→`auth.users`, FK→`rol`) + RLS (`usuario_all_own_tenant`).
7. `00007_auditoria.sql` — table + RLS (insert/select own) + immutability (no update/delete policy).
8. `00008_auth_hook_tenant_id.sql` — `custom_access_token_hook` + grants.
9. `00009_seed_setup_functions.sql` — `sp_*` mutation+audit helpers used by seed and app.

Each migration includes a reversible down-step (REQ-MTD-10). `seed.sql` (idempotent, ≥2 tenants w/ distinct modules + ≥1 configuracion each) runs after migrations.

---

## 15. Risks & Verification

| Open item (from proposal) | How this design closes it |
|---|---|
| ~~Docker/Supabase CLI availability~~ | **Dropped**: this change runs against Supabase cloud only (§13). Compensating coverage lives in `tests/db/*` Vitest suites (§12). |
| Loss of pgTAP policy-definition coverage | Compensated by `tests/db/rls-enforcement.test.ts` which asserts the effect of every RLS policy on every foundation table for both `authenticated` and `service_role` clients (§12). Test-first order is preserved: every RED test fails before the migration lands. Trade-off: a broken policy is caught by behavior, not by inspecting the SQL of the policy itself. |
| Auth Hook complexity | Exact function body provided (§5); validated end-to-end by `tests/db/auth-hook-claim.test.ts` (real sign-in, JWT decoded, claim asserted) (§12). Registration is a manual dashboard step (§13) — the README's Local Setup section MUST include a checklist for it. |
| Dark-mode contrast | Full derived hex table with measured AA ratios (§8.3); validated on `/demo` via axe-core `demo-contrast.test.ts` (REQ-DS-04). |
| JWT `tenant_id` missing edge case | `auth_tenant_id()` resolves NULL → matches 0 rows (fail-closed, §4); `verifySession()` throws `AuthorizationError('no-session')` (§5); covered by `tests/db/auth-hook-claim.test.ts` "claim absent" branch. |
| Server Action escapes proxy matcher | Guard + tenant check live in the DAL invoked inside every Server Action, not the proxy (§6, §9); Scenario AG 3.4 test. |
| Audit atomicity | RPC-wrapped single-transaction `sp_*` (Option B, §7/§10); Vitest `tests/db/sp-audit-atomicity.test.ts` asserts rollback of both mutation + audit on forced failure. |
| Test-project data leakage into dev | `_TEST` env variables are separated; test client factory rejects any URL that isn't `NEXT_PUBLIC_SUPABASE_URL_TEST`; test fixtures use `test_<uuid>_` slug prefix so parallel CI runs never collide (§12, §13). |

## Threat Matrix

This change touches routing (subdomain resolution in `proxy.ts`) and process integration (Supabase auth/service-role). Applicable rows:

| Boundary | Applicable? | Expected safe behavior | Planned RED test |
|---|---|---|---|
| Subdomain parsing / host spoofing | Applicable | Proxy header is a non-authoritative hint; DAL `verifyTenantMatch` rejects mismatch; unknown/reserved subdomain never resolves to tenant data | `tenant-isolation.test.ts` (wrong-tenant subdomain blocked at DAL, Scenario TR 3.4) |
| Reserved subdomain routed to admin/landing | Applicable | `www/admin/api/app` never treated as tenant; routed to `(public)` | proxy unit test via `unstable_doesProxyMatch` + reserved-set assertion |
| Service-role key exposure | Applicable | `SUPABASE_SERVICE_ROLE_KEY` server-only; `createServiceClient` never imported in client components | build/type boundary + lint check that service client isn't in a `'use client'` module |
| RLS bypass via forgotten guard | Applicable | DAL guard mandatory on every entry point; RLS enabled DB-side as defense in depth | `rls_enabled.test.sql` hygiene test |
| Audit tampering | Applicable | `auditoria` UPDATE/DELETE denied by RLS | `auditoria_immutable.test.sql` |
| Shell/subprocess/VCS-PR automation | N/A | No shell, subprocess, or VCS automation in this change | — |
| Executable-file classification | N/A | No executable classification logic | — |

## Migration / Rollout

Greenfield — no data migration. Additive, reversible migrations; idempotent seed; no production tenants yet (zero data-loss risk). Delivered as 8 chained PRs (proposal forecast: High 400-line risk), each gated on its own green tests. Slice order enforces dependencies: infra → tokens → components → schema A → schema B → resolution/isolation → auth → guard/admin.

---

## 16. Open Design Questions

None blocking. All exploration open questions (1–11) and proposal risks are resolved by product decisions 1–8 and closed in §4–§15 above. Non-blocking notes carried forward for later changes (not this design): diagram/brief entity drift (exploration Q11) and ORM deferral (Q7) — both explicitly out of scope here.

---

## 17. Traceability

| Requirement | Satisfied by |
|---|---|
| REQ-DS-01/02 | §8.2, §8.4 tokens + typography |
| REQ-DS-03/04 | §8.3 derived dark palette + AA ratios; §12 axe test |
| REQ-DS-05/06/07 | §8.6 provider, `utopia-theme` persistence + configuracion sync, sidebar fixed dark |
| REQ-DS-08–15 | §8.7 base components table (props/states/keyboard/ARIA) |
| REQ-DS-16/17/18 | §8.8 demo screen, both themes, `tsc --noEmit` |
| REQ-MTD-01/02 | §4.1 `tenant` (no configFinanzas) |
| REQ-MTD-03/04 | §4.2/§4.3 `modulo` + `tenant_modulo` composite PK |
| REQ-MTD-05 | §4.4 `configuracion` composite PK |
| REQ-MTD-06/07/08/09 | §4 RLS per table; `modulo_select_authenticated`; `tenant_select_own` |
| REQ-MTD-10/11/12 | §14 reversible migrations + idempotent seed |
| REQ-TR-01–11 | §6 `proxy.ts` optimistic parse + reserved set + §7 `verifyTenantMatch` authoritative |
| REQ-AUTH-01/02/03 | §5 `@supabase/ssr` + Auth Hook `tenant_id` |
| REQ-AUTH-04 | §4.6 `usuario` references `auth.users(id)` |
| REQ-AUTH-05/06/07 | §11 password change re-verify flow (`signInWithPassword` before `updateUser`) |
| REQ-AUTH-08/09 | `app/(auth)/settings` reachable every role |
| REQ-AUTH-10 | §5 `verifySession` throws on missing claim; §4 `auth_tenant_id()` NULL fail-closed |
| REQ-AG-01/02 | §4.5 `rol` + permisos shape |
| REQ-AG-03/04/05/06 | §7/§9 `requireModuleRole` both-conditions, every entry point |
| REQ-AG-07/08/09 | §7 `AuthorizationError`; §9 403 / redirect mapping |
| REQ-AL-01 | §4.7 `auditoria` schema (+ `ip inet`) |
| REQ-AL-02/03/04 | §7/§10 RPC-wrapped `sp_*` single transaction, not triggers |
| REQ-AL-05/06 | §4.7 RLS insert/select own, UPDATE/DELETE denied |
| REQ-AL-07 | §4.7 `(id_tenant, ts desc)` index for filtered query |
| REQ-ADM-01–10 | §11 administracion module (route isolation, CRUD, soft delete, reset, audit) |
| REQ-TI-01–11 | §12 Vitest + pgTAP suites, scripts, coverage, concurrency |
