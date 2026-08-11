import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '../config/env'

/**
 * service_role client used ONLY by the E2E setup/teardown to build the
 * isolated tenant the specs run against. It bypasses RLS, so it must never
 * leak into a spec: tests drive the app through the browser, which is the
 * whole point of the suite.
 */
let client: SupabaseClient | null = null

export function serviceRoleClient(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

/** Throws with the Postgres message attached, so failures name the table. */
export function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  if (result.data === null) throw new Error(`${what}: no rows returned`)
  return result.data
}
