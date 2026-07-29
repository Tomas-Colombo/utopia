import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb } from './_helpers'

/**
 * DB testing is postponed until end of Slice 8 (no `utopia-test` cloud
 * project yet, `.env.local` has no `_TEST` keys) — so `hasTestDb` is false
 * in this environment and the block below is skipped. It still imports and
 * type-checks cleanly, proving the harness (`lib/dal/supabase-test.ts`,
 * `tests/db/_helpers.ts`) is wired correctly ahead of the real DB existing.
 *
 * Deviation note: uses `auth.admin.listUsers` (a real service_role-only
 * admin call) rather than a literal `select now()`, because plain
 * `now()`/`version()` live in `pg_catalog`, which PostgREST does not expose
 * via `supabase-js` without a custom RPC wrapper not present in design §4.
 * `listUsers` still proves (a) network connectivity, (b) the service_role
 * key is valid, and (c) we're talking to a real Supabase Auth backend.
 */
describe.skipIf(!hasTestDb)('DB smoke — service_role connects to utopia-test (needs Supabase test project)', () => {
  it('service_role client authenticates and can call an admin-only endpoint', async () => {
    const supabase = createServiceRoleTestClient()
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })

    expect(error).toBeNull()
    expect(data).toBeDefined()
  })

  it('the client is scoped to the _TEST project, never the production one', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL_TEST).toBeDefined()
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL_TEST).not.toBe(process.env.NEXT_PUBLIC_SUPABASE_URL)
  })
})
