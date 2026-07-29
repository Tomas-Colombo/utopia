import { randomUUID } from 'node:crypto'

/**
 * True only when BOTH `_TEST` Supabase env vars are present. Every
 * `tests/db/*` suite gates its `describe` block on this so the suite still
 * imports and type-checks cleanly (and shows as a passing "skip" in CI/local
 * runs) even before the `utopia-test` cloud project exists — DB testing is
 * postponed to end of Slice 8 (see apply-progress).
 */
export const hasTestDb =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL_TEST) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY_TEST)

/**
 * Generates a unique, collision-safe fixture slug prefixed `test_<uuid>_`
 * (design §12 test-project safety note), so parallel suite runs against the
 * shared `utopia-test` cloud project never collide on unique columns like
 * `tenant.subdominio`.
 *
 * @example withScopedTenant('acme') // => 'test_3f9c2e40-...-acme'
 */
export function withScopedTenant(prefix: string): string {
  return `test_${randomUUID()}_${prefix}`
}

/**
 * No-op stub. Once `utopia-test` exists, this will delete every fixture row
 * whose scoping slug starts with `test_` across the foundation tables, so
 * suites can `beforeAll(resetTestData)` without leaking fixtures between
 * runs. Left empty for Slice 4 because there is no live DB to reset yet.
 */
export async function resetTestData(): Promise<void> {
  // Intentionally empty — implemented once the utopia-test project exists.
}
