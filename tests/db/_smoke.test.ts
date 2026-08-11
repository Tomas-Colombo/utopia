import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb } from './_helpers'

/**
 * These suites run against the LOCAL Supabase stack (`supabase start`), which
 * is also what CI boots for every pull request. `hasTestDb` stays false — and
 * the block below skips — whenever the `_TEST` env vars are absent, so a
 * checkout without a running stack still type-checks and passes.
 *
 * Deviation note: uses `auth.admin.listUsers` (a real service_role-only
 * admin call) rather than a literal `select now()`, because plain
 * `now()`/`version()` live in `pg_catalog`, which PostgREST does not expose
 * via `supabase-js` without a custom RPC wrapper not present in design §4.
 * `listUsers` still proves (a) network connectivity, (b) the service_role
 * key is valid, and (c) we're talking to a real Supabase Auth backend.
 */
describe.skipIf(!hasTestDb)('DB smoke — service_role connects to the local stack', () => {
  it('service_role client authenticates and can call an admin-only endpoint', async () => {
    const supabase = createServiceRoleTestClient()
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })

    expect(error).toBeNull()
    expect(data).toBeDefined()
  })

  it('the client is scoped to a throwaway database, never a cloud project', () => {
    const testUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_TEST
    expect(testUrl).toBeDefined()

    // Deliberately stricter than "different from the app's URL". That older
    // check assumed the test database was a second CLOUD project, so it would
    // have passed while pointing at a real one — it only caught reusing the
    // SAME project. These suites write and delete with the service role, which
    // bypasses RLS, so the only acceptable target is a disposable local stack.
    // Any `*.supabase.co` host is a real project and must fail here.
    expect(testUrl).not.toMatch(/supabase\.co/)
  })
})
