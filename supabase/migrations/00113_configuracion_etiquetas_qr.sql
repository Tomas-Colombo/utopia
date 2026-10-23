-- 00113_configuracion_etiquetas_qr.sql
-- UP: `sp_set_configuracion_qr_lado_mm` persiste la medida del lado del código
--     QR (en milímetros) por tenant en `configuracion` (`etiquetas`/`qr_lado_mm`)
--     y registra el cambio en `auditoria`.
-- DOWN:
--   NOTE: elimina la función que actualiza la configuración del lado del QR.
--   drop function if exists sp_set_configuracion_qr_lado_mm(integer, inet);

create or replace function sp_set_configuracion_qr_lado_mm(
  p_lado_mm integer,
  p_ip      inet default null
) returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if p_lado_mm is null or p_lado_mm < 15 or p_lado_mm > 100 then
    raise exception 'qr-lado-mm-invalido' using errcode = '22023';
  end if;

  insert into configuracion (id_tenant, seccion, clave, valor, tipo, updated_at)
  values (v_tenant, 'etiquetas', 'qr_lado_mm', to_jsonb(p_lado_mm), 'number', now())
  on conflict (id_tenant, seccion, clave)
  do update set valor = excluded.valor,
                tipo = excluded.tipo,
                updated_at = now();

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'configuracion', 'etiquetas:qr_lado_mm', 'actualizar',
          jsonb_build_object('qr_lado_mm', p_lado_mm), p_ip);

  return p_lado_mm;
end $$;

grant execute on function sp_set_configuracion_qr_lado_mm(integer, inet) to authenticated;
