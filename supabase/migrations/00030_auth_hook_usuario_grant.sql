-- 00030_auth_hook_usuario_grant.sql
-- UP: Let the Custom Access Token hook (`custom_access_token_hook`, 00008)
--     actually READ `public.usuario` at token-issue time.
--
--     The hook is SECURITY INVOKER, so GoTrue runs it as `supabase_auth_admin`.
--     Migration 00008 granted EXECUTE on the function but never gave that role
--     read access to the table the function queries. With RLS enabled on
--     `usuario` and its only policy scoped to `authenticated`, the hook's
--     `select id_tenant from usuario` fails with "permission denied", GoTrue
--     returns `500: Error running hook`, token issuance aborts, and EVERY
--     login is rejected (surfaced to the client as a generic error).
--
--     Fix = both halves the role needs under RLS: a table-level SELECT grant
--     AND an RLS policy for `supabase_auth_admin` (which lacks BYPASSRLS).
-- DOWN:
--   drop policy if exists usuario_auth_admin_read on usuario;
--   revoke select on public.usuario from supabase_auth_admin;

grant select on public.usuario to supabase_auth_admin;

-- `create policy` has no IF NOT EXISTS; drop-first keeps this re-runnable.
drop policy if exists usuario_auth_admin_read on usuario;
create policy usuario_auth_admin_read on usuario
  for select to supabase_auth_admin
  using (true);
