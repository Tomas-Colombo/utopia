import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
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
