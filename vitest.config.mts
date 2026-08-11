import { fileURLToPath } from 'node:url'
import { config as loadEnvFile } from 'dotenv'
import { defineConfig } from 'vitest/config'

/**
 * The `tests/db/*` suites talk to a real Postgres and gate themselves on the
 * `_TEST` env vars (`tests/db/_helpers.ts`). Vitest does NOT read `.env` files
 * into `process.env` on its own — Vite only surfaces `VITE_`-prefixed values,
 * and only on `import.meta.env` — so without this the DB suites see
 * `undefined` and silently skip, which reads exactly like passing.
 *
 * Loaded here in the config module (not `tests/setup.ts`) because that file
 * runs inside the jsdom environment, while workers inherit `process.env` from
 * this process. `.env.local` wins over `.env`, matching how Next.js and
 * `e2e/config/env.ts` resolve them.
 */
loadEnvFile({ path: fileURLToPath(new URL('./.env.local', import.meta.url)) })
loadEnvFile({ path: fileURLToPath(new URL('./.env', import.meta.url)) })

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Vitest's default `include` also matches `*.spec.ts`, which would pull in
    // the Playwright suite (it needs a browser and a live server, and would
    // fail instantly under jsdom).
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['app/**', 'components/**', 'lib/**', 'proxy.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
        'lib/dal/**': {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      '@/lib': fileURLToPath(new URL('./lib', import.meta.url)),
      '@/components': fileURLToPath(new URL('./components', import.meta.url)),
    },
  },
})
