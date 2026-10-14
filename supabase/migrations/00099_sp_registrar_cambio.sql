-- 00099_sp_registrar_cambio.sql
-- sp_registrar_cambio (REQ-RV-DB-07, DR-5, DR-7)
--
-- DOWN:
-- drop function if exists sp_registrar_cambio(uuid, uuid, text, medio_pago, uuid, inet);

create or replace function sp_registrar_cambio(
  p_id_detalle_original   uuid,
  p_id_item_entregado     uuid,
  p_motivo                text default null,
  p_medio_cobro           medio_pago default null,
  p_id_cuenta_destino     uuid default null,
  p_ip                    inet default null
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_tenant                  uuid := auth_tenant_id();
  v_actor                   uuid := auth.uid();
  v_id_venta                uuid;
  v_id_item_original        uuid;
  v_id_prod_original        uuid;
  v_precio_original         numeric(14,2);
  v_costo_original          numeric(14,2);
  v_porcentaje_preview_orig numeric(5,2);
  v_id_rendicion            uuid;
  v_id_liquidacion          uuid;
  v_canal                   canal_venta;
  v_id_revendedora          uuid;
  v_estado_venta            estado_venta;
  v_estado_item_orig        estado_item;
  v_estado_item_nuevo       estado_item;
  v_id_prod_nuevo           uuid;
  v_costo_nuevo             numeric(14,2);
  v_tipo_ingreso_nuevo      tipo_ingreso;
  v_precio_nuevo            numeric(14,2);
  v_diferencia              numeric(14,2);
  v_id_det_nuevo            uuid;
  v_id_cambio               uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  -- 1. Leer y bloquear detalle_venta y venta originales
  select
    dv.id_venta,
    dv.id_item,
    dv.id_producto,
    dv.precio_venta,
    dv.costo_snapshot,
    dv.porcentaje_comision_preview,
    dv.id_rendicion,
    dv.id_liquidacion,
    v.canal,
    v.id_revendedora,
    v.estado_venta
  into
    v_id_venta,
    v_id_item_original,
    v_id_prod_original,
    v_precio_original,
    v_costo_original,
    v_porcentaje_preview_orig,
    v_id_rendicion,
    v_id_liquidacion,
    v_canal,
    v_id_revendedora,
    v_estado_venta
  from detalle_venta dv
  join venta v on v.id_venta = dv.id_venta
  where dv.id_detalle_venta = p_id_detalle_original
    and dv.id_tenant = v_tenant
    and v.id_tenant = v_tenant
  for update of dv, v;

  if v_id_venta is null then
    raise exception 'detalle-venta-not-found' using errcode = '42704';
  end if;

  -- 2. Guardas de estado de venta y liquidación
  if v_estado_venta = 'anulada' then
    raise exception 'venta-anulada' using errcode = '22023';
  end if;

  if v_id_liquidacion is not null then
    raise exception 'venta-liquidada' using errcode = '22023';
  end if;

  if v_id_rendicion is not null then
    raise exception 'detalle-ya-rendido' using errcode = '22023';
  end if;

  if exists (select 1 from devolucion_venta where id_detalle_venta = p_id_detalle_original) then
    raise exception 'detalle-ya-devuelto' using errcode = '22023';
  end if;

  if exists (select 1 from cambio_venta where id_detalle_original = p_id_detalle_original) then
    raise exception 'detalle-ya-cambiado' using errcode = '22023';
  end if;

  if exists (
    select 1 from cuota_financiada
     where id_venta = v_id_venta and estado in ('pendiente', 'parcial')
  ) then
    raise exception 'cambio-venta-con-cuotas-abiertas' using errcode = '22023';
  end if;

  -- 3. Guardas de módulo si canal revendedora
  if v_canal = 'revendedora' then
    if not exists (
      select 1 from tenant_modulo tm
      join modulo m on m.id_modulo = tm.id_modulo
      where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
    ) then
      raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
    end if;
  end if;

  -- 4. Bloquear y verificar estado del ítem original
  select estado_item into v_estado_item_orig
  from item_producto
  where id_item = v_id_item_original and id_tenant = v_tenant
  for update;

  if v_estado_item_orig <> 'vendido' then
    raise exception 'item-no-esta-vendido: estado=%', v_estado_item_orig using errcode = '22023';
  end if;

  -- 5. Bloquear y verificar ítem entregado
  select
    ip.estado_item,
    ip.id_producto,
    ip.costo_ingreso,
    ip.tipo_ingreso,
    p.precio_venta
  into
    v_estado_item_nuevo,
    v_id_prod_nuevo,
    v_costo_nuevo,
    v_tipo_ingreso_nuevo,
    v_precio_nuevo
  from item_producto ip
  join producto p on p.id_producto = ip.id_producto
  where ip.id_item = p_id_item_entregado
    and ip.id_tenant = v_tenant
    and p.id_tenant = v_tenant
  for update of ip;

  if v_estado_item_nuevo is null then
    raise exception 'item-not-found' using errcode = '42704';
  end if;

  if v_canal = 'local' then
    if v_estado_item_nuevo <> 'disponible' then
      raise exception 'item-no-disponible: estado=%', v_estado_item_nuevo using errcode = '22023';
    end if;
  elsif v_canal = 'revendedora' then
    if v_estado_item_nuevo <> 'en_revendedora' then
      raise exception 'item-no-disponible: estado=%', v_estado_item_nuevo using errcode = '22023';
    end if;

    if not exists (
      select 1
      from consignacion_revendedora_detalle crd
      join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
      where cr.id_tenant = v_tenant
        and cr.id_revendedora = v_id_revendedora
        and cr.confirmada = true
        and cr.estado = 'abierta'
        and crd.id_item = p_id_item_entregado
        and crd.estado_detalle = 'en_poder'
    ) then
      raise exception 'item-no-en-poder-revendedora' using errcode = '22023';
    end if;
  end if;

  -- 6. Calcular diferencia
  v_diferencia := v_precio_nuevo - v_precio_original;

  if v_diferencia < 0 then
    raise exception 'diferencia-negativa-no-permitida' using errcode = '22023';
  end if;

  -- 7. Registrar cobro de diferencia si corresponde
  if v_diferencia > 0 then
    if v_canal = 'local' then
      if p_medio_cobro is null or p_id_cuenta_destino is null then
        raise exception 'diferencia-requiere-medio-y-cuenta' using errcode = '22023';
      end if;

      if not exists (
        select 1 from cuenta_destino
        where id_tenant = v_tenant and id_cuenta_destino = p_id_cuenta_destino
      ) then
        raise exception 'cuenta-destino-invalida' using errcode = '22023';
      end if;

      insert into pago_venta (
        id_tenant, id_venta, id_cuenta_destino, medio, monto, created_at
      ) values (
        v_tenant, v_id_venta, p_id_cuenta_destino, p_medio_cobro, v_diferencia, now()
      );
    elsif v_canal = 'revendedora' then
      insert into pago_venta (
        id_tenant, id_venta, id_cuenta_destino, medio, monto, created_at
      ) values (
        v_tenant, v_id_venta, null, 'cuenta_revendedora', v_diferencia, now()
      );
    end if;
  end if;

  -- 8. Transicionar ítems usando is_transicion_item_valida
  if v_canal = 'revendedora' then
    if not is_transicion_item_valida('vendido', 'en_revendedora') then
      raise exception 'invalid-transition' using errcode = '22023';
    end if;
    perform sp_transicion_item_producto(
      v_id_item_original, 'en_revendedora', 'ajuste', v_id_venta, 'cambio_producto', p_ip
    );
    update consignacion_revendedora_detalle
       set estado_detalle = 'en_poder'
     where id_item = v_id_item_original and estado_detalle = 'vendido';

    if not is_transicion_item_valida('en_revendedora', 'vendido') then
      raise exception 'invalid-transition' using errcode = '22023';
    end if;
    perform sp_transicion_item_producto(
      p_id_item_entregado, 'vendido', 'venta', v_id_venta, 'cambio_producto', p_ip
    );
    update consignacion_revendedora_detalle
       set estado_detalle = 'vendido'
     where id_item = p_id_item_entregado and estado_detalle = 'en_poder';
  else
    if not is_transicion_item_valida('vendido', 'disponible') then
      raise exception 'invalid-transition' using errcode = '22023';
    end if;
    perform sp_transicion_item_producto(
      v_id_item_original, 'disponible', 'ajuste', v_id_venta, 'cambio_producto', p_ip
    );

    if not is_transicion_item_valida('disponible', 'vendido') then
      raise exception 'invalid-transition' using errcode = '22023';
    end if;
    perform sp_transicion_item_producto(
      p_id_item_entregado, 'vendido', 'venta', v_id_venta, 'cambio_producto', p_ip
    );
  end if;

  -- 9. Marcar línea original excluida de liquidación
  update detalle_venta
     set excluida_liquidacion = true
   where id_detalle_venta = p_id_detalle_original;

  -- 10. Crear nueva línea en detalle_venta para el ítem entregado
  -- precio_venta se congela en v_precio_original (base de liquidación original, DR-5)
  insert into detalle_venta (
    id_tenant, id_venta, id_item, id_producto,
    precio_venta, costo_snapshot, monto_proveedor, monto_gasto,
    monto_ganancia, tipo_ingreso_snapshot, desglose_reglas,
    id_rendicion, excluida_rendicion, porcentaje_comision_preview,
    monto_comision, id_liquidacion, excluida_liquidacion
  ) values (
    v_tenant, v_id_venta, p_id_item_entregado, v_id_prod_nuevo,
    v_precio_original, v_costo_nuevo, 0, 0,
    v_precio_original - v_costo_nuevo, v_tipo_ingreso_nuevo, '{}'::jsonb,
    null, false, v_porcentaje_preview_orig,
    0, null, false
  ) returning id_detalle_venta into v_id_det_nuevo;

  -- 11. Registrar en cambio_venta
  insert into cambio_venta (
    id_tenant, id_venta_original, id_detalle_original, id_item_entregado,
    diferencia, motivo, origen, id_usuario_alta
  ) values (
    v_tenant, v_id_venta, p_id_detalle_original, p_id_item_entregado,
    v_diferencia, p_motivo, v_canal, v_actor
  ) returning id_cambio into v_id_cambio;

  -- 12. Auditoría
  insert into auditoria (
    id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip
  ) values (
    v_tenant, v_actor, 'cambio_venta', v_id_cambio::text, 'registrar_cambio',
    jsonb_build_object(
      'id_venta', v_id_venta,
      'id_detalle_original', p_id_detalle_original,
      'id_item_entregado', p_id_item_entregado,
      'id_detalle_nuevo', v_id_det_nuevo,
      'diferencia', v_diferencia,
      'motivo', p_motivo
    ),
    p_ip
  );

  return jsonb_build_object(
    'id_cambio', v_id_cambio,
    'id_detalle_nuevo', v_id_det_nuevo,
    'diferencia', v_diferencia
  );
end;
$$;

grant execute on function sp_registrar_cambio(uuid, uuid, text, medio_pago, uuid, inet) to authenticated;
