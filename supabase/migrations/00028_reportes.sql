-- 00028_reportes.sql
-- UP: vistas + RPCs de reportes (Etapa 8). Sin tablas nuevas — todo por
--     query (§L47/L112 explícitos: "resueltos por query, no por tabla nueva").
--
-- Vistas security_invoker=on para respetar RLS del caller (Supabase por
-- default corre las views como el creador si no lo especificás, lo que
-- se saltearía RLS). Con security_invoker=on cada SELECT pasa por las
-- policies del rol authenticated y filtra por auth_tenant_id() vía las
-- policies de las tablas base.
--
-- RPCs (functions) usan STABLE y confían en RLS de las tablas base.

-- ─── RF-07: ganancia por producto ────────────────────────────────────
-- Ganancia unitaria esperada = producto.precio_venta − costo_vigente.
-- Costo vigente = costo_producto donde vigente_hasta IS NULL.

create or replace view v_ganancia_por_producto
with (security_invoker = on) as
select
  p.id_tenant,
  p.id_producto,
  p.nombre,
  p.sku,
  p.id_categoria,
  cat.nombre as categoria_nombre,
  cp.costo as costo_vigente,
  cp.moneda,
  p.precio_venta,
  case
    when p.precio_venta is null or cp.costo is null then null
    else round((p.precio_venta - cp.costo)::numeric, 2)
  end as ganancia_unitaria,
  case
    when p.precio_venta is null or cp.costo is null or cp.costo = 0 then null
    else round(((p.precio_venta - cp.costo) / cp.costo * 100)::numeric, 2)
  end as margen_pct
from producto p
left join categoria cat on cat.id_categoria = p.id_categoria
left join costo_producto cp
  on cp.id_producto = p.id_producto and cp.vigente_hasta is null
where p.activo = true;

grant select on v_ganancia_por_producto to authenticated;

-- ─── RF-12: rotación por producto en rango de fechas ─────────────────
-- Devuelve por producto: unidades vendidas, monto vendido, monto ganancia,
-- ticket promedio. Filtro por rango de fechas + solo ventas registradas.

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

-- ─── RF-11: perfil de proveedor / resumen ────────────────────────────
-- Por proveedor: total consignaciones abiertas, ventas pendientes de
-- rendir (id_rendicion IS NULL), monto pendiente, monto rendido histórico.

create or replace view v_perfil_proveedor
with (security_invoker = on) as
select
  prov.id_tenant,
  prov.id_proveedor,
  prov.nombre,
  prov.tipo,
  prov.telefono,
  prov.dias_rotacion,
  -- Items disponibles del proveedor (stock actual de consignación)
  (select count(*)
     from item_producto ip
     join ingreso_mercaderia im on im.id_ingreso = ip.id_ingreso
    where im.id_proveedor = prov.id_proveedor
      and ip.id_tenant = prov.id_tenant
      and ip.estado_item = 'disponible'
      and ip.tipo_ingreso = 'consignacion'
  )::bigint as items_disponibles,
  -- Consignaciones (lotes de devolución) activas
  (select count(*)
     from consignacion c
    where c.id_proveedor = prov.id_proveedor
      and c.id_tenant = prov.id_tenant
      and c.estado = 'activa'
  )::bigint as consignaciones_activas,
  -- Ventas pendientes de rendir a este proveedor
  (select coalesce(sum(dv.monto_proveedor), 0)
     from detalle_venta dv
     join venta v on v.id_venta = dv.id_venta
    where dv.id_proveedor = prov.id_proveedor
      and dv.id_tenant = prov.id_tenant
      and dv.id_rendicion is null
      and dv.excluida_rendicion = false
      and dv.monto_proveedor > 0
      and v.estado_venta = 'registrada'
  )::numeric as monto_pendiente_rendicion,
  (select count(*)
     from detalle_venta dv
     join venta v on v.id_venta = dv.id_venta
    where dv.id_proveedor = prov.id_proveedor
      and dv.id_tenant = prov.id_tenant
      and dv.id_rendicion is null
      and dv.excluida_rendicion = false
      and dv.monto_proveedor > 0
      and v.estado_venta = 'registrada'
  )::bigint as lineas_pendientes_rendicion,
  -- Rendiciones históricas
  (select coalesce(sum(r.monto_total), 0)
     from rendicion_proveedor r
    where r.id_proveedor = prov.id_proveedor
      and r.id_tenant = prov.id_tenant
  )::numeric as monto_rendido_historico,
  (select count(*)
     from rendicion_proveedor r
    where r.id_proveedor = prov.id_proveedor
      and r.id_tenant = prov.id_tenant
      and r.estado = 'pendiente'
  )::bigint as rendiciones_pendientes_pago
from proveedor prov
where prov.activo = true;

grant select on v_perfil_proveedor to authenticated;

-- ─── RF-13: reporte financiero por período ───────────────────────────
-- Devuelve un solo row con totales del período:
--   - ingresos: sum(venta.total) de ventas registradas
--   - costo_mercaderia: sum(detalle_venta.costo_snapshot)
--   - montos a proveedores: sum(detalle_venta.monto_proveedor) (consignación)
--   - ganancia bruta (real): ingresos - monto_proveedor
--   - ganancia esperada sin descuentos: sum(producto.precio_venta - costo_snapshot)
--     comparada contra ganancia real → impacto de descuentos
--   - gastos: sum(gasto_negocio.monto)
--   - ganancia neta: ganancia bruta - gastos
--
-- Impacto de descuentos §L120: "comparando Producto.precioVenta (proyectado)
-- contra DetalleVenta.precioVenta / montoGanancia (real)".

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
  with ventas_periodo as (
    select v.id_venta, v.total
      from venta v
     where v.id_tenant = auth_tenant_id()
       and v.estado_venta = 'registrada'
       and v.fecha >= p_desde and v.fecha <= p_hasta
  ),
  detalles_periodo as (
    select
      dv.id_detalle_venta,
      dv.precio_venta,
      dv.costo_snapshot,
      dv.monto_proveedor,
      dv.monto_ganancia,
      dv.id_producto
    from detalle_venta dv
    join ventas_periodo vp on vp.id_venta = dv.id_venta
    where dv.id_tenant = auth_tenant_id()
  ),
  -- Ganancia esperada = si NO hubieran habido descuentos, ¿cuánto habría
  -- ganado? Uso producto.precio_venta actual (precio de lista) menos costo
  -- del snapshot de la venta. Es una aproximación: el precio_venta del
  -- producto puede haber cambiado desde entonces. Es lo que dice §L120
  -- ("proyectado" = precio actual).
  ganancia_esperada as (
    select coalesce(sum(
      case
        when p.precio_venta is null then dp.monto_ganancia
        else p.precio_venta - dp.costo_snapshot - dp.monto_proveedor
      end
    ), 0)::numeric as ge
    from detalles_periodo dp
    join producto p on p.id_producto = dp.id_producto
  ),
  gastos_periodo as (
    select coalesce(sum(g.monto), 0)::numeric as total
      from gasto_negocio g
     where g.id_tenant = auth_tenant_id()
       and g.fecha >= p_desde and g.fecha <= p_hasta
  ),
  totales as (
    select
      coalesce(sum(vp.total), 0)::numeric as ingresos,
      count(distinct vp.id_venta)::bigint as cant_ventas
    from ventas_periodo vp
  ),
  totales_det as (
    select
      coalesce(sum(dp.costo_snapshot), 0)::numeric as costo,
      coalesce(sum(dp.monto_proveedor), 0)::numeric as monto_prov,
      coalesce(sum(dp.monto_ganancia), 0)::numeric as ganancia,
      count(*)::bigint as cant_lineas
    from detalles_periodo dp
  )
  select
    t.ingresos as ingresos_totales,
    td.costo as costo_mercaderia,
    td.monto_prov as monto_a_proveedores,
    td.ganancia as ganancia_bruta_real,
    ge.ge as ganancia_bruta_esperada,
    round((ge.ge - td.ganancia)::numeric, 2) as impacto_descuentos,
    gp.total as gastos_totales,
    round((td.ganancia - gp.total)::numeric, 2) as ganancia_neta,
    t.cant_ventas as cantidad_ventas,
    td.cant_lineas as cantidad_lineas,
    case
      when t.cant_ventas = 0 then 0
      else round((t.ingresos / t.cant_ventas)::numeric, 2)
    end as ticket_promedio
  from totales t
  cross join totales_det td
  cross join gastos_periodo gp
  cross join ganancia_esperada ge;
$$;

grant execute on function rf_reporte_financiero(timestamptz, timestamptz) to authenticated;

-- ─── ALERTA: reposición (stock bajo) — §L103 ─────────────────────────
-- Productos con conteo de items 'disponible' < stock_minimo.
-- Crítica: se muestra en Dashboard y en /inventario con jerarquía alta.

create or replace view v_alerta_reposicion
with (security_invoker = on) as
select
  p.id_tenant,
  p.id_producto,
  p.nombre,
  p.sku,
  p.stock_minimo,
  coalesce(cnt.disponibles, 0)::bigint as disponibles,
  case
    when coalesce(cnt.disponibles, 0) = 0 then 'sin_stock'
    else 'bajo_minimo'
  end as severidad
from producto p
left join (
  select id_producto, count(*)::bigint as disponibles
    from item_producto
   where estado_item = 'disponible'
   group by id_producto
) cnt on cnt.id_producto = p.id_producto
where p.activo = true
  and p.stock_minimo > 0
  and coalesce(cnt.disponibles, 0) < p.stock_minimo;

grant select on v_alerta_reposicion to authenticated;

-- ─── ALERTA: rotación vencida (consignación) — §L104 ─────────────────
-- Solo items tipo_ingreso='consignacion' cuyo (fecha_ingreso + dias_rotacion)
-- < now() y siguen disponible. proveedores con dias_rotacion NULL no
-- generan alerta.

create or replace view v_alerta_rotacion_vencida
with (security_invoker = on) as
select
  ip.id_tenant,
  ip.id_item,
  ip.qr_code,
  ip.id_producto,
  p.nombre as producto_nombre,
  p.sku as producto_sku,
  ip.fecha_ingreso,
  prov.id_proveedor,
  prov.nombre as proveedor_nombre,
  prov.dias_rotacion,
  extract(day from (now() - ip.fecha_ingreso))::integer as dias_transcurridos,
  extract(day from (now() - ip.fecha_ingreso))::integer - prov.dias_rotacion as dias_excedidos
from item_producto ip
join producto p on p.id_producto = ip.id_producto
join ingreso_mercaderia im on im.id_ingreso = ip.id_ingreso
join proveedor prov on prov.id_proveedor = im.id_proveedor
where ip.estado_item = 'disponible'
  and ip.tipo_ingreso = 'consignacion'
  and prov.dias_rotacion is not null
  and prov.dias_rotacion > 0
  and (ip.fecha_ingreso + (prov.dias_rotacion || ' days')::interval) < now();

grant select on v_alerta_rotacion_vencida to authenticated;

-- ─── Dashboard KPIs helper ───────────────────────────────────────────
-- Un solo llamado devuelve todo lo que el dashboard necesita del "hoy":
-- ventas del día, monto facturado hoy, monto vendido en los últimos 30
-- días, rendiciones pendientes de pago, alertas activas.

create or replace function rf_dashboard_kpis() returns table (
  ventas_hoy bigint,
  facturado_hoy numeric,
  ventas_30d bigint,
  facturado_30d numeric,
  rendiciones_pendientes bigint,
  monto_rendiciones_pendientes numeric,
  reservas_activas bigint,
  reservas_vencidas_sin_purgar bigint,
  productos_bajo_minimo bigint,
  items_rotacion_vencida bigint
) language sql stable as $$
  select
    (select count(*) from venta
      where id_tenant = auth_tenant_id() and estado_venta = 'registrada'
        and fecha >= date_trunc('day', now()))::bigint,
    (select coalesce(sum(total), 0) from venta
      where id_tenant = auth_tenant_id() and estado_venta = 'registrada'
        and fecha >= date_trunc('day', now()))::numeric,
    (select count(*) from venta
      where id_tenant = auth_tenant_id() and estado_venta = 'registrada'
        and fecha >= now() - interval '30 days')::bigint,
    (select coalesce(sum(total), 0) from venta
      where id_tenant = auth_tenant_id() and estado_venta = 'registrada'
        and fecha >= now() - interval '30 days')::numeric,
    (select count(*) from rendicion_proveedor
      where id_tenant = auth_tenant_id() and estado = 'pendiente')::bigint,
    (select coalesce(sum(monto_total), 0) from rendicion_proveedor
      where id_tenant = auth_tenant_id() and estado = 'pendiente')::numeric,
    (select count(*) from reserva
      where id_tenant = auth_tenant_id() and estado_reserva = 'activa')::bigint,
    (select count(*) from reserva
      where id_tenant = auth_tenant_id() and estado_reserva = 'activa'
        and fecha_vencimiento < now())::bigint,
    (select count(*) from v_alerta_reposicion)::bigint,
    (select count(*) from v_alerta_rotacion_vencida)::bigint;
$$;

grant execute on function rf_dashboard_kpis() to authenticated;

-- DOWN:
--   drop function if exists rf_dashboard_kpis();
--   drop view if exists v_alerta_rotacion_vencida;
--   drop view if exists v_alerta_reposicion;
--   drop function if exists rf_reporte_financiero(timestamptz, timestamptz);
--   drop view if exists v_perfil_proveedor;
--   drop function if exists rf_rotacion_por_producto(timestamptz, timestamptz, uuid);
--   drop view if exists v_ganancia_por_producto;
