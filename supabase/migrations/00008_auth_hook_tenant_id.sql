-- 00008_auth_hook_tenant_id.sql
-- UP: `custom_access_token_hook` — sets the JWT `tenant_id` claim from
--     `public.usuario` on every token issue/refresh (design §5, decision 4,
--     REQ-AUTH-02/03). Grants execute to `supabase_auth_admin` only.
-- DOWN:
--   revoke execute on function public.custom_access_token_hook from supabase_auth_admin;
--   drop function if exists public.custom_access_token_hook(jsonb);
--
-- MANUAL STEP REQUIRED AFTER APPLYING THIS MIGRATION: this function must be
-- registered as the active Custom Access Token hook in each Supabase
-- project's dashboard (Auth → Hooks → Custom Access Token → Function →
-- `public.custom_access_token_hook`). See supabase/README.md.

create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  stable
as $$
declare
  claims    jsonb;
  v_tenant  uuid;
begin
  select id_tenant into v_tenant
    from public.usuario
   where id_usuario = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  if v_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant::text));
  else
    claims := claims - 'tenant_id';  -- never emit a stale/empty claim
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
