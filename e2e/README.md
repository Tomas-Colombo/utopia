# E2E (Playwright · Chromium)

Browser-level specs that drive the real app against a real Supabase project.
`tests/db/*` (Vitest) covers SQL and RLS; this suite covers what a user can
actually do.

## Running

```bash
npm run test:e2e
```

Playwright starts `next dev` itself (`webServer`) and reuses one that is
already listening. Useful variants:

```bash
npm run test:e2e -- e2e/tests/ventas.spec.ts   # one file
npm run test:e2e:headed                        # watch the browser
npm run test:e2e:ui                            # interactive runner
npm run test:e2e:report                        # last HTML report
```

## How it is wired

- **Chromium only.** These specs assert business behaviour, not rendering
  differences; running them on three engines would triple the database writes
  and prove nothing new.
- **Tenant subdomain base URL.** `proxy.ts` resolves the tenant from the Host
  header, so the suite runs against `http://e2e-utopia.localhost:3000`.
  Chromium resolves any `*.localhost` name to loopback with no `hosts` entry.
  Hitting bare `localhost` would exercise the dev-only "no subdomain"
  degradation path instead of the real one.
- **Isolated tenant, rebuilt every run.** The `setup` project drops and
  recreates the `e2e-utopia` tenant (subdomain, roles, modules, users) plus the
  reference data the flows need: two categories (one with sizes, one without),
  two suppliers, a cash account, an expense category, a 60% margin rule and a
  3-instalment plan. Nothing outside that tenant is touched.
- **Two actors.** `Administrador` (everything) is the default storage state;
  `Vendedor` (`ventas` only) drives the authorization specs. A third throwaway
  user exists solely for the password-change spec, which necessarily burns the
  credential it signs in with.
- **Serial by design.** One tenant and one dev server are shared, and a few
  specs mutate tenant-wide state (module toggles). `workers: 1` keeps failures
  reproducible instead of order-dependent.

## Environment

Read from `.env.local` / `.env`, preferring the `*_TEST` project when it is
configured:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL[_TEST]` | Project the tenant is provisioned in |
| `SUPABASE_SERVICE_ROLE_KEY[_TEST]` | Provisioning (setup only — never used by a spec) |
| `E2E_TENANT_SUBDOMAIN` | Defaults to `e2e-utopia` |
| `E2E_PORT` / `E2E_BASE_URL` | Override the dev server origin |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Override the admin actor |
| `E2E_VENDEDOR_EMAIL` / `E2E_VENDEDOR_PASSWORD` | Override the limited actor |

## Layout

```
e2e/
  config/env.ts        environment resolution (loaded by playwright.config.ts)
  support/             service-role client, tenant provisioning, data helpers
  setup/               the `setup` project: provision + storage states
  pages/               page objects — one per screen family
  fixtures/test.ts     the suite's `test`, with every page object as a fixture
  tests/               the specs
```

Specs never touch Supabase directly. Anything they assert on is created
through the UI; `seed` only exposes the reference data provisioning created.
