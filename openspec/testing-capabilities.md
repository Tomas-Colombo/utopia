# Testing Capabilities — Utopia

**Project**: utopia  
**Initialized**: 2026-07-23  
**Strict TDD**: `true` (Vitest installed and gated)

## Current State

| Capability | Status | Command | Notes |
|---|---|---|---|
| Unit testing | ✅ Available | `pnpm test` | Vitest + 28 unit test files |
| Integration testing | ✅ Available | `pnpm test` | 18 DB specs against real Postgres |
| E2E testing | ✅ Available | `pnpm exec playwright test` | 14 Playwright specs |
| Type checking | ✅ Available | `tsc --noEmit` | TypeScript 5 configured |
| Linting | ✅ Available | `pnpm run lint` | ESLint 9 configured |
| Code coverage | ✅ Available | `pnpm test --coverage` | istanbul provider, `include` scoped, gated in CI |

## Test Infrastructure

- **Test Runner**: Vitest
- **E2E Framework**: Playwright
- **Coverage**: istanbul, gated in CI on server actions (100% on exported actions)
- **Database Tests**: Real Postgres instance, asserting RLS and isolation
