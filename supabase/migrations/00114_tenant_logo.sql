-- 00114_tenant_logo.sql
-- UP: Permitir actualizar el logo del tenant mediante `sp_set_tenant_logo`
--     y habilitar política RLS `tenant_update_own` para actualización de la fila propia.
-- DOWN:
--   drop function if exists sp_set_tenant_logo(text, inet);
--   drop policy if exists tenant_update_own on tenant;

create policy tenant_update_own on tenant for update to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create or replace function sp_set_tenant_logo(
  p_logo_url text,
  p_ip       inet default null
) returns text language plpgsql security invoker set search_path = public as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  update tenant
     set logo_url = p_logo_url,
         updated_at = now()
   where id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'tenant', v_tenant::text, 'actualizar_logo',
          jsonb_build_object('logo_url', p_logo_url), p_ip);

  return p_logo_url;
end $$;

grant execute on function sp_set_tenant_logo(text, inet) to authenticated;
