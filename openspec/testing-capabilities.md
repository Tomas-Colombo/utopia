# Testing Capabilities — Utopia

**Project**: utopia  
**Initialized**: 2026-07-23  
**Strict TDD**: `false` (no test runner currently installed)

## Current State

| Capability | Status | Command | Notes |
|---|---|---|---|
| Unit testing | ❌ Not available | — | No test framework installed (Jest, Vitest, Mocha, etc.) |
| Integration testing | ❌ Not available | — | No database/API integration test framework |
| E2E testing | ❌ Not available | — | No Playwright, Cypress, etc. |
| Type checking | ✅ Available | `tsc --noEmit` | TypeScript 5 configured |
| Linting | ✅ Available | `npm run lint` | ESLint 9 configured |
| Code coverage | ❌ Not available | — | No coverage tool installed |

## Known Testing Gaps (Blocking)

The project brief REQUIRES these capabilities before SDD implementation work can proceed:

### 1. **RLS (Row Level Security) Isolation Tests**
- **Why**: Every tenant table must enforce RLS at DB level
- **Required for**: Testing that users cannot access other tenants' data
- **Approach**: Integration tests with Supabase client + RLS enabled
- **Blocker**: No Supabase client or integration test setup

### 2. **Concurrency Tests**
- **Why**: Physical concurrency handled via optimistic locking at DB level
- **Required for**: Testing conflict detection and retry logic
- **Approach**: Concurrent transaction tests, version conflict scenarios
- **Blocker**: No concurrency test framework; no ORM for transactional patterns

### 3. **Atomic Transaction Tests**
- **Why**: Critical operations (e.g., sales, inventory updates) must be ACID-compliant
- **Required for**: Testing all-or-nothing semantics across multiple tables
- **Approach**: Integration tests with rollback scenarios, constraint violations
- **Blocker**: No transaction test infrastructure

## Planned Test Stack (Phase 1a)

Based on Next.js 16 + Supabase + strict RLS requirements:

```
Frontend Tests:
  - Vitest (unit tests for React components, utilities)
  - Testing Library React (component testing)
  
Integration Tests:
  - Vitest (API route testing)
  - Supabase client mock + test mode
  
Database/RLS Tests:
  - Supabase test mode or pg_prove (PostgreSQL TAP framework)
  - Custom RLS test harness (per-tenant row verification)
  
E2E Tests (optional Phase 1b):
  - Playwright (critical user journeys)
```

## Installation Checklist for Next Phase

- [ ] Vitest + @vitest/ui
- [ ] @testing-library/react + @testing-library/dom
- [ ] Supabase client (supabase-js)
- [ ] @supabase/auth-helpers-nextjs (if session-based auth)
- [ ] faker.js (seed data for tests)
- [ ] Add `test` script to package.json
- [ ] Add `test:watch` and `test:coverage` scripts
- [ ] Configure vitest.config.ts (TypeScript, path aliases, environment)
- [ ] Create tests/ directory structure
- [ ] Document RLS test patterns in project wiki

## Next Steps

1. **SDD Explore**: Investigate Supabase integration and define auth/RLS model
2. **SDD Spec**: Require test runner setup as a blocking task in Phase 1a
3. **SDD Tasks**: Include test framework installation + RLS test harness setup as Task 1
4. **SDD Apply**: Install and verify test infrastructure before any business logic work
