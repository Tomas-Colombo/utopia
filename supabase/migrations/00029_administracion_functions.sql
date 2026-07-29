-- 00029_administracion_functions.sql
-- UP: sp_* para ABM del módulo Administración (Etapa 9 cierre).
--   - sp_create_rol, sp_update_rol_permisos, sp_toggle_rol_activo
--     (rol no tiene estado activo; usamos "eliminar" real solo si no
--     tiene usuarios asignados — sino se bloquea).
--   - sp_toggle_tenant_modulo (habilita/deshabilita módulos del tenant).
--   - sp_toggle_usuario_activo (usuario.estado_usuario: activo/inactivo).
--   - sp_asignar_rol_usuario ya existe implícito en sp_update_usuario (00009).
--
--   Auditoria queries se hacen directamente desde el DAL con SELECT.
--
-- DOWN:
--   drop function if exists sp_toggle_usuario_activo(uuid, usuario_estado, inet);
--   drop function if exists sp_toggle_tenant_modulo(uuid, boolean, inet);
--   drop function if exists sp_delete_rol(uuid, inet);
--   drop function if exists sp_update_rol_permisos(uuid, text, jsonb, inet);
--   drop function if exists sp_create_rol(text, jsonb, inet);

create or replace function sp_create_rol(
  p_nombre    text,
  p_permisos  jsonb default '{}'::jsonb,
  p_ip        inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_nombre is null or trim(p_nombre) = '' then
    raise exception 'nombre-requerido' using errcode = '22023';
  end if;

  insert into rol(id_tenant, nombre, permisos)
  values (v_tenant, trim(p_nombre), coalesce(p_permisos, '{}'::jsonb))
  returning id_rol into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'rol', v_id::text, 'crear',
          jsonb_build_object('nombre', p_nombre, 'permisos', p_permisos), p_ip);
  return v_id;
end $$;

create or replace function sp_update_rol_permisos(
  p_id_rol   uuid,
  p_nombre   text,
  p_permisos jsonb,
  p_ip       inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_prev   jsonb;
  v_prev_nombre text;
begin
  select to_jsonb(permisos), nombre into v_prev, v_prev_nombre
    from rol where id_rol = p_id_rol and id_tenant = v_tenant
    for update;
  if not found then
    raise exception 'rol-not-found' using errcode = '42704';
  end if;

  update rol
     set nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
         permisos = coalesce(p_permisos, permisos)
   where id_rol = p_id_rol;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'rol', p_id_rol::text, 'editar',
          jsonb_build_object('nombre_anterior', v_prev_nombre,
                             'nombre_nuevo', p_nombre,
                             'permisos_anteriores', v_prev,
                             'permisos_nuevos', p_permisos),
          p_ip);
end $$;

-- Borra rol solo si nadie lo usa. Sino falla con 'rol-en-uso'.
create or replace function sp_delete_rol(
  p_id_rol uuid,
  p_ip     inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_count  integer;
  v_nombre text;
begin
  select nombre into v_nombre from rol
    where id_rol = p_id_rol and id_tenant = v_tenant for update;
  if not found then
    raise exception 'rol-not-found' using errcode = '42704';
  end if;

  select count(*) into v_count from usuario
   where id_rol = p_id_rol and id_tenant = v_tenant;
  if v_count > 0 then
    raise exception 'rol-en-uso: % usuarios asignados', v_count using errcode = '22023';
  end if;

  delete from rol where id_rol = p_id_rol;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'rol', p_id_rol::text, 'eliminar',
          jsonb_build_object('nombre', v_nombre), p_ip);
end $$;

create or replace function sp_toggle_tenant_modulo(
  p_id_modulo   uuid,
  p_habilitado  boolean,
  p_ip          inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- upsert: si no existía la fila la crea; si existía la actualiza.
  insert into tenant_modulo(id_tenant, id_modulo, habilitado)
  values (v_tenant, p_id_modulo, p_habilitado)
  on conflict (id_tenant, id_modulo)
  do update set habilitado = excluded.habilitado;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'tenant_modulo', p_id_modulo::text,
          case when p_habilitado then 'habilitar' else 'deshabilitar' end,
          jsonb_build_object('habilitado', p_habilitado), p_ip);
end $$;

create or replace function sp_toggle_usuario_activo(
  p_id_usuario uuid,
  p_estado     usuario_estado,
  p_ip         inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_prev   usuario_estado;
begin
  select estado_usuario into v_prev from usuario
    where id_usuario = p_id_usuario and id_tenant = v_tenant for update;
  if not found then
    raise exception 'usuario-not-found' using errcode = '42704';
  end if;

  update usuario set estado_usuario = p_estado
   where id_usuario = p_id_usuario;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'usuario', p_id_usuario::text, 'cambiar_estado',
          jsonb_build_object('estado_anterior', v_prev, 'estado_nuevo', p_estado), p_ip);
end $$;

grant execute on function sp_create_rol(text, jsonb, inet) to authenticated;
grant execute on function sp_update_rol_permisos(uuid, text, jsonb, inet) to authenticated;
grant execute on function sp_delete_rol(uuid, inet) to authenticated;
grant execute on function sp_toggle_tenant_modulo(uuid, boolean, inet) to authenticated;
grant execute on function sp_toggle_usuario_activo(uuid, usuario_estado, inet) to authenticated;
