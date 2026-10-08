-- 00074_limpieza_reportes_viejos.sql
-- UP: Slice 14 - Limpiar RPCs de reportes viejos (00028, 00061) que ya no se usan.

DROP FUNCTION IF EXISTS rf_dashboard_kpis();
DROP FUNCTION IF EXISTS rf_reporte_financiero(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS rf_rotacion_por_producto(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS rf_reporte_caja(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS rf_incobrables_periodo(timestamptz, timestamptz);

-- DOWN:

/*

create or replace function rf_rotacion_por_producto(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_id_categoria uuid default null
) returns table (
  id_producto uuid,
  nombre text,
  sku text,
  categoria_nombre text,
  unidades_vendidas bigint,
  monto_vendido numeric,
  monto_ganancia numeric,
  ticket_promedio numeric,
  primera_venta timestamptz,
  ultima_venta timestamptz
) language sql stable as $$
  select
    p.id_producto,
    p.nombre,
    p.sku,
    cat.nombre as categoria_nombre,
    count(dv.id_detalle_venta)::bigint as unidades_vendidas,
    coalesce(sum(dv.precio_venta), 0)::numeric as monto_vendido,
    coalesce(sum(dv.monto_ganancia), 0)::numeric as monto_ganancia,
    case
      when count(dv.id_detalle_venta) = 0 then 0
      else round((sum(dv.precio_venta) / count(dv.id_detalle_venta))::numeric, 2)
    end as ticket_promedio,
    min(v.fecha) as primera_venta,
    max(v.fecha) as ultima_venta
  from producto p
  left join categoria cat on cat.id_categoria = p.id_categoria
  left join detalle_venta dv on dv.id_producto = p.id_producto
  left join venta v on v.id_venta = dv.id_venta
    and v.fecha >= p_desde and v.fecha <= p_hasta
    and v.estado_venta = 'registrada'
  where p.id_tenant = auth_tenant_id()
    and p.activo = true
    and (p_id_categoria is null or p.id_categoria = p_id_categoria)
  group by p.id_producto, p.nombre, p.sku, cat.nombre
  order by unidades_vendidas desc, monto_vendido desc;
$$;

grant execute on function rf_rotacion_por_producto(timestamptz, timestamptz, uuid) to authenticated;


create or replace function rf_reporte_financiero(
  p_desde timestamptz,
  p_hasta timestamptz
) returns table (
  ingresos_totales numeric,
  costo_mercaderia numeric,
  monto_a_proveedores numeric,
  ganancia_bruta_real numeric,
  ganancia_bruta_esperada numeric,
  impacto_descuentos numeric,
  gastos_totales numeric,
  ganancia_neta numeric,
  cantidad_ventas bigint,
  cantidad_lineas bigint,
  ticket_promedio numeric
) language sql stable as $$
  with base_ventas as (
    select
      v.id_venta,
      v.total as venta_total
    from venta v
    where v.id_tenant = auth_tenant_id()
      and v.fecha >= p_desde and v.fecha <= p_hasta
      and v.estado_venta = 'registrada'
  ),
  detalles as (
    select
      dv.id_venta,
      dv.id_producto,
      dv.costo_snapshot,
      dv.monto_proveedor,
      dv.precio_venta
    from detalle_venta dv
    join base_ventas bv on bv.id_venta = dv.id_venta
  ),
  totales_ventas as (
    select count(*) as cant_ventas,
           coalesce(sum(venta_total), 0) as ingresos_totales
      from base_ventas
  ),
  totales_lineas as (
    select count(*) as cant_lineas,
           coalesce(sum(costo_snapshot), 0) as costo_mercaderia,
           coalesce(sum(monto_proveedor), 0) as monto_a_proveedores
      from detalles
  ),
  totales_productos as (
    select sum(p.precio_venta - d.costo_snapshot) as ganancia_esperada
      from detalles d
      join producto p on p.id_producto = d.id_producto
  ),
  totales_gastos as (
    select coalesce(sum(monto), 0) as gastos_totales
      from gasto_negocio
     where id_tenant = auth_tenant_id()
       and fecha >= p_desde and fecha <= p_hasta
  )
  select
    tv.ingresos_totales,
    tl.costo_mercaderia,
    tl.monto_a_proveedores,
    (tv.ingresos_totales - tl.monto_a_proveedores) as ganancia_bruta_real,
    coalesce(tp.ganancia_esperada, 0) as ganancia_bruta_esperada,
    (tv.ingresos_totales - tl.monto_a_proveedores) - coalesce(tp.ganancia_esperada, 0) as impacto_descuentos,
    tg.gastos_totales,
    ((tv.ingresos_totales - tl.monto_a_proveedores) - tg.gastos_totales) as ganancia_neta,
    tv.cant_ventas as cantidad_ventas,
    tl.cant_lineas as cantidad_lineas,
    case
      when tv.cant_ventas = 0 then 0
      else round((tv.ingresos_totales / tv.cant_ventas)::numeric, 2)
    end as ticket_promedio
  from totales_ventas tv
  cross join totales_lineas tl
  cross join totales_gastos tg
  cross join totales_productos tp;
$$;

grant execute on function rf_reporte_financiero(timestamptz, timestamptz) to authenticated;


create or replace function rf_dashboard_kpis() returns table (
  ventas_hoy numeric,
  facturado_hoy numeric,
  ventas_30d numeric,
  facturado_30d numeric,
  rendiciones_pendientes bigint,
  monto_rendiciones_pendientes numeric,
  reservas_activas bigint,
  reservas_vencidas_sin_purgar bigint,
  productos_bajo_minimo bigint,
  items_rotacion_vencida bigint
) language sql stable as $$
  with tenant as (
    select auth_tenant_id() as id
  ),
  -- Hoy y últimos 30 días
  ventas_hoy as (
    select count(*) as cant, coalesce(sum(total), 0) as facturado
      from venta v, tenant t
     where v.id_tenant = t.id
       and v.fecha >= date_trunc('day', now())
       and v.estado_venta = 'registrada'
  ),
  ventas_30d as (
    select count(*) as cant, coalesce(sum(total), 0) as facturado
      from venta v, tenant t
     where v.id_tenant = t.id
       and v.fecha >= now() - interval '30 days'
       and v.estado_venta = 'registrada'
  ),
  -- Rendiciones: pendientes son las que se cerraron (tienen monto)
  -- pero no se pagaron (estado='pendiente'). Lo que está
  -- id_rendicion IS NULL no cuenta para este KPI, está en v_perfil_proveedor.
  rendiciones as (
    select count(*) as cant, coalesce(sum(monto_total), 0) as monto
      from rendicion_proveedor r, tenant t
     where r.id_tenant = t.id
       and r.estado = 'pendiente'
  ),
  -- Reservas
  reservas as (
    select
      count(*) filter (where estado_reserva = 'activa') as activas,
      count(*) filter (where estado_reserva = 'activa' and fecha_vencimiento < now()) as vencidas_sin_purgar
    from reserva r, tenant t
    where r.id_tenant = t.id
  ),
  -- Alertas (sumarios de las vistas)
  bajo_min as (
    select count(*) as cant from v_alerta_reposicion where severidad in ('bajo_minimo', 'sin_stock')
  ),
  rotacion as (
    select count(*) as cant from v_alerta_rotacion_vencida
  )
  select
    vh.cant::numeric,
    vh.facturado,
    v30.cant::numeric,
    v30.facturado,
    r.cant,
    r.monto,
    res.activas,
    res.vencidas_sin_purgar,
    bm.cant,
    rot.cant
  from ventas_hoy vh
  cross join ventas_30d v30
  cross join rendiciones r
  cross join reservas res
  cross join bajo_min bm
  cross join rotacion rot;
$$;

grant execute on function rf_dashboard_kpis() to authenticated;


create or replace function rf_reporte_caja(
  p_desde timestamptz,
  p_hasta timestamptz
) returns table (
  cobrado_total    numeric,
  cobrado_contado  numeric,
  cobrado_cuotas   numeric,
  costo_cobro      numeric,
  neto_acreditado  numeric,
  a_acreditar      numeric,
  cantidad_pagos   bigint
) language sql stable as $$
  select
    coalesce(sum(pv.monto), 0),
    coalesce(sum(pv.monto) filter (where pv.id_cuota_financiada is null), 0),
    coalesce(sum(pv.monto) filter (where pv.id_cuota_financiada is not null), 0),
    coalesce(sum(pv.costo_cobro), 0),
    coalesce(sum(pv.monto - pv.costo_cobro), 0),
    -- Lo cobrado que TODAVÍA no está en la cuenta: tarjeta con plazo.
    coalesce(sum(pv.monto - pv.costo_cobro)
             filter (where pv.fecha_acreditacion > fn_hoy_tenant()), 0),
    count(*)
  from pago_venta pv
  join venta v on v.id_venta = pv.id_venta
 where pv.id_tenant = auth_tenant_id()
   and v.estado_venta = 'registrada'
   and pv.created_at >= p_desde and pv.created_at <= p_hasta;
$$;

grant execute on function rf_reporte_caja(timestamptz, timestamptz) to authenticated;


create or replace function rf_incobrables_periodo(
  p_desde timestamptz,
  p_hasta timestamptz
) returns table (
  monto_incobrable    numeric,
  costo_no_cubierto   numeric,
  cuotas_incobrables  bigint,
  ventas_afectadas    bigint,
  clientes_afectados  bigint
) language sql stable as $$
  with cuotas_periodo as (
    select cf.id_venta,
           cf.id_cliente,
           cf.monto - cf.monto_pagado as saldo
      from cuota_financiada cf
     where cf.id_tenant = auth_tenant_id()
       and cf.estado = 'incobrable'
       and cf.fecha_incobrable >= p_desde
       and cf.fecha_incobrable <= p_hasta
  ),
  ventas as (
    select distinct id_venta from cuotas_periodo
  ),
  -- Costo real de cada venta: lo que se le debe al proveedor si vino en
  -- consignación, lo que salió del bolsillo al comprarla si fue compra.
  costos as (
    select dv.id_venta,
           sum(case when dv.tipo_ingreso_snapshot = 'compra'
                    then dv.costo_snapshot
                    else dv.monto_proveedor end) as costo
      from detalle_venta dv
      join ventas x on x.id_venta = dv.id_venta
     group by dv.id_venta
  ),
  cobros as (
    select pv.id_venta, sum(pv.monto) as cobrado
      from pago_venta pv
      join ventas x on x.id_venta = pv.id_venta
     group by pv.id_venta
  )
  select
    (select coalesce(sum(saldo), 0) from cuotas_periodo),
    (select coalesce(sum(greatest(0, c.costo - coalesce(co.cobrado, 0))), 0)
       from costos c left join cobros co on co.id_venta = c.id_venta),
    (select count(*) from cuotas_periodo),
    (select count(*) from ventas),
    (select count(distinct id_cliente) from cuotas_periodo);
$$;

grant execute on function rf_incobrables_periodo(timestamptz, timestamptz) to authenticated;

*/
