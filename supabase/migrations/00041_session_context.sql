-- 00041_session_context.sql
-- UP: colapsa los 3 queries del gate de cada request en UNO.
--
-- Toda request bajo `app/(app)/**` encadenaba:
--   1. `usuario` + join `rol`        (verifySession)
--   2. `tenant` por subdominio       (verifyTenantMatch)
--   3. `tenant_modulo` + join `modulo` (requireModuleRole → isModuloHabilitado)
-- Tres round-trips SECUENCIALES — los layouts anidados no los pueden
-- paralelizar. `sp_session_context` devuelve las tres cosas de una.
--
-- SECURITY INVOKER (default): la RLS de usuario/rol/tenant/tenant_modulo
-- sigue aplicando exactamente igual que en los queries que reemplaza.
-- El chequeo de tenant NO se debilita: `subdominio_ok` es true solo si
-- existe un tenant con ESE subdominio Y cuyo id coincide con el
-- `tenant_id` del JWT — la misma condición que comparaba el TS.
-- DOWN: drops al final del archivo.

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

  return jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant,
    'rol_id', coalesce(v_rol_id, v_usuario_rol),
    'rol_nombre', v_rol_nombre,
    'permisos', coalesce(v_permisos, '{}'::jsonb),
    'subdominio_ok', v_sub_ok,
    'modulos_habilitados', v_modulos
  );
end $$;

grant execute on function sp_session_context(text) to authenticated;

-- DOWN block (idempotent drops):
--   revoke execute on function sp_session_context(text) from authenticated;
--   drop function if exists sp_session_context(text);
