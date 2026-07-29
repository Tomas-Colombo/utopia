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
const MISSING_ENV_MESSAGE =
  'Missing NEXT_PUBLIC_SUPABASE_URL_TEST or SUPABASE_SERVICE_ROLE_KEY_TEST — set them in .env.local before running tests/db/*'

function requireTestEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(MISSING_ENV_MESSAGE)
  }
  return value
}

/**
 * service_role client for the `utopia-test` Supabase project. Bypasses RLS
 * — used by `tests/db/*` to seed and reset fixtures.
 */
export function createServiceRoleTestClient() {
  const url = requireTestEnv('NEXT_PUBLIC_SUPABASE_URL_TEST')
  const key = requireTestEnv('SUPABASE_SERVICE_ROLE_KEY_TEST')
  return createClient(url, key)
}

/**
 * anon-key client for the `utopia-test` Supabase project, optionally
 * pre-authenticated with a JWT (e.g. from a fixture `signInWithPassword`)
 * so `tests/db/*` can assert `authenticated`-role RLS behavior.
 */
export function createAnonTestClient(jwt?: string) {
  const url = requireTestEnv('NEXT_PUBLIC_SUPABASE_URL_TEST')
  const key = requireTestEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY_TEST')
  return createClient(
    url,
    key,
    jwt ? { global: { headers: { Authorization: `Bearer ${jwt}` } } } : undefined,
  )
}
