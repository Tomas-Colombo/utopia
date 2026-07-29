-- 00009_seed_setup_functions.sql
-- UP: `sp_*` audit-wrapped mutation helpers (design §10, §14,
--     sp_<verb>_<entity> convention). Each performs its mutation and the
--     matching `auditoria` INSERT in the SAME transaction (REQ-AL-02/03/04
--     — NOT triggers). Grants execute to `authenticated`.
-- DOWN:
--   revoke execute on function sp_change_password_user(uuid, inet) from authenticated;
--   drop function if exists sp_change_password_user(uuid, inet);
--   revoke execute on function sp_update_usuario(uuid, text, uuid, inet) from authenticated;
--   drop function if exists sp_update_usuario(uuid, text, uuid, inet);

create or replace function sp_update_usuario(
  p_id_usuario uuid, p_nombre_completo text, p_id_rol uuid, p_ip inet default null
) returns void language plpgsql as $$
declare
  v_before jsonb;
  v_tenant uuid;
  v_actor  uuid := auth.uid();
begin
  select to_jsonb(u.*), u.id_tenant into v_before, v_tenant
    from usuario u where u.id_usuario = p_id_usuario;

  update usuario set nombre_completo = p_nombre_completo, id_rol = p_id_rol
   where id_usuario = p_id_usuario;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'usuario', p_id_usuario::text, 'editar',
          jsonb_build_object('before', v_before,
            'after', jsonb_build_object('nombre_completo', p_nombre_completo, 'id_rol', p_id_rol)),
          p_ip);
end $$;

-- Audit trail only for a client-side `supabase.auth.updateUser({password})`
-- password change. No password value ever appears in `cambios` — security
-- (design §10 note in this slice's apply instructions).
create or replace function sp_change_password_user(
  p_id_usuario uuid, p_ip inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid;
  v_actor  uuid := auth.uid();
begin
  select id_tenant into v_tenant from usuario where id_usuario = p_id_usuario;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'usuario', p_id_usuario::text, 'cambiar_password', '{}'::jsonb, p_ip);
end $$;

grant execute on function sp_update_usuario(uuid, text, uuid, inet) to authenticated;
grant execute on function sp_change_password_user(uuid, inet) to authenticated;
