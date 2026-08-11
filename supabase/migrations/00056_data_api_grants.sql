-- 00056_data_api_grants.sql
-- UP: Grant the PostgREST ("Data API") roles access to the `public` schema.
--
--     Until now NO migration granted anything to `anon` / `authenticated` /
--     `service_role`. The schema worked on `utopia-dev` only because that
--     project predates Supabase's change of default: back then every new
--     table in `public` was auto-exposed to those roles. New projects — and
--     the local CLI stack — do NOT auto-expose, so a database rebuilt from
--     these migrations answered every request with
--     `42501: permission denied for table <x>`. The `auto_expose_new_tables`
--     opt-out that restores the old behaviour is removed 2026-10-30 (see the
--     comment on it in `supabase/config.toml`), so relying on it was never an
--     option — this had to be written down.
--
--     Consequently this migration does not CHANGE production; it records what
--     production already IS, so that a fresh database reproduces it. Verified
--     against `utopia-dev` before writing: all 31 public tables already carry
--     ALL privileges for the three roles, so applying this there is a no-op.
--
--     SAFETY: granting to `anon` / `authenticated` exposes no data by itself.
--     All 31 tables in `public` have RLS enabled (verified 31/31) and this
--     migration adds no policy. The grant is the outer door; RLS still decides
--     which rows are visible. That split — permissive grants, restrictive
--     policies — is the standard Supabase model, not a shortcut.
-- DOWN:
--   alter default privileges in schema public revoke all on routines from anon, authenticated, service_role;
--   alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
--   alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
--   revoke all on all routines in schema public from anon, authenticated, service_role;
--   revoke all on all sequences in schema public from anon, authenticated, service_role;
--   revoke all on all tables in schema public from anon, authenticated, service_role;
--   revoke usage on schema public from anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Everything created by 00001..00055.
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- Future objects, so migrations from 00057 on do not each have to remember
-- this. Applies to objects created by the migration role (`postgres`).
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;

-- The blanket grant above is deliberately broad, which means the two routines
-- that must NOT be callable through the Data API have to be re-revoked right
-- here. Both are RESTATEMENTS of decisions made earlier, not new ones: an
-- earlier migration's revoke cannot survive a later `grant on all routines`.
-- If either origin migration changes, change this too.

-- Origin: 00008. GoTrue invokes the hook as `supabase_auth_admin`. A
-- logged-in client able to call it directly could mint its own `tenant_id`
-- claim, which is the whole tenant boundary.
revoke execute on function public.custom_access_token_hook(event jsonb)
  from anon, authenticated, public;

-- Origin: 00054, which superseded this entry point with
-- `sp_crear_consignacion_con_items` (a consignación with no items is not a
-- valid state -- see lib/dal/consignaciones/consignacion.ts).
--
-- READ THIS BEFORE TRUSTING IT: the revoke below removes only the EXPLICIT
-- grant that this migration's `grant all on all routines` just handed out. It
-- does NOT actually stop `authenticated` from calling the function, because
-- PostgreSQL grants EXECUTE to PUBLIC on every new function and 00054 never
-- revoked THAT. Verified on utopia-dev:
-- `has_function_privilege('authenticated', 'sp_crear_consignacion(uuid,text,inet)', 'EXECUTE')`
-- returns TRUE there too, so 00054's revoke has never had its intended effect
-- in production either. Compare 00008, which revokes from `public` explicitly
-- and therefore does close its door.
--
-- The statement stays because it keeps the explicit ACL identical to
-- production, which is this migration's only job. Actually closing the
-- function means `revoke execute ... from public`, a real behaviour change
-- that belongs in its own migration and its own decision.
revoke execute on function public.sp_crear_consignacion(p_id_proveedor uuid, p_observaciones text, p_ip inet)
  from authenticated;
