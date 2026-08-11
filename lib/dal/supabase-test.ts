import { createClient } from '@supabase/supabase-js'

/**
 * Test-project client factory (task 4.1). Reads ONLY the `_TEST`-suffixed
 * env vars — never the production `NEXT_PUBLIC_SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY` — so `tests/db/*` can never accidentally
 * write to the dev/prod Supabase project (threat matrix: test-project data
 * leakage into dev, design §12/§13/§15).
 *
 * Deviation from design's `import 'server-only'` snippet: the `server-only`
 * package is not an installed dependency and this slice may not add new
 * deps, so server-only-ness is enforced by convention (this file is only
 * ever imported from `tests/db/*`, a server-side Vitest environment) rather
 * than by a build-time guard. Documented in the Slice 4 apply-progress.
 */
function requireTestEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    // Name the variable that is ACTUALLY missing. A fixed message listing only
    // the URL and service-role vars used to be thrown for the anon key too,
    // which sent readers hunting for a variable that was already set.
    throw new Error(
      `Missing ${name} — set the three _TEST vars in .env.local before running ` +
        'tests/db/*. They point at the local `supabase start` stack; run ' +
        '`supabase status -o env` to read the values rather than copying them ' +
        'from a masked field.',
    )
  }
  return value
}

/**
 * Vitest runs these suites in the `jsdom` environment, so `localStorage`
 * exists — and supabase-js, which defaults to `persistSession: true`, writes
 * every session it creates into it. A single `signInWithPassword` in one test
 * therefore leaked the USER's token into every client constructed afterwards,
 * including the service_role one: it kept the name but stopped bypassing RLS,
 * and fixtures failed with `42501: new row violates row-level security policy`
 * several tests away from the sign-in that caused it.
 *
 * These clients are short-lived fixtures. They must never share auth state.
 */
const NO_SHARED_SESSION = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const

/**
 * service_role client for the test database. Bypasses RLS — used by
 * `tests/db/*` to seed fixtures.
 */
export function createServiceRoleTestClient() {
  const url = requireTestEnv('NEXT_PUBLIC_SUPABASE_URL_TEST')
  const key = requireTestEnv('SUPABASE_SERVICE_ROLE_KEY_TEST')
  return createClient(url, key, NO_SHARED_SESSION)
}

/**
 * anon-key client for the `utopia-test` Supabase project, optionally
 * pre-authenticated with a JWT (e.g. from a fixture `signInWithPassword`)
 * so `tests/db/*` can assert `authenticated`-role RLS behavior.
 */
export function createAnonTestClient(jwt?: string) {
  const url = requireTestEnv('NEXT_PUBLIC_SUPABASE_URL_TEST')
  const key = requireTestEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST')
  return createClient(url, key, {
    ...NO_SHARED_SESSION,
    ...(jwt ? { global: { headers: { Authorization: `Bearer ${jwt}` } } } : {}),
  })
}
