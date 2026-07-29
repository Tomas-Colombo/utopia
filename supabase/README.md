# Supabase — Migrations & Manual Apply Workflow

This project uses **two Supabase cloud projects on the free tier** — `utopia-dev`
and `utopia-test` — and does **not** depend on the Supabase CLI or Docker.
Migrations are plain SQL files applied by hand through each project's dashboard
SQL Editor.

## Migration naming convention

```
supabase/migrations/NNNNN_verb_scope.sql
```

- `NNNNN` — zero-padded 5-digit sequence number, applied in ascending order.
- `verb_scope` — snake_case description of what the migration does, e.g.
  `00002_tenant.sql`, `00008_auth_hook_tenant_id.sql`.

Each migration file MUST include a reversible **down-step** documented as a SQL
comment header at the top of the file (see "Rollback" below).

## Manual apply order

1. Open the Supabase dashboard for **`utopia-test`** → SQL Editor.
2. Paste the **up-step** SQL of the next pending migration file (in ascending
   `NNNNN` order) and run it.
3. Run `npm test` locally. The corresponding `tests/db/*` suite for that
   migration must go green before moving on.
4. Once green, apply the exact same SQL to **`utopia-dev`** via its own SQL
   Editor.
5. Repeat for the next migration file in sequence.

`supabase/seed.sql` is applied the same way, after all migrations for a given
slice have landed, to both `utopia-test` and `utopia-dev`.

## Rollback

Every migration file's down-step is documented as a comment header at the top
of the file (e.g. `-- DOWN: drop table tenant;`). To roll back, copy the
down-step SQL from the affected migration(s) — in descending order — into the
dashboard SQL Editor of the project being rolled back, and run it.

## Auth Hook dashboard registration checklist

The Auth Hook function itself (`public.custom_access_token_hook`) is created by
a migration (see `design.md` §5/§14). Registering it as the active hook is a
**manual dashboard step**, required in **both** `utopia-dev` and `utopia-test`:

1. Open the Supabase dashboard for the project.
2. Go to **Auth → Hooks**.
3. Under **Custom Access Token**, click **Function**.
4. Select `public.custom_access_token_hook` from the dropdown.
5. Click **Save**.
6. Repeat steps 1–5 for the other project (`utopia-dev` / `utopia-test`).

The hook function is created by `supabase/migrations/00008_auth_hook_tenant_id.sql`
(Slice 5). This manual dashboard registration step remains blocked until
`utopia-dev`/`utopia-test` exist (postponed to end of Slice 8) — apply the
migration SQL, then complete this checklist for each project once created.
