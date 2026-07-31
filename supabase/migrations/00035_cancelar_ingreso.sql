-- 00035_cancelar_ingreso.sql
-- UP: cancelación/reversión de ingresos.
--   * `ingreso_mercaderia.cancelado_at` + `motivo_cancelacion`.
--   * sp_cancelar_ingreso — revierte el alta:
--       - Borrador (no confirmado): elimina detalle + cabecera (no hay
--         ítems generados). Deja rastro en auditoría.
--       - Confirmado: SOLO si TODOS los ítems siguen 'disponible'. Si
--         alguno ya se movió (vendido/reservado/apartado/baja) → falla.
--         Da de baja cada ítem vía la máquina de estados (con movimiento)
--         y marca el ingreso como cancelado. Preserva historial.
--     Todo en una transacción (todo o nada).
-- DOWN:
--   revoke execute on function sp_cancelar_ingreso(uuid, text, inet) from authenticated;
--   drop function if exists sp_cancelar_ingreso(uuid, text, inet);
--   alter table ingreso_mercaderia drop column if exists motivo_cancelacion;
--   alter table ingreso_mercaderia drop column if exists cancelado_at;

alter table ingreso_mercaderia
  add column if not exists cancelado_at       timestamptz,
  add column if not exists motivo_cancelacion text;

comment on column ingreso_mercaderia.cancelado_at is
  'Timestamp de cancelación/reversión del ingreso; null = vigente.';

create or replace function sp_cancelar_ingreso(
  p_id_ingreso uuid,
  p_motivo     text default null,
  p_ip         inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_confirmado boolean;
  v_cancelado  timestamptz;
  v_movidos    integer;
  v_item       record;
  v_baja       integer := 0;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select confirmado, cancelado_at into v_confirmado, v_cancelado
    from ingreso_mercaderia
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant
   for update;
  if v_confirmado is null then
    raise exception 'ingreso-not-found' using errcode = '42704';
  end if;
  if v_cancelado is not null then
    raise exception 'ingreso-ya-cancelado' using errcode = '22023';
  end if;

  -- Borrador: no generó ítems. Se elimina cabecera + detalle.
  if not v_confirmado then
    insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
    values (v_tenant, v_actor, 'ingreso_mercaderia', p_id_ingreso::text, 'cancelar-borrador',
            jsonb_build_object('motivo', p_motivo), p_ip);
    delete from ingreso_mercaderia_detalle
     where id_ingreso = p_id_ingreso and id_tenant = v_tenant;
    delete from ingreso_mercaderia
     where id_ingreso = p_id_ingreso and id_tenant = v_tenant;
    return jsonb_build_object('modo', 'borrador', 'items_baja', 0);
  end if;

  -- Confirmado: solo si TODOS los ítems siguen 'disponible'.
  select count(*) into v_movidos
    from item_producto
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant
     and estado_item <> 'disponible';
  if v_movidos > 0 then
    raise exception 'ingreso-con-items-movidos: %', v_movidos using errcode = '22023';
  end if;

  -- Baja de cada ítem vía la máquina de estados (deja movimiento_item).
  for v_item in
    select id_item from item_producto
     where id_ingreso = p_id_ingreso and id_tenant = v_tenant
       and estado_item = 'disponible'
  loop
    perform sp_transicion_item_producto(
      v_item.id_item, 'baja', 'baja', p_id_ingreso, 'ingreso', p_ip
    );
    v_baja := v_baja + 1;
  end loop;

  update ingreso_mercaderia
     set cancelado_at = now(), motivo_cancelacion = p_motivo
   where id_ingreso = p_id_ingreso;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'ingreso_mercaderia', p_id_ingreso::text, 'cancelar',
          jsonb_build_object('items_baja', v_baja, 'motivo', p_motivo), p_ip);

  return jsonb_build_object('modo', 'confirmado', 'items_baja', v_baja);
end $$;

grant execute on function sp_cancelar_ingreso(uuid, text, inet) to authenticated;
