-- 00112_reactivar_acceso_revendedora.sql
-- Volver a dar acceso a una revendedora a la que se le quitó.
--
-- Quitar el acceso desvincula a la revendedora y deja su usuario 'inactivo',
-- pero el usuario de Supabase Auth (y su email) sigue existiendo. Al volver a
-- darle acceso, createUser rechazaba el email y la pantalla decía que ya
-- existía. Este SP reutiliza ese usuario: lo reactiva y lo vuelve a enlazar en
-- una sola transacción. INVOKER: lo llama el DAL con el cliente service-role.
--
-- UP:
--   1. sp_reactivar_acceso_revendedora(p_id_revendedora, p_id_usuario,
--      p_id_tenant, p_nombre, p_id_rol).
--
-- DOWN:
-- drop function if exists sp_reactivar_acceso_revendedora(uuid, uuid, uuid, text, uuid);

create or replace function sp_reactivar_acceso_revendedora(
  p_id_revendedora uuid,
  p_id_usuario uuid,
  p_id_tenant uuid,
  p_nombre text,
  p_id_rol uuid
) returns void language plpgsql security invoker set search_path = public as $$
begin
  -- Solo un usuario dado de baja, del mismo tenant y que no esté enlazado a
  -- otra revendedora: un empleado activo con ese email no se pisa.
  update usuario
     set estado_usuario = 'invitado',
         id_rol = p_id_rol,
         nombre_completo = p_nombre
   where id_usuario = p_id_usuario
     and id_tenant = p_id_tenant
     and estado_usuario = 'inactivo'
     and not exists (select 1 from revendedora r where r.id_usuario = p_id_usuario);
  if not found then
    raise exception 'email-duplicado' using errcode = 'P0001';
  end if;

  update revendedora
     set id_usuario = p_id_usuario
   where id_revendedora = p_id_revendedora
     and id_tenant = p_id_tenant
     and id_usuario is null;
  if not found then
    raise exception 'acceso-duplicado' using errcode = 'P0001';
  end if;
end;
$$;
