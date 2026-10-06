# Utopía

Multi-tenant SaaS to run a clothing store: inventory, pricing, sales,
instalments, consignment and expenses. Next.js 16 + React 19 + Supabase.

Working on this repo (humans or AI agents): read [`AGENTS.md`](AGENTS.md).
It holds the commands, architecture rules and conventions. The module map is
in [`docs/modulos.md`](docs/modulos.md); migrations in
[`supabase/README.md`](supabase/README.md).

## Quick start

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill it in.
3. `supabase start` (needs Docker) for the local database.
4. `pnpm dev`
