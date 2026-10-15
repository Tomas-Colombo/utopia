-- 00109_marca_tenant.sql
-- UP: `sp_session_context` devuelve también la marca del tenant
--     (`nombre_comercial` + `logo_url`) para que el shell muestre el logo de
--     cada cliente sin una query extra por request. Crea además el bucket
--     público `tenant-logos`: lectura pública, escritura sólo service-role
--     (no hay policies de escritura sobre storage.objects para este bucket).
--     Copiada de la última definición (00041); SECURITY INVOKER, igual que antes.
-- DOWN:
--   restaurar la definición de 00041_session_context.sql
--   (create or replace function sp_session_context ...).
--   delete from storage.buckets where id = 'tenant-logos';  -- vacío primero

create or replace function sp_session_context(
  p_subdominio text default null
) returns jsonb language plpgsql stable as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_uid        uuid := auth.uid();
  v_usuario_rol uuid;
  v_rol_id     uuid;
  v_rol_nombre text;
  v_permisos   jsonb;
  v_sub_ok     boolean := false;
  v_modulos    jsonb;
  v_marca      jsonb;
begin
  if v_uid is null or v_tenant is null then
    -- Sesión inválida o JWT sin claim `tenant_id`. El caller decide:
    -- hoy degrada a "sesión sin rol" y el guard falla cerrado después.
    return jsonb_build_object('ok', false, 'reason', 'no-session');
  end if;

  -- Rol + permisos. Si la fila de `usuario` no existe o el join a `rol`
  -- vuelve vacío (RLS), NO es un error: la sesión es válida pero sin
  -- privilegios, y el guard falla cerrado más adelante.
  select u.id_rol, r.id_rol, r.nombre, r.permisos
    into v_usuario_rol, v_rol_id, v_rol_nombre, v_permisos
    from usuario u
    left join rol r on r.id_rol = u.id_rol
   where u.id_usuario = v_uid;

  -- Tenant match (design §7, REQ-TR-05/06). El header del proxy es solo
  -- una pista; acá se confirma contra el tenant del JWT.
  if p_subdominio is not null then
    select exists (
      select 1
        from tenant t
       where t.subdominio = p_subdominio
         and t.id_tenant  = v_tenant
    ) into v_sub_ok;
  end if;

  -- Módulos habilitados del tenant, como array de códigos. El guard
  -- resuelve `requireModuleRole` en memoria contra esto.
  select coalesce(jsonb_agg(m.codigo order by m.codigo), '[]'::jsonb)
    into v_modulos
    from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
   where tm.id_tenant = v_tenant
     and tm.habilitado;

  -- Marca del tenant (logo + nombre) para el shell. Si la RLS no deja leer
  -- la fila (revendedoras), queda null y el shell cae al nombre en texto.
  select jsonb_build_object('nombre', t.nombre_comercial, 'logo_url', t.logo_url)
    into v_marca
    from tenant t
   where t.id_tenant = v_tenant;

  return jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant,
    'rol_id', coalesce(v_rol_id, v_usuario_rol),
    'rol_nombre', v_rol_nombre,
    'permisos', coalesce(v_permisos, '{}'::jsonb),
    'subdominio_ok', v_sub_ok,
    'modulos_habilitados', v_modulos,
    'marca', v_marca
  );
end $$;

grant execute on function sp_session_context(text) to authenticated;

-- Storage está apagado en supabase/config.toml (local y CI): ahí `storage.buckets`
-- no existe. En el proyecto hosteado sí, y ahí se crea el bucket.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('tenant-logos', 'tenant-logos', true)
    on conflict (id) do nothing;
  end if;
end $$;
