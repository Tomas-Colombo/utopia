-- 00077_revendedora_id_usuario.sql
-- Slice 1b: Enlace con tabla usuario, helper auth_revendedora_id y custom_access_token_hook.

-- DOWN:
--   drop policy if exists revendedora_auth_admin_read on revendedora;
--   revoke select on public.revendedora from supabase_auth_admin;
--   drop function if exists auth_revendedora_id();
--   alter table revendedora drop column if exists id_usuario;
--   -- OJO: Esto restaura la definición vieja (00008) del hook (sin inyectar id_revendedora)
--   create or replace function public.custom_access_token_hook(event jsonb)
--     returns jsonb
--     language plpgsql
--     stable
--   as $$
--   declare
--     claims    jsonb;
--     v_tenant  uuid;
--   begin
--     select id_tenant into v_tenant
--       from public.usuario
--      where id_usuario = (event ->> 'user_id')::uuid;
--
--     claims := event -> 'claims';
--     if v_tenant is not null then
--       claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant::text));
--     else
--       claims := claims - 'tenant_id';  -- never emit a stale/empty claim
--     end if;
--
--     return jsonb_set(event, '{claims}', claims);
--   end;
--   $$;

-- 1. Agregar columna de enlace única
alter table revendedora
  add column id_usuario uuid unique references usuario(id_usuario) on delete set null;

-- 2. Helper auth_revendedora_id()
create or replace function auth_revendedora_id() returns uuid
  language sql stable as $$
  select nullif(auth.jwt() ->> 'id_revendedora', '')::uuid;
$$;

-- 3. Actualizar el hook para inyectar id_revendedora
create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  stable
as $$
declare
  claims        jsonb;
  v_tenant      uuid;
  v_revendedora uuid;
begin
  -- Buscar tenant del usuario
  select id_tenant into v_tenant
    from public.usuario
   where id_usuario = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  if v_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant::text));
  else
    claims := claims - 'tenant_id';  -- never emit a stale/empty claim
  end if;

  -- Buscar si el usuario es una revendedora
  select id_revendedora into v_revendedora
    from public.revendedora
   where id_usuario = (event ->> 'user_id')::uuid;

  if v_revendedora is not null then
    claims := jsonb_set(claims, '{id_revendedora}', to_jsonb(v_revendedora::text));
  else
    claims := claims - 'id_revendedora';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant select on public.revendedora to supabase_auth_admin;
drop policy if exists revendedora_auth_admin_read on revendedora;
create policy revendedora_auth_admin_read on revendedora for select to supabase_auth_admin using (true);

