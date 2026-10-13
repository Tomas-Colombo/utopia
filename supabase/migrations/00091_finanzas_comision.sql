-- 00091_finanzas_comision.sql
-- Slice 6b: Exponer comisiones en v_linea_venta y rf_finanzas_resultados (DR-2, REQ-RV-DB-08).
--
-- DOWN:
-- drop function if exists rf_finanzas_resultados(date, date);
-- drop view if exists v_linea_venta cascade;
-- 
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
--   dev.costo_recuperado
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
--   ganancia_final numeric,
--   cantidad_ventas bigint,
--   ticket_promedio numeric
-- )
-- language plpgsql
-- security invoker
-- as $$
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
--   v_cantidad_ventas bigint := 0;
--   v_zona text;
-- begin
--   v_tenant_id := auth_tenant_id();
--   select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;
-- 
--   select
--     coalesce(sum(v.total), 0) into v_ventas_brutas
--   from venta v
--   where v.id_tenant = v_tenant_id and (v.fecha at time zone v_zona)::date >= p_desde and (v.fecha at time zone v_zona)::date <= p_hasta;
-- 
--   select
--     coalesce(sum(v.total), 0) into v_anulaciones
--   from venta v
--   where v.id_tenant = v_tenant_id and (v.fecha_anulacion at time zone v_zona)::date >= p_desde and (v.fecha_anulacion at time zone v_zona)::date <= p_hasta;
-- 
--   select
--     coalesce(sum(dv.monto), 0) into v_devoluciones
--   from devolucion_venta dv
--   where dv.id_tenant = v_tenant_id and (dv.fecha at time zone v_zona)::date >= p_desde and (dv.fecha at time zone v_zona)::date <= p_hasta;
-- 
--   select
--     coalesce(sum(vl.costo), 0) into v_costo_mercaderia
--   from v_linea_venta vl
--   where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;
--   
--   declare
--     v_costo_anuladas numeric := 0;
--     v_costo_devueltas numeric := 0;
--   begin
--     select coalesce(sum(vl.costo), 0) into v_costo_anuladas
--     from v_linea_venta vl
--     where vl.id_tenant = v_tenant_id and (vl.fecha_anulacion at time zone v_zona)::date >= p_desde and (vl.fecha_anulacion at time zone v_zona)::date <= p_hasta;
-- 
--     select coalesce(sum(vl.costo_recuperado), 0) into v_costo_devueltas
--     from v_linea_venta vl
--     where vl.id_tenant = v_tenant_id and (vl.fecha_devolucion at time zone v_zona)::date >= p_desde and (vl.fecha_devolucion at time zone v_zona)::date <= p_hasta;
--     
--     v_costo_mercaderia := v_costo_mercaderia - v_costo_anuladas - v_costo_devueltas;
--   end;
-- 
--   select
--     coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro
--   from pago_venta pv
--   where pv.id_tenant = v_tenant_id and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;
-- 
--   select
--     coalesce(sum(cf.monto - cf.monto_pagado), 0) into v_incobrables
--   from cuota_financiada cf
--   where cf.id_tenant = v_tenant_id and cf.estado = 'incobrable' and (cf.fecha_incobrable at time zone v_zona)::date >= p_desde and (cf.fecha_incobrable at time zone v_zona)::date <= p_hasta;
-- 
--   select
--     coalesce(sum(ip.costo_ingreso), 0) into v_bajas_inventario
--   from item_producto ip
--   where ip.id_tenant = v_tenant_id and ip.estado_item = 'baja' and (ip.updated_at at time zone v_zona)::date >= p_desde and (ip.updated_at at time zone v_zona)::date <= p_hasta;
-- 
--   select
--     coalesce(sum(gn.monto), 0) into v_gastos
--   from gasto_negocio gn
--   where gn.id_tenant = v_tenant_id and (gn.fecha at time zone v_zona)::date >= p_desde and (gn.fecha at time zone v_zona)::date <= p_hasta;
-- 
--   select count(*) into v_cantidad_ventas
--   from venta v
--   where v.id_tenant = v_tenant_id and v.estado_venta = 'registrada' and (v.fecha at time zone v_zona)::date >= p_desde and (v.fecha at time zone v_zona)::date <= p_hasta;
-- 
--   return query select
--     v_ventas_brutas,
--     v_anulaciones,
--     v_devoluciones,
--     v_ventas_brutas - v_anulaciones - v_devoluciones as ventas_netas,
--     v_costo_mercaderia,
--     (v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia as ganancia_sobre_ventas,
--     v_costo_cobro,
--     v_incobrables,
--     v_bajas_inventario,
--     ((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario as ganancia_despues_de_costos,
--     v_gastos,
--     (((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario) - v_gastos as ganancia_final,
--     v_cantidad_ventas,
--     case when v_cantidad_ventas > 0 then (v_ventas_brutas - v_anulaciones - v_devoluciones) / v_cantidad_ventas else null::numeric end as ticket_promedio;
-- end;
-- $$;
-- 
-- create or replace function rf_finanzas_posicion()
-- returns table (
--   capital_propio numeric,
--   mercaderia_terceros numeric,
--   devueltos_clientes numeric,
--   valor_venta_potencial numeric,
--   productos_sin_precio bigint,
--   por_cobrar jsonb,
--   deuda_proveedores numeric
-- )
-- language plpgsql
-- security invoker
-- as $$
-- declare
--   v_tenant_id uuid;
--   v_capital_propio numeric := 0;
--   v_mercaderia_terceros numeric := 0;
--   v_devueltos_clientes numeric := 0;
--   v_valor_venta_potencial numeric := 0;
--   v_productos_sin_precio bigint := 0;
--   v_deuda_proveedores numeric := 0;
--   v_por_cobrar jsonb;
--   v_zona text;
-- begin
--   v_tenant_id := auth_tenant_id();
--   select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;
-- 
--   select
--     coalesce(sum(costo_ingreso), 0) into v_capital_propio
--   from item_producto
--   where id_tenant = v_tenant_id and tipo_ingreso = 'compra' and estado_item in ('disponible', 'reservado', 'en_revendedora');
-- 
--   select
--     coalesce(sum(costo_ingreso), 0) into v_mercaderia_terceros
--   from item_producto
--   where id_tenant = v_tenant_id and tipo_ingreso = 'consignacion' and estado_item in ('disponible', 'reservado', 'en_revendedora');
-- 
--   select
--     coalesce(sum(costo_ingreso), 0) into v_devueltos_clientes
--   from item_producto
--   where id_tenant = v_tenant_id and estado_item = 'devuelto_cliente';
-- 
--   select
--     coalesce(sum(p.precio_venta), 0) into v_valor_venta_potencial
--   from item_producto ip
--   join producto p on p.id_producto = ip.id_producto
--   where ip.id_tenant = v_tenant_id and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');
-- 
--   select
--     count(*) into v_productos_sin_precio
--   from producto
--   where id_tenant = v_tenant_id and precio_venta = 0 and activo = true;
-- 
--   declare
--     v_a_cobrar numeric := 0;
--     v_vence_este_mes numeric := 0;
--     v_vencido numeric := 0;
--     v_cuotas_vencidas bigint := 0;
--     v_clientes_con_deuda bigint := 0;
--     v_hoy date;
--   begin
--     v_hoy := (now() at time zone v_zona)::date;
-- 
--     select
--       coalesce(sum(monto - monto_pagado), 0) into v_a_cobrar
--     from cuota_financiada
--     where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial');
-- 
--     select
--       coalesce(sum(monto - monto_pagado), 0) into v_vence_este_mes
--     from cuota_financiada
--     where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
--       and date_trunc('month', (fecha_vencimiento at time zone v_zona)::timestamp)::date = date_trunc('month', v_hoy::timestamp)::date;
-- 
--     select
--       coalesce(sum(monto - monto_pagado), 0) into v_vencido
--     from cuota_financiada
--     where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
--       and (fecha_vencimiento at time zone v_zona)::date < v_hoy;
-- 
--     select
--       count(*) into v_cuotas_vencidas
--     from cuota_financiada
--     where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
--       and (fecha_vencimiento at time zone v_zona)::date < v_hoy;
-- 
--     select
--       count(distinct v.id_cliente) into v_clientes_con_deuda
--     from cuota_financiada cf
--     join venta v on v.id_venta = cf.id_venta
--     where cf.id_tenant = v_tenant_id and cf.estado in ('pendiente', 'parcial') and v.id_cliente is not null;
-- 
--     v_por_cobrar := jsonb_build_object(
--       'a_cobrar', v_a_cobrar,
--       'vence_este_mes', v_vence_este_mes,
--       'vencido', v_vencido,
--       'cuotas_vencidas', v_cuotas_vencidas,
--       'clientes_con_deuda', v_clientes_con_deuda
--     );
--   end;
-- 
--   declare
--     v_a_rendir numeric := 0;
--     v_rendiciones_sin_pagar numeric := 0;
--   begin
--     select coalesce(sum(monto_proveedor), 0) into v_a_rendir
--     from v_linea_venta
--     where id_tenant = v_tenant_id
--       and id_rendicion is null
--       and excluida_rendicion = false
--       and monto_proveedor > 0
--       and estado_venta = 'registrada'
--       and devuelta = false;
-- 
--     select coalesce(sum(monto_total), 0) into v_rendiciones_sin_pagar
--     from rendicion_proveedor
--     where id_tenant = v_tenant_id and estado = 'pendiente';
-- 
--     v_deuda_proveedores := v_a_rendir + v_rendiciones_sin_pagar;
--   end;
-- 
--   return query select
--     v_capital_propio,
--     v_mercaderia_terceros,
--     v_devueltos_clientes,
--     v_valor_venta_potencial,
--     v_productos_sin_precio,
--     v_por_cobrar,
--     v_deuda_proveedores;
-- end;
-- $$;
-- 
-- grant execute on function rf_finanzas_resultados(date, date) to authenticated;
-- grant execute on function rf_finanzas_posicion() to authenticated;

-- 1. Vista v_linea_venta con columnas comision y comision_estimada
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
     and not dv.excluida_liquidacion
      then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2)
    else 0::numeric(14, 2)
  end as comision_estimada
from detalle_venta dv
join venta v on v.id_venta = dv.id_venta
join producto p on p.id_producto = dv.id_producto
left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta;

-- 2. Función rf_finanzas_resultados exponiendo comision_liquidada y comision_pendiente_estimada
drop function if exists rf_finanzas_resultados(date, date);

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
  where pv.id_tenant = v_tenant_id and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;

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

  select
    coalesce(sum(vl.comision), 0) into v_comision_liquidada
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(vl.comision_estimada), 0) into v_comision_pendiente_estimada
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;

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
