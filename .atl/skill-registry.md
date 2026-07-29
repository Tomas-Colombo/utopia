# Skill Registry — Utopia SDD

**Generated**: 2026-07-23  
**Project**: utopia  
**Registry Version**: 1.0

## Available Skills (by trigger)

### SDD Workflow Skills

| Skill | Trigger | Purpose | Scope |
|-------|---------|---------|-------|
| **sdd-init** | `sdd init`, `iniciar sdd`, `openspec init` | Initialize SDD context, testing capabilities, registry | Project bootstrap |
| **sdd-explore** | `sdd explore`, `investigar` | Explore ideas before committing to a change; clarify requirements | Discovery phase |
| **sdd-propose** | `sdd propose`, `propuesta sdd` | Create a change proposal with intent, scope, and approach | Design entry point |
| **sdd-spec** | `sdd spec`, `especificación sdd` | Write delta specs with requirements and scenarios | Specification phase |
| **sdd-design** | `sdd design`, `diseño sdd` | Create technical design and architecture approach | Architecture phase |
| **sdd-tasks** | `sdd tasks`, `tareas sdd` | Break change into implementation tasks | Planning phase |
| **sdd-apply** | `sdd apply`, `aplicar sdd` | Implement tasks from specs and design | Implementation phase |
| **sdd-verify** | `sdd verify`, `verificar sdd` | Execute tests and prove implementation matches specs | Verification phase |
| **sdd-archive** | `sdd archive`, `archivar sdd` | Archive completed SDD change by syncing delta specs | Closure phase |
| **sdd-onboard** | `sdd onboard`, `capacitar` | Walk through full SDD workflow on real codebase | Tutorial/learning |

### Specialized Skills

| Skill | Trigger | Purpose | Scope |
|-------|---------|---------|-------|
| **branch-pr** | creating/opening/preparing PRs | Create Gentle AI PRs with issue-first checks | PR creation |
| **chained-pr** | PRs >400 lines, stacked PRs | Split oversized changes into chained PRs | Large changes |
| **work-unit-commits** | commit splitting, chained PRs | Plan commits as reviewable work units | Commit planning |
| **comment-writer** | PR feedback, issue replies, reviews | Write warm, direct collaboration comments | Communication |
| **issue-creation** | creating GitHub issues, bug reports | Create Gentle AI issues with issue-first checks | Issue management |
| **judgment-day** | `judgment day`, `dual review` | Run explicit blind dual review (≤2 rounds) | Code review |
| **go-testing** | Go tests, coverage, teatest | Apply focused Go testing patterns | Go projects (not applicable here) |
| **cognitive-doc-design** | writing guides, READMEs, RFCs | Design docs that reduce cognitive load | Documentation |
| **skill-creator** | new skills, agent instructions | Create LLM-first skills with valid frontmatter | Skill development |
| **skill-improver** | improve/audit skills, quality | Audit and upgrade existing LLM-first skills | Skill maintenance |
| **skill-registry** | update skills, registry changes | Index available skills by trigger and path | Registry maintenance |

### Configuration Skills

| Skill | Trigger | Purpose | Scope |
|-------|---------|---------|-------|
| **customize-opencode** | editing opencode.json, agents, skills, MCP | Configure opencode itself (NOT project code) | Opencode configuration |

## Project-Specific Workflow (Utopia)

### Recommended SDD Flow for Phase 1

```
1. sdd-init (DONE ✓)
   └─ Detected stack, testing gaps, conventions
   
2. sdd-explore
   ├─ Spike Supabase auth model
   ├─ Investigate RLS policy patterns
   ├─ Clarify user stories + requirements
   └─ Prototype test framework setup
   
3. sdd-propose
   └─ Create Phase 1 proposal with intent, scope, deliverables
   
4. sdd-spec
   ├─ Specify test framework + RLS test harness
   ├─ Specify auth flow + session management
   ├─ Specify database schema + RLS policies
   └─ Specify multi-tenant guard patterns
   
5. sdd-design
   ├─ Architecture for auth middleware
   ├─ Design RLS policy structure
   ├─ Design transactional patterns
   └─ Design component hierarchy (from visual identity)
   
6. sdd-tasks
   └─ Break into 4–6 implementation tasks (see KNOWN GAPS below)
   
7. sdd-apply (chained PRs, 400 lines each)
   ├─ PR 1: Test framework + RLS harness
   ├─ PR 2: Supabase + migrations + RLS policies
   ├─ PR 3: Auth middleware + session guard
   ├─ PR 4: Core tables + initial RLS
   ├─ PR 5: Component library (from visual identity)
   └─ [more PRs as needed]
   
8. sdd-verify
   └─ Run full test suite; verify RLS isolation, concurrency, atomicity
   
9. sdd-archive
   └─ Sync delta specs; close Phase 1; plan Phase 1b
```

## Known Gaps Blocking Implementation

| Gap | Severity | Impact | Mitigation |
|-----|----------|--------|-----------|
| No test framework installed | 🔴 BLOCKING | Cannot verify RLS, concurrency, transactions; no CI/CD safety | Task 1: Install Vitest + @testing-library + Supabase test mode |
| Supabase not integrated | 🔴 BLOCKING | No database, auth, or RLS enforcement; all data ops are stubs | Task 2: Set up Supabase project + migrations + RLS templates |
| RLS policies undefined | 🔴 BLOCKING | Multi-tenant isolation cannot be verified or implemented | Phase 1 Explore: Design RLS structure per role + tenant status |
| Visual identity not coded | 🟡 HIGH | Cannot build UI components from `Utopía Sistema Oficial .html` | Task 5: Create Tailwind CSS + component library matching design |
| ORM/query builder not chosen | 🟡 MEDIUM | Transaction patterns unclear; must decide on query abstraction | Phase 1 Explore: Evaluate postgrest-js vs Supabase query builder vs raw SQL |

## Context7 Library Resolution

For this project, useful library documentation:
- **Next.js 16**: `/vercel/next.js/v16.2.10` (breaking changes guide)
- **React 19**: `/facebook/react/19.2.4`
- **TypeScript 5**: `/microsoft/typescript/5`
- **Tailwind CSS 4**: `/tailwindlabs/tailwindcss/4`
- **Supabase**: `/supabase/supabase` (auth, RLS, migrations)
- **Vitest** (when installed): `/vitest-dev/vitest`

## Engram Memory Integration

- **Topic Key**: `sdd-init/utopia`
- **Memory Scope**: Project-level
- **Persisted Observations**:
  - Init result (this registry + config + testing gaps)
  - HARD CONVENTION: Next.js 16 compatibility rule
  - Testing blocker: RLS + concurrency + transaction tests required
  - Supabase integration gap (auth + RLS policies + migrations)

## Session Tracking

- **Initiated**: 2026-07-23 (UTC)
- **Mode**: Interactive
- **Persistence**: OpenSpec (file-based) + Engram (memory)
- **Delivery Strategy**: Force-chained (chained/stacked PRs, 400 lines per PR)
- **Next Actor**: Project lead or SDD explorer

---

**Status**: ✅ SDD Init complete. Ready for sdd-explore phase.
