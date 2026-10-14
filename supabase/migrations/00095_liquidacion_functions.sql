-- 00095_liquidacion_functions.sql
-- Slice 7a: Funciones de liquidación de revendedoras y actualización financiera (REQ-RV-DB-06, DR-2, DR-3, DR-14).
--
-- DOWN:
-- drop function if exists rf_cuenta_corriente_revendedora(uuid);
-- drop function if exists sp_marcar_liquidacion_pagada(uuid, uuid, numeric, text, text, timestamptz, inet);
-- drop function if exists sp_reincluir_detalle_liquidacion(uuid, inet);
-- drop function if exists sp_excluir_detalle_liquidacion(uuid, text, inet);
-- drop function if exists sp_generar_liquidacion(uuid, date, date, text, inet);
-- drop function if exists preview_liquidacion(uuid, date, date);
--
-- drop view if exists v_linea_venta cascade;
-- create or replace view v_linea_venta with (security_invoker = true) as
-- select
--   v.id_tenant,
--   v.id_venta,
--   dv.id_producto,
--   v.fecha as fecha_venta,
--   v.estado_venta,
--   v.fecha_anulacion,
--   p.precio_venta as precio_venta,
--   dv.costo_snapshot as costo,
--   dv.monto_ganancia as margen,
--   dv.tipo_ingreso_snapshot,
--   dv.id_proveedor,
--   dv.monto_proveedor,
--   dv.id_rendicion,
--   dv.excluida_rendicion,
--   (dev.id_devolucion is not null) as devuelta,
--   dev.fecha as fecha_devolucion,
--   dev.costo_recuperado,
--   case
--     when v.estado_venta = 'registrada' and dev.id_devolucion is null and dv.id_liquidacion is not null
--       then dv.monto_comision
--     else 0::numeric(14, 2)
--   end as comision,
--   case
--     when v.estado_venta = 'registrada'
--      and dev.id_devolucion is null
--      and dv.id_liquidacion is null
--      and v.canal = 'revendedora'
--      and not dv.excluida_liquidacion
--       then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2)
--     else 0::numeric(14, 2)
--   end as comision_estimada
-- from detalle_venta dv
-- join venta v on v.id_venta = dv.id_venta
-- join producto p on p.id_producto = dv.id_producto
-- left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta;
--
-- create or replace function rf_finanzas_resultados(p_desde date, p_hasta date)
-- returns table (
--   ventas_brutas numeric,
--   anulaciones numeric,
--   devoluciones numeric,
--   ventas_netas numeric,
--   costo_mercaderia numeric,
--   ganancia_sobre_ventas numeric,
--   costo_cobro numeric,
--   incobrables numeric,
--   bajas_inventario numeric,
--   ganancia_despues_de_costos numeric,
--   gastos numeric,
--   comision_liquidada numeric,
--   comision_pendiente_estimada numeric,
--   ganancia_final numeric,
--   cantidad_ventas bigint,
--   ticket_promedio numeric
-- ) language plpgsql security invoker as $$
-- declare
--   v_tenant_id uuid;
--   v_ventas_brutas numeric := 0;
--   v_anulaciones numeric := 0;
--   v_devoluciones numeric := 0;
--   v_costo_mercaderia numeric := 0;
--   v_costo_cobro numeric := 0;
--   v_incobrables numeric := 0;
--   v_bajas_inventario numeric := 0;
--   v_gastos numeric := 0;
--   v_comision_liquidada numeric := 0;
--   v_comision_pendiente_estimada numeric := 0;
--   v_cantidad_ventas bigint := 0;
--   v_zona text;
-- begin
--   v_tenant_id := auth_tenant_id();
--   select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;
--   select coalesce(sum(v.total), 0) into v_ventas_brutas from venta v where v.id_tenant = v_tenant_id and (v.fecha at time zone v_zona)::date >= p_desde and (v.fecha at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(v.total), 0) into v_anulaciones from venta v where v.id_tenant = v_tenant_id and (v.fecha_anulacion at time zone v_zona)::date >= p_desde and (v.fecha_anulacion at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(dv.monto), 0) into v_devoluciones from devolucion_venta dv where dv.id_tenant = v_tenant_id and (dv.fecha at time zone v_zona)::date >= p_desde and (dv.fecha at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(vl.costo), 0) into v_costo_mercaderia from v_linea_venta vl where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;
--   declare
--     v_costo_anuladas numeric := 0;
--     v_costo_devueltas numeric := 0;
--   begin
--     select coalesce(sum(vl.costo), 0) into v_costo_anuladas from v_linea_venta vl where vl.id_tenant = v_tenant_id and (vl.fecha_anulacion at time zone v_zona)::date >= p_desde and (vl.fecha_anulacion at time zone v_zona)::date <= p_hasta;
--     select coalesce(sum(vl.costo_recuperado), 0) into v_costo_devueltas from v_linea_venta vl where vl.id_tenant = v_tenant_id and (vl.fecha_devolucion at time zone v_zona)::date >= p_desde and (vl.fecha_devolucion at time zone v_zona)::date <= p_hasta;
--     v_costo_mercaderia := v_costo_mercaderia - v_costo_anuladas - v_costo_devueltas;
--   end;
--   select coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro from pago_venta pv where pv.id_tenant = v_tenant_id and pv.medio <> 'cuenta_revendedora' and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(cf.monto - cf.monto_pagado), 0) into v_incobrables from cuota_financiada cf where cf.id_tenant = v_tenant_id and cf.estado = 'incobrable' and (cf.fecha_incobrable at time zone v_zona)::date >= p_desde and (cf.fecha_incobrable at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(ip.costo_ingreso), 0) into v_bajas_inventario from item_producto ip where ip.id_tenant = v_tenant_id and ip.estado_item = 'baja' and (ip.updated_at at time zone v_zona)::date >= p_desde and (ip.updated_at at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(gn.monto), 0) into v_gastos from gasto_negocio gn where gn.id_tenant = v_tenant_id and (gn.fecha at time zone v_zona)::date >= p_desde and (gn.fecha at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(vl.comision), 0) into v_comision_liquidada from v_linea_venta vl where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(vl.comision_estimada), 0) into v_comision_pendiente_estimada from v_linea_venta vl where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;
--   if not exists (select 1 from tenant_modulo tm join modulo m on m.id_modulo = tm.id_modulo where tm.id_tenant = v_tenant_id and m.codigo = 'revendedoras' and tm.habilitado = true) then
--     v_comision_liquidada := 0; v_comision_pendiente_estimada := 0;
--   end if;
--   select count(*) into v_cantidad_ventas from venta v where v.id_tenant = v_tenant_id and v.estado_venta = 'registrada' and (v.fecha at time zone v_zona)::date >= p_desde and (v.fecha at time zone v_zona)::date <= p_hasta;
--   return query select v_ventas_brutas, v_anulaciones, v_devoluciones, v_ventas_brutas - v_anulaciones - v_devoluciones as ventas_netas, v_costo_mercaderia, (v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia as ganancia_sobre_ventas, v_costo_cobro, v_incobrables, v_bajas_inventario, ((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario as ganancia_despues_de_costos, v_gastos, v_comision_liquidada, v_comision_pendiente_estimada, (((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario) - v_gastos - v_comision_liquidada as ganancia_final, v_cantidad_ventas, case when v_cantidad_ventas > 0 then (v_ventas_brutas - v_anulaciones - v_devoluciones) / v_cantidad_ventas else null::numeric end as ticket_promedio;
-- end;
-- $$;
--
-- create or replace function rf_finanzas_flujo(p_desde date, p_hasta date)
-- returns table (
--   cobrado numeric, devuelto_clientes numeric, costo_cobro numeric, neto_cobros numeric,
--   compras_mercaderia numeric, pagos_proveedores numeric, gastos numeric, flujo_neto numeric, por_acreditar jsonb
-- ) language plpgsql security invoker as $$
-- declare
--   v_tenant_id uuid; v_cobrado numeric := 0; v_devuelto_clientes numeric := 0; v_costo_cobro numeric := 0;
--   v_compras_mercaderia numeric := 0; v_pagos_proveedores numeric := 0; v_gastos numeric := 0; v_por_acreditar jsonb; v_zona text;
-- begin
--   v_tenant_id := auth_tenant_id(); select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;
--   select coalesce(sum(pv.monto), 0) into v_cobrado from pago_venta pv where pv.id_tenant = v_tenant_id and pv.medio <> 'cuenta_revendedora' and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(rc.monto), 0) into v_devuelto_clientes from reintegro_cliente rc where rc.id_tenant = v_tenant_id and rc.medio <> 'cuenta_revendedora' and (rc.fecha at time zone v_zona)::date >= p_desde and (rc.fecha at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro from pago_venta pv where pv.id_tenant = v_tenant_id and pv.medio <> 'cuenta_revendedora' and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(cantidad * costo_unitario), 0) into v_compras_mercaderia from ingreso_mercaderia_detalle d join ingreso_mercaderia i on i.id_ingreso = d.id_ingreso where i.id_tenant = v_tenant_id and i.tipo_ingreso = 'compra' and i.confirmado = true and i.cancelado_at is null and (i.fecha at time zone v_zona)::date >= p_desde and (i.fecha at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(rp.monto_total), 0) into v_pagos_proveedores from rendicion_proveedor rp where rp.id_tenant = v_tenant_id and rp.estado = 'pagada' and (rp.fecha_pago at time zone v_zona)::date >= p_desde and (rp.fecha_pago at time zone v_zona)::date <= p_hasta;
--   select coalesce(sum(gn.monto), 0) into v_gastos from gasto_negocio gn where gn.id_tenant = v_tenant_id and (gn.fecha at time zone v_zona)::date >= p_desde and (gn.fecha at time zone v_zona)::date <= p_hasta;
--   select jsonb_object_agg(t.tipo, coalesce(t.total, 0)) into v_por_acreditar from (select cd.tipo, sum(p.neto_acreditado) as total from pago_venta p join cuenta_destino cd on cd.id_cuenta_destino = p.id_cuenta_destino where p.id_tenant = v_tenant_id and p.medio <> 'cuenta_revendedora' and (p.fecha_acreditacion at time zone v_zona)::date > (now() at time zone v_zona)::date group by cd.tipo) t;
--   if v_por_acreditar is null then v_por_acreditar := '{}'::jsonb; end if;
--   return query select v_cobrado, v_devuelto_clientes, v_costo_cobro, v_cobrado - v_devuelto_clientes - v_costo_cobro as neto_cobros, v_compras_mercaderia, v_pagos_proveedores, v_gastos, (v_cobrado - v_devuelto_clientes - v_costo_cobro) - v_compras_mercaderia - v_pagos_proveedores - v_gastos as flujo_neto, v_por_acreditar;
-- end;
-- $$;
--
-- create or replace function rf_finanzas_posicion()
-- returns table (
--   capital_propio numeric, mercaderia_terceros numeric, devueltos_clientes numeric,
--   valor_venta_potencial numeric, productos_sin_precio bigint, por_cobrar jsonb, deuda_proveedores numeric
-- ) language plpgsql security invoker as $$
-- declare
--   v_tenant_id uuid; v_capital_propio numeric := 0; v_mercaderia_terceros numeric := 0; v_devueltos_clientes numeric := 0;
--   v_valor_venta_potencial numeric := 0; v_productos_sin_precio bigint := 0; v_deuda_proveedores numeric := 0; v_por_cobrar jsonb; v_zona text;
-- begin
--   v_tenant_id := auth_tenant_id(); select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;
--   select coalesce(sum(costo_ingreso), 0) into v_capital_propio from item_producto where id_tenant = v_tenant_id and tipo_ingreso = 'compra' and estado_item in ('disponible', 'reservado', 'en_revendedora');
--   select coalesce(sum(costo_ingreso), 0) into v_mercaderia_terceros from item_producto where id_tenant = v_tenant_id and tipo_ingreso = 'consignacion' and estado_item in ('disponible', 'reservado', 'en_revendedora');
--   select coalesce(sum(costo_ingreso), 0) into v_devueltos_clientes from item_producto where id_tenant = v_tenant_id and estado_item = 'devuelto_cliente';
--   select coalesce(sum(p.precio_venta), 0) into v_valor_venta_potencial from item_producto ip join producto p on p.id_producto = ip.id_producto where ip.id_tenant = v_tenant_id and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');
--   select count(*) into v_productos_sin_precio from producto where id_tenant = v_tenant_id and precio_venta = 0 and activo = true;
--   declare
--     v_a_cobrar numeric := 0; v_vence_este_mes numeric := 0; v_vencido numeric := 0; v_cuotas_vencidas bigint := 0; v_clientes_con_deuda bigint := 0; v_hoy date;
--   begin
--     v_hoy := (now() at time zone v_zona)::date;
--     select coalesce(sum(monto - monto_pagado), 0) into v_a_cobrar from cuota_financiada where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial');
--     select coalesce(sum(monto - monto_pagado), 0) into v_vence_este_mes from cuota_financiada where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial') and date_trunc('month', (fecha_vencimiento at time zone v_zona)::timestamp)::date = date_trunc('month', v_hoy::timestamp)::date;
--     select coalesce(sum(monto - monto_pagado), 0) into v_vencido from cuota_financiada where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial') and (fecha_vencimiento at time zone v_zona)::date < v_hoy;
--     select count(*) into v_cuotas_vencidas from cuota_financiada where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial') and (fecha_vencimiento at time zone v_zona)::date < v_hoy;
--     select count(distinct v.id_cliente) into v_clientes_con_deuda from cuota_financiada cf join venta v on v.id_venta = cf.id_venta where cf.id_tenant = v_tenant_id and cf.estado in ('pendiente', 'parcial') and v.id_cliente is not null;
--     v_por_cobrar := jsonb_build_object('a_cobrar', v_a_cobrar, 'vence_este_mes', v_vence_este_mes, 'vencido', v_vencido, 'cuotas_vencidas', v_cuotas_vencidas, 'clientes_con_deuda', v_clientes_con_deuda);
--   end;
--   select coalesce(sum(d.costo_unitario), 0) into v_deuda_proveedores from item_producto ip join ingreso_mercaderia_detalle d on d.id_ingreso = ip.id_ingreso and d.id_producto = ip.id_producto where ip.id_tenant = v_tenant_id and ip.tipo_ingreso = 'consignacion' and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');
--   return query select v_capital_propio, v_mercaderia_terceros, v_devueltos_clientes, v_valor_venta_potencial, v_productos_sin_precio, v_por_cobrar, v_deuda_proveedores;
-- end;
-- $$;

-- ─── 1. preview_liquidacion (INVOKER) ────────────────────────────────

create or replace function preview_liquidacion(
  p_id_revendedora uuid,
  p_desde          date,
  p_hasta          date
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_tenant            uuid := auth_tenant_id();
  v_rango             tstzrange;
  v_total_vendido     numeric := 0;
  v_cant              integer := 0;
  v_porcentaje        numeric := 0;
  v_monto_comision    numeric := 0;
  v_monto_a_cobrar    numeric := 0;
  v_lineas            jsonb := '[]'::jsonb;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  if not exists (
    select 1 from revendedora
    where id_tenant = v_tenant and id_revendedora = p_id_revendedora and activo = true
  ) then
    raise exception 'revendedora-not-found' using errcode = '42704';
  end if;

  v_rango := fn_rango_tenant(p_desde, p_hasta);

  select
    coalesce(sum(dv.precio_venta), 0),
    count(dv.id_detalle_venta),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id_detalle_venta', dv.id_detalle_venta,
        'id_venta', v.id_venta,
        'fecha_venta', v.fecha,
        'id_item', dv.id_item,
        'precio_venta', dv.precio_venta,
        'porcentaje_preview', dv.porcentaje_comision_preview
      ) order by v.fecha asc, dv.created_at asc
    ), '[]'::jsonb)
  into v_total_vendido, v_cant, v_lineas
  from detalle_venta dv
  join venta v on v.id_venta = dv.id_venta
  left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
  where dv.id_tenant = v_tenant
    and v.id_tenant = v_tenant
    and v.canal = 'revendedora'
    and v.id_revendedora = p_id_revendedora
    and v.estado_venta = 'registrada'
    and dev.id_devolucion is null
    and dv.id_liquidacion is null
    and dv.excluida_liquidacion = false
    and v.fecha <@ v_rango;

  if v_cant > 0 and v_total_vendido > 0 then
    select coalesce(porcentaje, 0) into v_porcentaje
      from fn_resolver_comision(p_id_revendedora, p_hasta, v_total_vendido, 'revendedora')
     limit 1;
    v_porcentaje := coalesce(v_porcentaje, 0);

    v_monto_comision := round(v_total_vendido * (v_porcentaje / 100.0), 2);
    v_monto_a_cobrar := v_total_vendido - v_monto_comision;
  end if;

  return jsonb_build_object(
    'id_revendedora', p_id_revendedora,
    'periodo_desde', p_desde,
    'periodo_hasta', p_hasta,
    'cantidad_lineas', v_cant,
    'monto_vendido', v_total_vendido,
    'porcentaje_resuelto', v_porcentaje,
    'monto_comision', v_monto_comision,
    'monto_a_cobrar', v_monto_a_cobrar,
    'lineas', v_lineas
  );
end;
$$;

grant execute on function preview_liquidacion(uuid, date, date) to authenticated;

-- ─── 2. sp_generar_liquidacion (INVOKER) ─────────────────────────────

create or replace function sp_generar_liquidacion(
  p_id_revendedora uuid,
  p_desde          date,
  p_hasta          date,
  p_observaciones  text default null,
  p_ip             inet default null
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_tenant            uuid := auth_tenant_id();
  v_actor             uuid := auth.uid();
  v_id_liq            uuid;
  v_rango             tstzrange;
  v_total_candidato   numeric := 0;
  v_count_candidato   integer := 0;
  v_porcentaje        numeric := 0;
  v_vendido_real      numeric := 0;
  v_comision_real     numeric := 0;
  v_cobrar_real       numeric := 0;
  v_count_real        integer := 0;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  if not exists (
    select 1 from revendedora
    where id_tenant = v_tenant and id_revendedora = p_id_revendedora and activo = true
    for update
  ) then
    raise exception 'revendedora-not-found' using errcode = '42704';
  end if;

  v_rango := fn_rango_tenant(p_desde, p_hasta);

  -- Sumar total del período sobre líneas candidatas bloqueándolas con FOR UPDATE
  with lineas_candidatas as (
    select dv.id_detalle_venta, dv.precio_venta
    from detalle_venta dv
    join venta v on v.id_venta = dv.id_venta
    left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
    where dv.id_tenant = v_tenant
      and v.id_tenant = v_tenant
      and v.canal = 'revendedora'
      and v.id_revendedora = p_id_revendedora
      and v.estado_venta = 'registrada'
      and dev.id_devolucion is null
      and dv.id_liquidacion is null
      and dv.excluida_liquidacion = false
      and v.fecha <@ v_rango
    for update of dv
  )
  select
    coalesce(sum(precio_venta), 0),
    count(*)
  into v_total_candidato, v_count_candidato
  from lineas_candidatas;

  if v_count_candidato = 0 then
    raise exception 'liquidacion-vacia' using errcode = '22023';
  end if;

  -- Resolver comisión UNA SOLA VEZ con el total acumulado del período
  select coalesce(porcentaje, 0) into v_porcentaje
    from fn_resolver_comision(p_id_revendedora, p_hasta, v_total_candidato, 'revendedora')
   limit 1;
  v_porcentaje := coalesce(v_porcentaje, 0);

  -- Insertar cabecera inicial
  insert into liquidacion_revendedora (
    id_tenant, id_revendedora, periodo_desde, periodo_hasta,
    monto_vendido, monto_comision, monto_a_cobrar,
    cantidad_lineas, porcentaje_aplicado, estado,
    fecha_liquidacion, observaciones, id_usuario_alta
  ) values (
    v_tenant, p_id_revendedora, p_desde, p_hasta,
    v_total_candidato, round(v_total_candidato * (v_porcentaje / 100.0), 2),
    v_total_candidato - round(v_total_candidato * (v_porcentaje / 100.0), 2),
    v_count_candidato, v_porcentaje, 'pendiente',
    (now() at time zone 'UTC')::date, p_observaciones, v_actor
  ) returning id_liquidacion into v_id_liq;

  -- Sellar id_liquidacion y escribir monto_comision por línea
  update detalle_venta dv
     set id_liquidacion = v_id_liq,
         monto_comision = round(dv.precio_venta * (v_porcentaje / 100.0), 2)
    from venta v
   where v.id_venta = dv.id_venta
     and dv.id_tenant = v_tenant
     and v.id_tenant = v_tenant
     and v.canal = 'revendedora'
     and v.id_revendedora = p_id_revendedora
     and v.estado_venta = 'registrada'
     and dv.id_liquidacion is null
     and dv.excluida_liquidacion = false
     and v.fecha <@ v_rango
     and not exists (
       select 1 from devolucion_venta dev
        where dev.id_detalle_venta = dv.id_detalle_venta
     );

  -- Recalcular cabecera desde las filas realmente selladas (guarda de concurrencia)
  select
    coalesce(sum(precio_venta), 0),
    coalesce(sum(monto_comision), 0),
    count(*)
  into v_vendido_real, v_comision_real, v_count_real
  from detalle_venta
  where id_liquidacion = v_id_liq
    and id_tenant = v_tenant;

  v_cobrar_real := v_vendido_real - v_comision_real;

  update liquidacion_revendedora
     set monto_vendido = v_vendido_real,
         monto_comision = v_comision_real,
         monto_a_cobrar = v_cobrar_real,
         cantidad_lineas = v_count_real
   where id_liquidacion = v_id_liq;

  insert into auditoria (id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'liquidacion_revendedora', v_id_liq::text, 'generar_liquidacion',
    jsonb_build_object(
      'id_revendedora', p_id_revendedora,
      'periodo_desde', p_desde,
      'periodo_hasta', p_hasta,
      'monto_vendido', v_vendido_real,
      'monto_comision', v_comision_real,
      'monto_a_cobrar', v_cobrar_real,
      'porcentaje_aplicado', v_porcentaje,
      'cantidad_lineas', v_count_real
    ),
    p_ip
  );

  return v_id_liq;
end;
$$;

grant execute on function sp_generar_liquidacion(uuid, date, date, text, inet) to authenticated;

-- ─── 3. sp_excluir_detalle_liquidacion (INVOKER) ──────────────────────

create or replace function sp_excluir_detalle_liquidacion(
  p_id_detalle uuid,
  p_motivo     text default null,
  p_ip         inet default null
) returns void
language plpgsql
security invoker
as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_liquidada  boolean;
  v_excluida   boolean;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select id_liquidacion is not null, excluida_liquidacion
    into v_liquidada, v_excluida
    from detalle_venta
   where id_detalle_venta = p_id_detalle and id_tenant = v_tenant
   for update;

  if not found then
    raise exception 'detalle-not-found' using errcode = '42704';
  end if;

  if v_liquidada then
    raise exception 'detalle-ya-liquidado' using errcode = '22023';
  end if;

  if v_excluida then
    return; -- idempotente
  end if;

  update detalle_venta
     set excluida_liquidacion = true
   where id_detalle_venta = p_id_detalle;

  insert into auditoria (id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'detalle_venta', p_id_detalle::text, 'excluir_liquidacion',
    jsonb_build_object('motivo', p_motivo), p_ip
  );
end;
$$;

grant execute on function sp_excluir_detalle_liquidacion(uuid, text, inet) to authenticated;

-- ─── 4. sp_reincluir_detalle_liquidacion (INVOKER) ────────────────────

create or replace function sp_reincluir_detalle_liquidacion(
  p_id_detalle uuid,
  p_ip         inet default null
) returns void
language plpgsql
security invoker
as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_liquidada  boolean;
  v_excluida   boolean;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select id_liquidacion is not null, excluida_liquidacion
    into v_liquidada, v_excluida
    from detalle_venta
   where id_detalle_venta = p_id_detalle and id_tenant = v_tenant
   for update;

  if not found then
    raise exception 'detalle-not-found' using errcode = '42704';
  end if;

  if v_liquidada then
    raise exception 'detalle-ya-liquidado' using errcode = '22023';
  end if;

  if not v_excluida then
    return; -- idempotente
  end if;

  update detalle_venta
     set excluida_liquidacion = false
   where id_detalle_venta = p_id_detalle;

  insert into auditoria (id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'detalle_venta', p_id_detalle::text, 'reincluir_liquidacion',
    '{}'::jsonb, p_ip
  );
end;
$$;

grant execute on function sp_reincluir_detalle_liquidacion(uuid, inet) to authenticated;

-- ─── 5. sp_marcar_liquidacion_pagada (INVOKER) ────────────────────────

create or replace function sp_marcar_liquidacion_pagada(
  p_id_liquidacion uuid,
  p_id_cuenta      uuid,
  p_monto          numeric,
  p_metodo         text default 'transferencia',
  p_referencia     text default null,
  p_fecha          timestamptz default null,
  p_ip             inet default null
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_tenant       uuid := auth_tenant_id();
  v_actor        uuid := auth.uid();
  v_liq          liquidacion_revendedora%rowtype;
  v_id_pago      uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select * into v_liq
    from liquidacion_revendedora
   where id_liquidacion = p_id_liquidacion
     and id_tenant = v_tenant
   for update;

  if not found then
    raise exception 'liquidacion-no-encontrada' using errcode = '42704';
  end if;

  if v_liq.estado = 'pagada' then
    raise exception 'liquidacion-ya-pagada' using errcode = '22023';
  end if;

  if not exists (
    select 1 from cuenta_destino
     where id_cuenta_destino = p_id_cuenta
       and id_tenant = v_tenant
       and activo = true
  ) then
    raise exception 'cuenta-invalida-liquidacion' using errcode = '22023';
  end if;

  if p_monto is null or p_monto <> v_liq.monto_a_cobrar then
    raise exception 'monto-pago-invalido' using errcode = '22023';
  end if;

  insert into pago_revendedora (
    id_tenant, id_liquidacion, monto, metodo, referencia, id_cuenta, fecha, id_usuario_alta
  ) values (
    v_tenant, p_id_liquidacion, p_monto, coalesce(p_metodo, 'transferencia'),
    p_referencia, p_id_cuenta, coalesce(p_fecha, now()), v_actor
  ) returning id_pago_revendedora into v_id_pago;

  update liquidacion_revendedora
     set estado = 'pagada',
         fecha_pago = coalesce(p_fecha, now())
   where id_liquidacion = p_id_liquidacion;

  insert into auditoria (id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'liquidacion_revendedora', p_id_liquidacion::text, 'pagar_liquidacion',
    jsonb_build_object(
      'id_pago_revendedora', v_id_pago,
      'monto', p_monto,
      'id_cuenta', p_id_cuenta,
      'metodo', p_metodo,
      'referencia', p_referencia,
      'fecha', coalesce(p_fecha, now())
    ),
    p_ip
  );

  return v_id_pago;
end;
$$;

grant execute on function sp_marcar_liquidacion_pagada(uuid, uuid, numeric, text, text, timestamptz, inet) to authenticated;

-- ─── 6. rf_cuenta_corriente_revendedora (INVOKER) ─────────────────────

create or replace function rf_cuenta_corriente_revendedora(
  p_id_revendedora uuid
) returns table (
  items_en_poder           bigint,
  monto_en_poder           numeric,
  total_vendido            numeric,
  total_devuelto           numeric,
  total_comision_liquidada numeric,
  total_liquidado          numeric,
  total_pagado             numeric,
  adeudado                 numeric
)
language plpgsql
security invoker
as $$
declare
  v_tenant            uuid := auth_tenant_id();
  v_items_poder       bigint := 0;
  v_monto_poder       numeric := 0;
  v_vendido           numeric := 0;
  v_devuelto          numeric := 0;
  v_comision_liq      numeric := 0;
  v_liquidado         numeric := 0;
  v_pagado            numeric := 0;
  v_adeudado          numeric := 0;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  if not exists (
    select 1 from revendedora
    where id_tenant = v_tenant and id_revendedora = p_id_revendedora and activo = true
  ) then
    raise exception 'revendedora-not-found' using errcode = '42704';
  end if;

  -- Mercadería en poder
  select
    count(crd.id_item),
    coalesce(sum(p.precio_venta), 0)
  into v_items_poder, v_monto_poder
  from consignacion_revendedora_detalle crd
  join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
  join producto p on p.id_producto = crd.id_producto
  where cr.id_tenant = v_tenant
    and cr.id_revendedora = p_id_revendedora
    and cr.confirmada = true
    and cr.estado = 'abierta'
    and crd.estado_detalle = 'en_poder';

  -- Total devuelto por consignación
  select
    coalesce(sum(p.precio_venta), 0)
  into v_devuelto
  from consignacion_revendedora_detalle crd
  join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
  join producto p on p.id_producto = crd.id_producto
  where cr.id_tenant = v_tenant
    and cr.id_revendedora = p_id_revendedora
    and crd.estado_detalle in ('devuelto', 'baja');

  -- Total vendido canal revendedora (registradas, no anuladas)
  select
    coalesce(sum(dv.precio_venta), 0)
  into v_vendido
  from detalle_venta dv
  join venta v on v.id_venta = dv.id_venta
  where v.id_tenant = v_tenant
    and v.canal = 'revendedora'
    and v.id_revendedora = p_id_revendedora
    and v.estado_venta = 'registrada';

  -- Liquidaciones: comisiones liquidadas y total liquidado a cobrar
  select
    coalesce(sum(monto_comision), 0),
    coalesce(sum(monto_a_cobrar), 0)
  into v_comision_liq, v_liquidado
  from liquidacion_revendedora
  where id_tenant = v_tenant
    and id_revendedora = p_id_revendedora;

  -- Total pagado vía pago_revendedora
  select
    coalesce(sum(pr.monto), 0)
  into v_pagado
  from pago_revendedora pr
  join liquidacion_revendedora lr on lr.id_liquidacion = pr.id_liquidacion
  where lr.id_tenant = v_tenant
    and lr.id_revendedora = p_id_revendedora;

  -- adeudado = total_vendido - comisiones_liquidadas - total_pagado
  v_adeudado := greatest(0, v_vendido - v_comision_liq - v_pagado);

  return query select
    v_items_poder,
    v_monto_poder,
    v_vendido,
    v_devuelto,
    v_comision_liq,
    v_liquidado,
    v_pagado,
    v_adeudado;
end;
$$;

grant execute on function rf_cuenta_corriente_revendedora(uuid) to authenticated;

-- ─── 7. Actualización de vistas y finanzas (DR-2, DR-3, DR-14) ─────────

-- 7.1 v_linea_venta con fecha_liquidacion desde liquidacion_revendedora
create or replace view v_linea_venta with (security_invoker = true) as
select
  v.id_tenant,
  v.id_venta,
  dv.id_producto,
  v.fecha as fecha_venta,
  v.estado_venta,
  v.fecha_anulacion,
  p.precio_venta as precio_venta,
  dv.costo_snapshot as costo,
  dv.monto_ganancia as margen,
  dv.tipo_ingreso_snapshot,
  dv.id_proveedor,
  dv.monto_proveedor,
  dv.id_rendicion,
  dv.excluida_rendicion,
  (dev.id_devolucion is not null) as devuelta,
  dev.fecha as fecha_devolucion,
  dev.costo_recuperado,
  case
    when v.estado_venta = 'registrada' and dev.id_devolucion is null and dv.id_liquidacion is not null
      then dv.monto_comision
    else 0::numeric(14, 2)
  end as comision,
  case
    when v.estado_venta = 'registrada'
     and dev.id_devolucion is null
     and dv.id_liquidacion is null
     and v.canal = 'revendedora'
      then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2)
    else 0::numeric(14, 2)
  end as comision_estimada,
  liq.fecha_liquidacion
from detalle_venta dv
join venta v on v.id_venta = dv.id_venta
join producto p on p.id_producto = dv.id_producto
left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
left join liquidacion_revendedora liq on liq.id_liquidacion = dv.id_liquidacion and liq.id_tenant = dv.id_tenant;

-- 7.2 rf_finanzas_resultados: comision_liquidada devenga en fecha de liquidación (DR-2)
create or replace function rf_finanzas_resultados(p_desde date, p_hasta date)
returns table (
  ventas_brutas numeric,
  anulaciones numeric,
  devoluciones numeric,
  ventas_netas numeric,
  costo_mercaderia numeric,
  ganancia_sobre_ventas numeric,
  costo_cobro numeric,
  incobrables numeric,
  bajas_inventario numeric,
  ganancia_despues_de_costos numeric,
  gastos numeric,
  comision_liquidada numeric,
  comision_pendiente_estimada numeric,
  ganancia_final numeric,
  cantidad_ventas bigint,
  ticket_promedio numeric
)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid;
  v_ventas_brutas numeric := 0;
  v_anulaciones numeric := 0;
  v_devoluciones numeric := 0;
  v_costo_mercaderia numeric := 0;
  v_costo_cobro numeric := 0;
  v_incobrables numeric := 0;
  v_bajas_inventario numeric := 0;
  v_gastos numeric := 0;
  v_comision_liquidada numeric := 0;
  v_comision_pendiente_estimada numeric := 0;
  v_cantidad_ventas bigint := 0;
  v_zona text;
begin
  v_tenant_id := auth_tenant_id();
  select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;

  select
    coalesce(sum(v.total), 0) into v_ventas_brutas
  from venta v
  where v.id_tenant = v_tenant_id and (v.fecha at time zone v_zona)::date >= p_desde and (v.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(v.total), 0) into v_anulaciones
  from venta v
  where v.id_tenant = v_tenant_id and (v.fecha_anulacion at time zone v_zona)::date >= p_desde and (v.fecha_anulacion at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(dv.monto), 0) into v_devoluciones
  from devolucion_venta dv
  where dv.id_tenant = v_tenant_id and (dv.fecha at time zone v_zona)::date >= p_desde and (dv.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(vl.costo), 0) into v_costo_mercaderia
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;

  declare
    v_costo_anuladas numeric := 0;
    v_costo_devueltas numeric := 0;
  begin
    select coalesce(sum(vl.costo), 0) into v_costo_anuladas
    from v_linea_venta vl
    where vl.id_tenant = v_tenant_id and (vl.fecha_anulacion at time zone v_zona)::date >= p_desde and (vl.fecha_anulacion at time zone v_zona)::date <= p_hasta;

    select coalesce(sum(vl.costo_recuperado), 0) into v_costo_devueltas
    from v_linea_venta vl
    where vl.id_tenant = v_tenant_id and (vl.fecha_devolucion at time zone v_zona)::date >= p_desde and (vl.fecha_devolucion at time zone v_zona)::date <= p_hasta;

    v_costo_mercaderia := v_costo_mercaderia - v_costo_anuladas - v_costo_devueltas;
  end;

  select
    coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro
  from pago_venta pv
  where pv.id_tenant = v_tenant_id
    and pv.medio <> 'cuenta_revendedora'
    and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(cf.monto - cf.monto_pagado), 0) into v_incobrables
  from cuota_financiada cf
  where cf.id_tenant = v_tenant_id and cf.estado = 'incobrable' and (cf.fecha_incobrable at time zone v_zona)::date >= p_desde and (cf.fecha_incobrable at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(ip.costo_ingreso), 0) into v_bajas_inventario
  from item_producto ip
  where ip.id_tenant = v_tenant_id and ip.estado_item = 'baja' and (ip.updated_at at time zone v_zona)::date >= p_desde and (ip.updated_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(gn.monto), 0) into v_gastos
  from gasto_negocio gn
  where gn.id_tenant = v_tenant_id and (gn.fecha at time zone v_zona)::date >= p_desde and (gn.fecha at time zone v_zona)::date <= p_hasta;

  -- DR-2: comision_liquidada se devenga por fecha de liquidación, uniendo con liquidacion_revendedora
  select
    coalesce(sum(vl.comision), 0) into v_comision_liquidada
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id
    and vl.comision > 0
    and vl.fecha_liquidacion is not null
    and vl.fecha_liquidacion >= p_desde
    and vl.fecha_liquidacion <= p_hasta;

  select
    coalesce(sum(vl.comision_estimada), 0) into v_comision_pendiente_estimada
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id
    and (vl.fecha_venta at time zone v_zona)::date >= p_desde
    and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;

  -- Si el módulo revendedoras está apagado, las comisiones no aplican
  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant_id and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    v_comision_liquidada := 0;
    v_comision_pendiente_estimada := 0;
  end if;

  select count(*) into v_cantidad_ventas
  from venta v
  where v.id_tenant = v_tenant_id and v.estado_venta = 'registrada' and (v.fecha at time zone v_zona)::date >= p_desde and (v.fecha at time zone v_zona)::date <= p_hasta;

  return query select
    v_ventas_brutas,
    v_anulaciones,
    v_devoluciones,
    v_ventas_brutas - v_anulaciones - v_devoluciones as ventas_netas,
    v_costo_mercaderia,
    (v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia as ganancia_sobre_ventas,
    v_costo_cobro,
    v_incobrables,
    v_bajas_inventario,
    ((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario as ganancia_despues_de_costos,
    v_gastos,
    v_comision_liquidada,
    v_comision_pendiente_estimada,
    (((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario) - v_gastos - v_comision_liquidada as ganancia_final,
    v_cantidad_ventas,
    case when v_cantidad_ventas > 0 then (v_ventas_brutas - v_anulaciones - v_devoluciones) / v_cantidad_ventas else null::numeric end as ticket_promedio;
end;
$$;

grant execute on function rf_finanzas_resultados(date, date) to authenticated;

-- 7.3 rf_finanzas_flujo: suma pago_revendedora como cobro en fecha del pago (DR-3, DR-14)
create or replace function rf_finanzas_flujo(p_desde date, p_hasta date)
returns table (
  cobrado numeric,
  devuelto_clientes numeric,
  costo_cobro numeric,
  neto_cobros numeric,
  compras_mercaderia numeric,
  pagos_proveedores numeric,
  gastos numeric,
  flujo_neto numeric,
  por_acreditar jsonb
)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid;
  v_cobrado numeric := 0;
  v_devuelto_clientes numeric := 0;
  v_costo_cobro numeric := 0;
  v_compras_mercaderia numeric := 0;
  v_pagos_proveedores numeric := 0;
  v_gastos numeric := 0;
  v_por_acreditar jsonb;
  v_zona text;
begin
  v_tenant_id := auth_tenant_id();
  select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;

  select
    coalesce(sum(pv.monto), 0) into v_cobrado
  from pago_venta pv
  where pv.id_tenant = v_tenant_id
    and pv.medio <> 'cuenta_revendedora'
    and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;

  -- DR-3/DR-14: Sumar pagos de liquidación de revendedoras a caja física / cuenta del tenant
  declare
    v_cobrado_revendedora numeric := 0;
  begin
    select coalesce(sum(pr.monto), 0) into v_cobrado_revendedora
    from pago_revendedora pr
    where pr.id_tenant = v_tenant_id
      and (pr.fecha at time zone v_zona)::date >= p_desde
      and (pr.fecha at time zone v_zona)::date <= p_hasta;

    v_cobrado := v_cobrado + v_cobrado_revendedora;
  end;

  select
    coalesce(sum(rc.monto), 0) into v_devuelto_clientes
  from reintegro_cliente rc
  where rc.id_tenant = v_tenant_id
    and rc.medio <> 'cuenta_revendedora'
    and (rc.fecha at time zone v_zona)::date >= p_desde and (rc.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro
  from pago_venta pv
  where pv.id_tenant = v_tenant_id
    and pv.medio <> 'cuenta_revendedora'
    and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(cantidad * costo_unitario), 0) into v_compras_mercaderia
  from ingreso_mercaderia_detalle d
  join ingreso_mercaderia i on i.id_ingreso = d.id_ingreso
  where i.id_tenant = v_tenant_id
    and i.tipo_ingreso = 'compra'
    and i.confirmado = true
    and i.cancelado_at is null
    and (i.fecha at time zone v_zona)::date >= p_desde and (i.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(rp.monto_total), 0) into v_pagos_proveedores
  from rendicion_proveedor rp
  where rp.id_tenant = v_tenant_id and rp.estado = 'pagada' and (rp.fecha_pago at time zone v_zona)::date >= p_desde and (rp.fecha_pago at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(gn.monto), 0) into v_gastos
  from gasto_negocio gn
  where gn.id_tenant = v_tenant_id and (gn.fecha at time zone v_zona)::date >= p_desde and (gn.fecha at time zone v_zona)::date <= p_hasta;

  select jsonb_object_agg(t.tipo, coalesce(t.total, 0)) into v_por_acreditar
  from (
    select cd.tipo, sum(p.neto_acreditado) as total
    from pago_venta p
    join cuenta_destino cd on cd.id_cuenta_destino = p.id_cuenta_destino
    where p.id_tenant = v_tenant_id
      and p.medio <> 'cuenta_revendedora'
      and (p.fecha_acreditacion at time zone v_zona)::date > (now() at time zone v_zona)::date
    group by cd.tipo
  ) t;

  if v_por_acreditar is null then
    v_por_acreditar := '{}'::jsonb;
  end if;

  return query select
    v_cobrado,
    v_devuelto_clientes,
    v_costo_cobro,
    v_cobrado - v_devuelto_clientes - v_costo_cobro as neto_cobros,
    v_compras_mercaderia,
    v_pagos_proveedores,
    v_gastos,
    (v_cobrado - v_devuelto_clientes - v_costo_cobro) - v_compras_mercaderia - v_pagos_proveedores - v_gastos as flujo_neto,
    v_por_acreditar;
end;
$$;

grant execute on function rf_finanzas_flujo(date, date) to authenticated;

-- 7.4 rf_finanzas_posicion: suma saldo adeudado por revendedoras a por cobrar (DR-3, DR-14)
create or replace function rf_finanzas_posicion()
returns table (
  capital_propio numeric,
  mercaderia_terceros numeric,
  devueltos_clientes numeric,
  valor_venta_potencial numeric,
  productos_sin_precio bigint,
  por_cobrar jsonb,
  deuda_proveedores numeric
)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid;
  v_capital_propio numeric := 0;
  v_mercaderia_terceros numeric := 0;
  v_devueltos_clientes numeric := 0;
  v_valor_venta_potencial numeric := 0;
  v_productos_sin_precio bigint := 0;
  v_deuda_proveedores numeric := 0;
  v_por_cobrar jsonb;
  v_zona text;
begin
  v_tenant_id := auth_tenant_id();
  select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;

  select
    coalesce(sum(costo_ingreso), 0) into v_capital_propio
  from item_producto
  where id_tenant = v_tenant_id and tipo_ingreso = 'compra' and estado_item in ('disponible', 'reservado', 'en_revendedora');

  select
    coalesce(sum(costo_ingreso), 0) into v_mercaderia_terceros
  from item_producto
  where id_tenant = v_tenant_id and tipo_ingreso = 'consignacion' and estado_item in ('disponible', 'reservado', 'en_revendedora');

  select
    coalesce(sum(costo_ingreso), 0) into v_devueltos_clientes
  from item_producto
  where id_tenant = v_tenant_id and estado_item = 'devuelto_cliente';

  select
    coalesce(sum(p.precio_venta), 0) into v_valor_venta_potencial
  from item_producto ip
  join producto p on p.id_producto = ip.id_producto
  where ip.id_tenant = v_tenant_id and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');

  select
    count(*) into v_productos_sin_precio
  from producto
  where id_tenant = v_tenant_id and precio_venta = 0 and activo = true;

  -- por_cobrar: (a cobrar, vence este mes, vencido, cuotas vencidas, clientes con deuda)
  declare
    v_a_cobrar numeric := 0;
    v_vence_este_mes numeric := 0;
    v_vencido numeric := 0;
    v_cuotas_vencidas bigint := 0;
    v_clientes_con_deuda bigint := 0;
    v_hoy date;
    v_vendido_rev numeric := 0;
    v_comision_liq_rev numeric := 0;
    v_pagado_rev numeric := 0;
    v_deuda_rev numeric := 0;
  begin
    v_hoy := (now() at time zone v_zona)::date;

    select
      coalesce(sum(monto - monto_pagado), 0) into v_a_cobrar
    from cuota_financiada
    where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial');

    select
      coalesce(sum(monto - monto_pagado), 0) into v_vence_este_mes
    from cuota_financiada
    where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
      and date_trunc('month', (fecha_vencimiento at time zone v_zona)::timestamp)::date = date_trunc('month', v_hoy::timestamp)::date;

    select
      coalesce(sum(monto - monto_pagado), 0) into v_vencido
    from cuota_financiada
    where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
      and (fecha_vencimiento at time zone v_zona)::date < v_hoy;

    select
      count(*) into v_cuotas_vencidas
    from cuota_financiada
    where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
      and (fecha_vencimiento at time zone v_zona)::date < v_hoy;

    select
      count(distinct v.id_cliente) into v_clientes_con_deuda
    from cuota_financiada cf
    join venta v on v.id_venta = cf.id_venta
    where cf.id_tenant = v_tenant_id and cf.estado in ('pendiente', 'parcial') and v.id_cliente is not null;

    -- Deuda adeudada por revendedoras: total_vendido - comisiones_liquidadas - total_pagado
    if exists (
      select 1 from tenant_modulo tm
      join modulo m on m.id_modulo = tm.id_modulo
      where tm.id_tenant = v_tenant_id and m.codigo = 'revendedoras' and tm.habilitado = true
    ) then
      select coalesce(sum(dv.precio_venta), 0) into v_vendido_rev
      from detalle_venta dv
      join venta v on v.id_venta = dv.id_venta
      where v.id_tenant = v_tenant_id
        and v.canal = 'revendedora'
        and v.estado_venta = 'registrada';

      select coalesce(sum(monto_comision), 0) into v_comision_liq_rev
      from liquidacion_revendedora
      where id_tenant = v_tenant_id;

      select coalesce(sum(monto), 0) into v_pagado_rev
      from pago_revendedora
      where id_tenant = v_tenant_id;

      v_deuda_rev := greatest(0, v_vendido_rev - v_comision_liq_rev - v_pagado_rev);
      v_a_cobrar := v_a_cobrar + v_deuda_rev;
    end if;

    v_por_cobrar := jsonb_build_object(
      'a_cobrar', v_a_cobrar,
      'vence_este_mes', v_vence_este_mes,
      'vencido', v_vencido,
      'cuotas_vencidas', v_cuotas_vencidas,
      'clientes_con_deuda', v_clientes_con_deuda
    );
  end;

  select
    coalesce(sum(d.costo_unitario), 0) into v_deuda_proveedores
  from item_producto ip
  join ingreso_mercaderia_detalle d on d.id_ingreso = ip.id_ingreso and d.id_producto = ip.id_producto
  where ip.id_tenant = v_tenant_id and ip.tipo_ingreso = 'consignacion' and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');

  return query select
    v_capital_propio,
    v_mercaderia_terceros,
    v_devueltos_clientes,
    v_valor_venta_potencial,
    v_productos_sin_precio,
    v_por_cobrar,
    v_deuda_proveedores;
end;
$$;

grant execute on function rf_finanzas_posicion() to authenticated;

