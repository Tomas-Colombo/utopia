# Spec: Test Infrastructure

**Capability**: test-infrastructure
**Change**: foundations-multitenant
**Status**: Draft

## 1. Purpose

Stand up the two-runner test harness (Vitest for app/DAL-level integration, pgTAP for DB-level RLS/policy proofs) required before any business logic can be verified, making strict TDD enforceable from this change's `sdd-apply` phase onward.

## 2. Requirements (RFC 2119)

### 2.1 Tooling Installation
- REQ-TI-01: The system MUST install Vitest, `@testing-library/react`, and `@testing-library/user-event` as dev dependencies.
- REQ-TI-02: The system MUST install and configure the Supabase CLI with a local Postgres instance (Docker) supporting `supabase test db` (pgTAP).

### 2.2 Scripts
- REQ-TI-03: `package.json` MUST expose npm scripts: `test`, `test:watch`, `test:coverage`, `test:db`.
- REQ-TI-04: `test:db` MUST run the pgTAP suite via `supabase test db`.

### 2.3 CI
- REQ-TI-05: CI MUST run both the Vitest suite and the pgTAP suite on every change.
- REQ-TI-06: A failure in either suite MUST block merge.

### 2.4 Coverage & TDD
- REQ-TI-07: Coverage target MUST be ≥80% for `lib/dal/` and ≥60% overall (adjustable per `openspec/config.yaml`).
- REQ-TI-08: Strict TDD (RED-GREEN-REFACTOR) MUST be active starting with this change's `sdd-apply` phase.

### 2.5 RLS/Isolation Coverage
- REQ-TI-09: The pgTAP suite MUST include a hygiene test asserting RLS is enabled on every foundation table.
- REQ-TI-10: The Vitest suite MUST include an integration test confirming a cross-tenant read returns an empty result set, never an error leaking existence.
- REQ-TI-11: The suite MUST include at least one concurrency test on a shared write path validating atomic/optimistic-locking UPDATE behavior.

## 3. Scenarios

### 3.1 pgTAP asserts RLS enabled everywhere
- **Given** all foundation-table migrations have run
- **When** `supabase test db` executes the RLS-hygiene test
- **Then** it MUST fail if any foundation table lacks RLS and pass once all do

### 3.2 Vitest confirms cross-tenant isolation
- **Given** two tenants seeded with distinct data
- **When** a Vitest test queries tenant A's data using tenant B's session
- **Then** the query MUST return an empty array, never tenant A's rows or a leaking error

### 3.3 Concurrency test on shared write path
- **Given** two near-simultaneous updates target the same row
- **When** both fire concurrently in the test
- **Then** exactly one MUST succeed and the other MUST fail/retry per the locking contract

### 3.4 CI blocks merge on suite failure
- **Given** a PR breaks either suite
- **When** CI runs
- **Then** the check MUST fail and merge MUST be blocked

### 3.5 Coverage script reports lib/dal coverage
- **Given** `npm run test:coverage` is executed
- **Then** the report MUST include a coverage figure for `lib/dal/` distinct from the overall figure

## 4. Data / Contracts
- npm scripts: `test`, `test:watch`, `test:coverage`, `test:db`.
- Coverage thresholds: `lib/dal/` ≥80%, overall ≥60% (`config.yaml testing.coverage_target`).

## 5. Non-Functional Requirements
- Reliability: pgTAP requires Docker; environment MUST document this prerequisite.
- Consistency: both suites run in CI on every push/PR, not just locally.

## 6. Out of Scope
- E2E/Playwright testing.
- Domain-module test suites (Etapa 3+ changes add their own tests on this harness).

## 7. Traceability
- Proposal decision: 7 (Supabase from zero, includes CLI/Docker setup)
- Brief section: §6.3, §8
- Planificacion etapa: 1 (blocking infra); enforced from Etapa 1 onward
</content>
