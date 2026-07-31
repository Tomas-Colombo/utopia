import {
  createBrowserClient as createSupabaseBrowserClient,
  createServerClient as createSupabaseServerClient,
} from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Env vars are read LAZILY inside each factory (never at module import
 * time) so tests can set `process.env` per-case and so a missing var only
 * breaks the specific client that needs it, not every import of this file.
 */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name} — set it in .env.local before creating a Supabase client`)
  }
  return value
}

function getSupabaseUrl(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_URL')
}

function getAnonKey(): string {
  return requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

function getServiceRoleKey(): string {
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY')
}

/**
 * Server Components / Server Actions / Route Handlers client (design §5).
 * Cookie-aware so `supabase.auth.getUser()` re-validates the session JWT.
 */
export async function createServerClient() {
  const cookieStore = await cookies()
  return createSupabaseServerClient(getSupabaseUrl(), getAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // `setAll` was called from a Server Component, where cookies are
          // read-only. Safe to ignore: session refresh is handled by proxy.ts
          // / Server Actions, which CAN write cookies.
        }
      },
    },
  })
}

/** Browser/Client Component client — anon key only, never the service role. */
export function createBrowserClient() {
  return createSupabaseBrowserClient(getSupabaseUrl(), getAnonKey())
}

/**
 * Service-role client — server only. Threat matrix (design §15): never
 * import this from a `'use client'` module; the service role key bypasses
 * RLS entirely.
 */
export function createServiceClient() {
  return createSupabaseServerClient(getSupabaseUrl(), getServiceRoleKey(), {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  })
}
