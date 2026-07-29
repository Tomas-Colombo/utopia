# Project Context — Utopia SaaS

**Project**: utopia  
**Version**: 0.1.0  
**Status**: Phase 1 initialization  
**Stack**: Next.js 16 + React 19 + TypeScript 5 + Tailwind CSS 4 + Supabase (planned)

## Executive Summary

Utopía is a multi-tenant SaaS management system for clothing store operations. It's being built as the core of a resellable product that customers can deploy and customize. Phase 1 focuses on establishing the foundational architecture with strict RLS, feature flagging, role-based access control, atomic transactions, and comprehensive UI patterns.

## Core Architecture Principles

### Multi-Tenancy (Hard Requirement)

- **Identity Column**: Every domain table carries `idTenant` (foreign key to tenants table)
- **Row Level Security**: PostgreSQL RLS policies enforce tenant isolation at DB level
- **Zero Trust Verification**: Every API handler and database query must:
  1. Verify the requesting user belongs to the target tenant
  2. Verify the user has the required module + role for the action
  3. Pass the tenant ID explicitly to database operations
- **Feature Flags**: Modules enabled/disabled per tenant configuration
- **Pattern**: Guard clauses before any data access

### Data Integrity & Concurrency

- **Atomic Transactions**: Critical operations (sales, inventory moves) must be ACID-compliant across multiple tables
- **Optimistic Locking**: Physical concurrency handled at DB level using version/timestamp columns (NOT application-level retry logic)
- **Constraint Enforcement**: Database layer is source of truth for invariants
- **Testing**: Concurrency tests required to validate conflict detection and resolution

### User Interface Standards

- **Dark/Light Theming**: Full support, persisted to user preferences
- **Unified Filter Pattern**: Every list implements the same filter UX
- **Export Capability**: Every list supports export to Excel, CSV, and PDF
- **Responsive Design**: Mobile-first approach with Tailwind CSS 4

## Data Model

**Source of Truth**: `utopia-intructivo/DiagramaDeClases.drawio`

Current understanding (to be refined in Explore phase):
- **Tenants**: Tenant configuration and subscription
- **Users**: User accounts with role assignments per tenant
- **Modules**: Feature modules (Inventory, Sales, Finance, etc.)
- **Roles**: Access control roles with permission matrices
- **Inventory**: SKUs, stock levels, physical movements
- **Sales**: Orders, line items, customer data
- **Finance**: Transactions, accounts, reporting
- **Audit Log**: All mutations tracked with user/tenant/timestamp

## Visual Identity & UX

**Source of Truth**: `utopia-intructivo/Utopía Sistema Oficial .html`

Constraints:
- Follow the official design system exactly
- Use provided color palettes, typography, spacing
- Component library must match the visual language

## Critical Project Constraints

### Next.js 16 Compatibility ⚠️

**HARD CONVENTION**: This version has breaking changes from training data.

Before writing ANY code:
1. Read `node_modules/next/dist/docs/` for the relevant guide
2. Check deprecation notices in error messages
3. Do NOT assume patterns from Next.js 12–15 apply

Examples of known breakage areas:
- App Router file conventions
- API route response handling
- Middleware setup
- Image optimization
- Font loading

### Testing is Blocking ⚠️

**KNOWN GAP**: No test framework currently installed.

Project brief explicitly requires:
- RLS isolation tests (verify row-level security enforcement)
- Concurrency tests (validate optimistic locking + conflict detection)
- Transaction tests (ensure atomic operations complete or rollback together)

**Consequence**: Cannot begin SDD change work until test infrastructure is installed and RLS test harness is operational.

**Phase 1a Task**: Install Vitest + testing libraries + Supabase test mode + RLS test patterns.

### Supabase Not Yet Integrated ⚠️

**Current State**: No Supabase dependencies installed; project uses skeleton Next.js config.

**Required Before Phase 1b**:
- Supabase project setup (PostgreSQL instance + API key)
- supabase-js client library
- Authentication strategy (Session-based? JWT? SSO?)
- RLS policy templates for all tables
- Database migration system (Supabase Migration CLI or similar)

**Phase 1a Task**: Spike Supabase integration and auth model; design RLS policy structure.

## Delivery Strategy

- **Versioning**: Semantic versioning (0.1.0 → major.minor.patch)
- **Git Workflow**: GitHub (implied; .git present)
- **PR Strategy**: Force-chained (stacked/chained PRs) with 400-line review budget per PR
- **Commit Style**: Conventional commits (type: scope: message)
- **Testing**: Strict TDD required once test framework is installed

## Directory Structure (Current)

```
utopia/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page
│   ├── globals.css              # Global styles
│   └── favicon.ico
├── public/                       # Static assets
├── utopia-intructivo/           # Source of truth docs
│   ├── DiagramaDeClases.drawio  # Data model diagram
│   ├── Utopía Sistema Oficial.html  # Visual identity
│   └── Ejecucion Utopia (reorganizado).docx.txt
├── node_modules/
├── .next/                        # Build output
├── openspec/                     # SDD artifacts (THIS SESSION)
│   ├── config.yaml              # Stack, conventions, testing
│   ├── testing-capabilities.md  # Test framework status
│   ├── project-context.md       # This document
│   └── (future: proposals, specs, designs, tasks)
├── .git/
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
├── README.md
├── AGENTS.md                     # Hard Next.js 16 compatibility rule
└── CLAUDE.md                     # Claude context (if present)
```

## Next Steps (Recommended SDD Flow)

1. **SDD Explore**: 
   - Clarify Supabase auth model (session vs JWT vs OAuth)
   - Define RLS policy structure (by role? by tenant status?)
   - Document expected user stories for Phase 1 features
   - Spike test framework setup (Vitest + Supabase test mode)

2. **SDD Spec**:
   - Specify test framework requirements + RLS test patterns
   - Define authentication flow and session management
   - Outline database schema (simplified Phase 1 subset)

3. **SDD Tasks**:
   - Task 1: Install and configure test framework + RLS harness
   - Task 2: Set up Supabase project + migrations + RLS policies
   - Task 3: Implement auth middleware + session guard
   - Task 4: Build core tables + initial RLS policies

4. **SDD Apply**:
   - Implement in chained PRs (400 lines each)
   - Every PR must include tests for its RLS/transaction scope
   - Verify strict TDD compliance

## References

- **Data Model**: utopia-intructivo/DiagramaDeClases.drawio
- **Design System**: utopia-intructivo/Utopía Sistema Oficial .html
- **Execution Plan**: utopia-intructivo/Ejecucion Utopia (reorganizado).docx.txt
- **Next.js 16 Breaking Changes**: node_modules/next/dist/docs/
- **SDD Config**: openspec/config.yaml
- **Testing Status**: openspec/testing-capabilities.md
