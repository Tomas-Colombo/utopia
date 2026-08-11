import path from 'node:path'
import { config as loadEnvFile } from 'dotenv'

/**
 * Single source of truth for every environment value the E2E suite needs.
 *
 * Loaded eagerly (at import time) because `playwright.config.ts` reads
 * `BASE_URL` while building its own config object, before any fixture runs.
 * `.env.local` wins over `.env`, matching how Next.js itself resolves them.
 */
export const REPO_ROOT = path.resolve(__dirname, '..', '..')

loadEnvFile({ path: path.join(REPO_ROOT, '.env.local') })
loadEnvFile({ path: path.join(REPO_ROOT, '.env') })

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. The E2E suite talks to a real Supabase project — ` +
        'set it in .env.local before running `npm run test:e2e`.',
    )
  }
  return value
}

/**
 * The suite prefers the dedicated `*_TEST` project when it is configured and
 * falls back to the dev project otherwise. Both are non-production by
 * convention; the fixtures only ever touch the isolated E2E tenant created
 * below, so nothing else in the project is affected.
 */
export const SUPABASE_URL = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL_TEST || process.env.NEXT_PUBLIC_SUPABASE_URL,
)

export const SUPABASE_SERVICE_ROLE_KEY = required(
  'SUPABASE_SERVICE_ROLE_KEY',
  process.env.SUPABASE_SERVICE_ROLE_KEY_TEST || process.env.SUPABASE_SERVICE_ROLE_KEY,
)

/**
 * Tenant resolution happens on the host (`proxy.ts`), so the whole suite has
 * to run against a subdomain of the dev root domain. Chromium resolves any
 * `*.localhost` name to the loopback address without touching `hosts`.
 */
export const TENANT_SUBDOMAIN = process.env.E2E_TENANT_SUBDOMAIN ?? 'e2e-utopia'
export const TENANT_NOMBRE = 'Utopía E2E'

export const APP_PORT = process.env.E2E_PORT ?? '3000'
export const BASE_URL =
  process.env.E2E_BASE_URL ?? `http://${TENANT_SUBDOMAIN}.localhost:${APP_PORT}`

/** Health-check target for Playwright's `webServer` (no subdomain needed). */
export const SERVER_URL = `http://localhost:${APP_PORT}`

export interface E2EUser {
  email: string
  password: string
  nombre: string
  /** Storage state file produced by the setup project. */
  storageState: string
}

const AUTH_DIR = path.join(REPO_ROOT, 'e2e', '.auth')

/** Full permissions on every module — the default actor for most specs. */
export const ADMIN: E2EUser = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'e2e.admin@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'E2eUtopia!2026',
  nombre: 'E2E Administrador',
  storageState: path.join(AUTH_DIR, 'admin.json'),
}

/** `ventas` only — exists so the permission gates can be exercised. */
export const VENDEDOR: E2EUser = {
  email: process.env.E2E_VENDEDOR_EMAIL ?? 'e2e.vendedor@example.com',
  password: process.env.E2E_VENDEDOR_PASSWORD ?? 'E2eUtopia!2026',
  nombre: 'E2E Vendedor',
  storageState: path.join(AUTH_DIR, 'vendedor.json'),
}

/**
 * Throwaway identity for the password-change spec.
 *
 * Changing a password invalidates the credential the storage state was minted
 * from, so it cannot be done on an actor other specs depend on. This user
 * exists to be burned once per run — the tenant is rebuilt every time anyway.
 * It never gets a storage state: that spec logs in through the UI.
 */
export const PASSWORD_USER: E2EUser = {
  email: process.env.E2E_PASSWORD_EMAIL ?? 'e2e.password@example.com',
  password: process.env.E2E_PASSWORD_PASSWORD ?? 'E2eUtopia!2026',
  nombre: 'E2E Cambio de contraseña',
  storageState: path.join(AUTH_DIR, 'password.json'),
}

/** Where the setup project publishes the ids it seeded, for specs to read. */
export const SEED_FILE = path.join(AUTH_DIR, 'seed.json')
