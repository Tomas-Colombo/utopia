-- 00080_hook_seguridad_revendedora.sql
-- Slice 1b correccion: Si el usuario tiene rol Revendedora pero no esta enlazado, fallar cerrado (sin claims)

-- DOWN:
--   drop policy if exists rol_auth_admin_read on rol;
--   revoke select on public.rol from supabase_auth_admin;
--   -- Restaura la definicion de 00077
--   create or replace function public.custom_access_token_hook(event jsonb)
--     returns jsonb
--     language plpgsql
--     stable
--   as $$
--   declare
--     claims        jsonb;
--     v_tenant      uuid;
--     v_revendedora uuid;
--   begin
--     select id_tenant into v_tenant
--       from public.usuario
--      where id_usuario = (event ->> 'user_id')::uuid;
--
--     claims := event -> 'claims';
--     if v_tenant is not null then
--       claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant::text));
--     else
--       claims := claims - 'tenant_id';
--     end if;
--
--     select id_revendedora into v_revendedora
--       from public.revendedora
--      where id_usuario = (event ->> 'user_id')::uuid;
--
--     if v_revendedora is not null then
--       claims := jsonb_set(claims, '{id_revendedora}', to_jsonb(v_revendedora::text));
--     else
--       claims := claims - 'id_revendedora';
--     end if;
--
--     return jsonb_set(event, '{claims}', claims);
--   end;
--   $$;

grant select on public.rol to supabase_auth_admin;
drop policy if exists rol_auth_admin_read on rol;
create policy rol_auth_admin_read on rol for select to supabase_auth_admin using (true);

create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  stable
as $$
declare
  claims        jsonb;
  v_tenant      uuid;
  v_rol_nombre  text;
  v_revendedora uuid;
begin
  select u.id_tenant, r.nombre into v_tenant, v_rol_nombre
    from public.usuario u
    left join public.rol r on u.id_rol = r.id_rol
   where u.id_usuario = (event ->> 'user_id')::uuid;

  select id_revendedora into v_revendedora
    from public.revendedora
   where id_usuario = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  if v_rol_nombre = 'Revendedora' and v_revendedora is null then
    claims := claims - 'tenant_id' - 'id_revendedora';
  else
    if v_tenant is not null then
      claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant::text));
    else
      claims := claims - 'tenant_id';
    end if;

    if v_revendedora is not null then
      claims := jsonb_set(claims, '{id_revendedora}', to_jsonb(v_revendedora::text));
    else
      claims := claims - 'id_revendedora';
    end if;
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
