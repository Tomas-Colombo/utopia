-- 00100_finanzas_cambio.sql
-- Actualización de v_linea_venta y rf_cuenta_corriente_revendedora para cambio_venta (REQ-RV-DB-07, DR-5)
--
-- DOWN:
-- create or replace view v_linea_venta with (security_invoker = true) as
-- select
--   v.id_tenant, v.id_venta, dv.id_producto, v.fecha as fecha_venta, v.estado_venta, v.fecha_anulacion,
--   p.precio_venta as precio_venta, dv.costo_snapshot as costo, dv.monto_ganancia as margen, dv.tipo_ingreso_snapshot,
--   dv.id_proveedor, dv.monto_proveedor, dv.id_rendicion, dv.excluida_rendicion,
--   (dev.id_devolucion is not null) as devuelta, dev.fecha as fecha_devolucion, dev.costo_recuperado,
--   case when v.estado_venta = 'registrada' and dev.id_devolucion is null and dv.id_liquidacion is not null then dv.monto_comision else 0::numeric(14, 2) end as comision,
--   case when v.estado_venta = 'registrada' and dev.id_devolucion is null and dv.id_liquidacion is null and v.canal = 'revendedora' then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2) else 0::numeric(14, 2) end as comision_estimada,
--   liq.fecha_liquidacion
-- from detalle_venta dv join venta v on v.id_venta = dv.id_venta join producto p on p.id_producto = dv.id_producto
-- left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
-- left join liquidacion_revendedora liq on liq.id_liquidacion = dv.id_liquidacion and liq.id_tenant = dv.id_tenant;
-- -- Ver definición previa de rf_cuenta_corriente_revendedora en 00095_liquidacion_functions.sql (L646-L758).

-- 1. v_linea_venta con soporte de cambio_venta
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
  (dev.id_devolucion is not null or cv.id_cambio is not null) as devuelta,
  coalesce(dev.fecha, cv.created_at) as fecha_devolucion,
  coalesce(dev.costo_recuperado, case when cv.id_cambio is not null then dv.costo_snapshot else null end)::numeric(14,2) as costo_recuperado,
  case
    when v.estado_venta = 'registrada' and dev.id_devolucion is null and cv.id_cambio is null and dv.id_liquidacion is not null
      then dv.monto_comision
    else 0::numeric(14, 2)
  end as comision,
  case
    when v.estado_venta = 'registrada'
     and dev.id_devolucion is null
     and cv.id_cambio is null
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
left join cambio_venta cv on cv.id_detalle_original = dv.id_detalle_venta and cv.id_tenant = dv.id_tenant
left join liquidacion_revendedora liq on liq.id_liquidacion = dv.id_liquidacion and liq.id_tenant = dv.id_tenant;

-- 2. rf_cuenta_corriente_revendedora con soporte de cambio_venta
create or replace function rf_cuenta_corriente_revendedora(p_id_revendedora uuid)
returns table (
  items_en_poder                  bigint,
  monto_en_poder                  numeric,
  total_vendido                   numeric,
  total_devuelto                  numeric,
  total_comision_liquidada        numeric,
  total_liquidado                 numeric,
  total_pagado                    numeric,
  adeudado                        numeric
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
  v_diferencias       numeric := 0;
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
  -- Excluye las líneas originales cambiadas (su reemplazo está en la nueva línea activa)
  select
    coalesce(sum(dv.precio_venta), 0)
  into v_vendido
  from detalle_venta dv
  join venta v on v.id_venta = dv.id_venta
  where v.id_tenant = v_tenant
    and v.canal = 'revendedora'
    and v.id_revendedora = p_id_revendedora
    and v.estado_venta = 'registrada'
    and not exists (
      select 1 from cambio_venta cv
      where cv.id_detalle_original = dv.id_detalle_venta
        and cv.id_tenant = v_tenant
    );

  -- Sumar diferencias de precio de cambios de la revendedora
  select coalesce(sum(cv.diferencia), 0) into v_diferencias
  from cambio_venta cv
  join venta v on v.id_venta = cv.id_venta_original
  where cv.id_tenant = v_tenant
    and cv.origen = 'revendedora'
    and v.id_revendedora = p_id_revendedora;

  v_vendido := v_vendido + v_diferencias;

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
