-- Migración 00071: Devolución de cliente con reintegro y rendición modificada (Slice 6)

-- ─── sp_registrar_devolucion_cliente ─────────────────────────────────

drop function if exists sp_registrar_devolucion_cliente(uuid, text, inet);

create or replace function sp_registrar_devolucion_cliente(
  p_id_detalle_venta    uuid,
  p_motivo              text default null,
  p_id_cuenta_reintegro uuid default null,
  p_medio_reintegro     medio_pago default null,
  p_ip                  inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant            uuid := auth_tenant_id();
  v_actor             uuid := auth.uid();
  v_id_item           uuid;
  v_id_venta          uuid;
  v_id_devolucion     uuid;
  v_estado_item       estado_item;
  v_estado_venta      estado_venta;
  v_total_venta       numeric(14,2);
  v_precio_venta      numeric(14,2);
  v_costo_snapshot    numeric(14,2);
  v_sum_pagos         numeric(14,2);
  v_sum_dev_previas   numeric(14,2);
  v_sum_reint_previos numeric(14,2);
  v_reintegro         numeric(14,2) := 0;
  v_cuotas_abiertas   boolean;
  v_ya_devuelta       boolean;
  v_ya_rendida        boolean;
begin
  -- Lock del item_producto y lectura de detalle_venta
  select dv.id_item, ip.estado_item, dv.id_venta, dv.precio_venta, dv.costo_snapshot, dv.id_rendicion is not null
    into v_id_item, v_estado_item, v_id_venta, v_precio_venta, v_costo_snapshot, v_ya_rendida
    from detalle_venta dv
    join item_producto ip on ip.id_item = dv.id_item
   where dv.id_detalle_venta = p_id_detalle_venta
     and dv.id_tenant = v_tenant
   for update of ip;

  if v_id_item is null then
    raise exception 'detalle-venta-not-found' using errcode = '42704';
  end if;

  if v_estado_item <> 'vendido' then
    raise exception 'item-no-esta-vendido: estado=%', v_estado_item using errcode = '22023';
  end if;

  if v_ya_rendida then
    raise exception 'detalle-ya-rendido' using errcode = '22023';
  end if;

  select exists(
    select 1 from devolucion_venta
     where id_detalle_venta = p_id_detalle_venta
  ) into v_ya_devuelta;

  if v_ya_devuelta then
    raise exception 'detalle-ya-devuelto' using errcode = '22023';
  end if;

  select estado_venta, total into v_estado_venta, v_total_venta
    from venta
   where id_venta = v_id_venta for update;

  if v_estado_venta = 'anulada' then
    raise exception 'venta-anulada' using errcode = '22023';
  end if;

  select exists(
    select 1 from cuota_financiada
     where id_venta = v_id_venta and estado in ('pendiente', 'parcial')
  ) into v_cuotas_abiertas;

  if v_cuotas_abiertas then
    raise exception 'devolucion-venta-con-cuotas-abiertas' using errcode = '22023';
  end if;

  -- Calcular reintegro
  select coalesce(sum(monto), 0) into v_sum_pagos
    from pago_venta where id_venta = v_id_venta;

  select coalesce(sum(dv.precio_venta), 0) into v_sum_dev_previas
    from devolucion_venta dev
    join detalle_venta dv on dv.id_detalle_venta = dev.id_detalle_venta
   where dev.id_venta = v_id_venta;

  select coalesce(sum(monto), 0) into v_sum_reint_previos
    from reintegro_cliente
   where id_venta = v_id_venta;

  v_reintegro := greatest(0::numeric, v_sum_pagos - (v_total_venta - v_sum_dev_previas - v_precio_venta) - v_sum_reint_previos);

  if v_reintegro > 0 and (p_id_cuenta_reintegro is null or p_medio_reintegro is null) then
    raise exception 'reintegro-requiere-cuenta-y-medio' using errcode = '22023';
  end if;

  -- Insertar devolucion_venta
  insert into devolucion_venta (
    id_tenant, id_venta, id_detalle_venta, id_item,
    monto, costo_recuperado, motivo, id_usuario
  ) values (
    v_tenant, v_id_venta, p_id_detalle_venta, v_id_item,
    v_precio_venta, v_costo_snapshot, p_motivo, v_actor
  ) returning id_devolucion into v_id_devolucion;

  -- Insertar reintegro_cliente si corresponde
  if v_reintegro > 0 then
    insert into reintegro_cliente (
      id_tenant, id_venta, id_devolucion, id_cuenta_destino,
      medio, monto, origen, motivo, id_usuario
    ) values (
      v_tenant, v_id_venta, v_id_devolucion, p_id_cuenta_reintegro,
      p_medio_reintegro, v_reintegro, 'devolucion', p_motivo, v_actor
    );
  end if;

  -- Transicionar item
  perform sp_transicion_item_producto(
    v_id_item, 'devuelto_cliente', 'ajuste',
    p_id_detalle_venta, 'devolucion_cliente', p_ip
  );

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'detalle_venta', p_id_detalle_venta::text, 'devolucion_cliente',
          jsonb_build_object('motivo', p_motivo, 'reintegro', v_reintegro), p_ip);

  return jsonb_build_object('reintegro', v_reintegro);
end $$;

grant execute on function sp_registrar_devolucion_cliente(uuid, text, uuid, medio_pago, inet) to authenticated;

-- ─── sp_generar_rendicion ────────────────────────────────────────────

create or replace function sp_generar_rendicion(
  p_id_proveedor  uuid,
  p_observaciones text default null,
  p_ip            inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_id       uuid;
  v_total    numeric(14, 2);
  v_count    integer;
  v_desde    timestamptz;
  v_hasta    timestamptz;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Modificado para excluir devueltos
  select
    coalesce(sum(dv.monto_proveedor), 0),
    count(*),
    min(v.fecha),
    max(v.fecha)
  into v_total, v_count, v_desde, v_hasta
  from detalle_venta dv
  join venta v on v.id_venta = dv.id_venta
  left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
  where dv.id_tenant = v_tenant
    and dv.id_proveedor = p_id_proveedor
    and dv.id_rendicion is null
    and dv.excluida_rendicion = false
    and dv.monto_proveedor > 0
    and v.estado_venta = 'registrada'
    and dev.id_devolucion is null; -- EXCLUIR DEVUELTOS

  if v_count = 0 then
    raise exception 'sin-lineas-pendientes' using errcode = '22023';
  end if;

  insert into rendicion_proveedor(
    id_tenant, id_proveedor, id_usuario_alta,
    periodo_desde, periodo_hasta,
    monto_total, cantidad_lineas, observaciones
  ) values (
    v_tenant, p_id_proveedor, v_actor,
    v_desde, v_hasta,
    v_total, v_count, p_observaciones
  ) returning id_rendicion into v_id;

  update detalle_venta dv
     set id_rendicion = v_id
   from venta v
   left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
   where v.id_venta = dv.id_venta
     and dv.id_tenant = v_tenant
     and dv.id_proveedor = p_id_proveedor
     and dv.id_rendicion is null
     and dv.excluida_rendicion = false
     and dv.monto_proveedor > 0
     and v.estado_venta = 'registrada'
     and dev.id_devolucion is null; -- EXCLUIR DEVUELTOS

  select coalesce(sum(monto_proveedor), 0), count(*)
    into v_total, v_count
    from detalle_venta
   where id_rendicion = v_id;

  update rendicion_proveedor
     set monto_total = v_total, cantidad_lineas = v_count
   where id_rendicion = v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'rendicion_proveedor', v_id::text, 'generar',
          jsonb_build_object('id_proveedor', p_id_proveedor,
                             'monto_total', v_total,
                             'cantidad_lineas', v_count,
                             'periodo_desde', v_desde,
                             'periodo_hasta', v_hasta),
          p_ip);
  return v_id;
end $$;

-- ─── preview_rendicion ───────────────────────────────────────────────

create or replace function preview_rendicion(
  p_id_proveedor uuid
) returns table (
  id_detalle_venta uuid,
  id_venta         uuid,
  fecha            timestamptz,
  producto_nombre  text,
  producto_sku     text,
  qr_code          text,
  precio_venta     numeric,
  costo_snapshot   numeric,
  monto_proveedor  numeric,
  cliente_nombre   text
) language sql stable as $$
  select
    dv.id_detalle_venta,
    v.id_venta,
    v.fecha,
    p.nombre  as producto_nombre,
    p.sku     as producto_sku,
    ip.qr_code,
    dv.precio_venta,
    dv.costo_snapshot,
    dv.monto_proveedor,
    c.nombre  as cliente_nombre
  from detalle_venta dv
  join venta v          on v.id_venta = dv.id_venta
  join producto p       on p.id_producto = dv.id_producto
  join item_producto ip on ip.id_item = dv.id_item
  left join cliente c   on c.id_cliente = v.id_cliente
  left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
  where dv.id_tenant = auth_tenant_id()
    and dv.id_proveedor = p_id_proveedor
    and dv.id_rendicion is null
    and dv.excluida_rendicion = false
    and dv.monto_proveedor > 0
    and v.estado_venta = 'registrada'
    and dev.id_devolucion is null -- EXCLUIR DEVUELTOS
  order by v.fecha asc;
$$;

-- ─── v_perfil_proveedor ──────────────────────────────────────────────

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
  -- Ventas pendientes de rendir a este proveedor (EXCLUYE DEVUELTOS)
  (select coalesce(sum(dv.monto_proveedor), 0)
     from detalle_venta dv
     join venta v on v.id_venta = dv.id_venta
     left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
    where dv.id_proveedor = prov.id_proveedor
      and dv.id_tenant = prov.id_tenant
      and dv.id_rendicion is null
      and dv.excluida_rendicion = false
      and dv.monto_proveedor > 0
      and v.estado_venta = 'registrada'
      and dev.id_devolucion is null
  )::numeric as monto_pendiente_rendicion,
  (select count(*)
     from detalle_venta dv
     join venta v on v.id_venta = dv.id_venta
     left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
    where dv.id_proveedor = prov.id_proveedor
      and dv.id_tenant = prov.id_tenant
      and dv.id_rendicion is null
      and dv.excluida_rendicion = false
      and dv.monto_proveedor > 0
      and v.estado_venta = 'registrada'
      and dev.id_devolucion is null
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

-- ─── DOWN ────────────────────────────────────────────────────────────
-- DOWN:
-- 
-- -- Restaurar v_perfil_proveedor original (sin left join devolucion_venta)
-- create or replace view v_perfil_proveedor
-- with (security_invoker = on) as
-- select
--   prov.id_tenant,
--   prov.id_proveedor,
--   prov.nombre,
--   prov.tipo,
--   prov.telefono,
--   prov.dias_rotacion,
--   (select count(*)
--      from item_producto ip
--      join ingreso_mercaderia im on im.id_ingreso = ip.id_ingreso
--     where im.id_proveedor = prov.id_proveedor
--       and ip.id_tenant = prov.id_tenant
--       and ip.estado_item = 'disponible'
--       and ip.tipo_ingreso = 'consignacion'
--   )::bigint as items_disponibles,
--   (select count(*)
--      from consignacion c
--     where c.id_proveedor = prov.id_proveedor
--       and c.id_tenant = prov.id_tenant
--       and c.estado = 'activa'
--   )::bigint as consignaciones_activas,
--   (select coalesce(sum(dv.monto_proveedor), 0)
--      from detalle_venta dv
--      join venta v on v.id_venta = dv.id_venta
--     where dv.id_proveedor = prov.id_proveedor
--       and dv.id_tenant = prov.id_tenant
--       and dv.id_rendicion is null
--       and dv.excluida_rendicion = false
--       and dv.monto_proveedor > 0
--       and v.estado_venta = 'registrada'
--   )::numeric as monto_pendiente_rendicion,
--   (select count(*)
--      from detalle_venta dv
--      join venta v on v.id_venta = dv.id_venta
--     where dv.id_proveedor = prov.id_proveedor
--       and dv.id_tenant = prov.id_tenant
--       and dv.id_rendicion is null
--       and dv.excluida_rendicion = false
--       and dv.monto_proveedor > 0
--       and v.estado_venta = 'registrada'
--   )::bigint as lineas_pendientes_rendicion,
--   (select coalesce(sum(r.monto_total), 0)
--      from rendicion_proveedor r
--     where r.id_proveedor = prov.id_proveedor
--       and r.id_tenant = prov.id_tenant
--   )::numeric as monto_rendido_historico,
--   (select count(*)
--      from rendicion_proveedor r
--     where r.id_proveedor = prov.id_proveedor
--       and r.id_tenant = prov.id_tenant
--       and r.estado = 'pendiente'
--   )::bigint as rendiciones_pendientes_pago
-- from proveedor prov
-- where prov.activo = true;
-- 
-- -- Restaurar preview_rendicion original (sin left join devolucion_venta)
-- create or replace function preview_rendicion(
--   p_id_proveedor uuid
-- ) returns table (
--   id_detalle_venta uuid,
--   id_venta         uuid,
--   fecha            timestamptz,
--   producto_nombre  text,
--   producto_sku     text,
--   qr_code          text,
--   precio_venta     numeric,
--   costo_snapshot   numeric,
--   monto_proveedor  numeric,
--   cliente_nombre   text
-- ) language sql stable as $$
--   select
--     dv.id_detalle_venta,
--     v.id_venta,
--     v.fecha,
--     p.nombre  as producto_nombre,
--     p.sku     as producto_sku,
--     ip.qr_code,
--     dv.precio_venta,
--     dv.costo_snapshot,
--     dv.monto_proveedor,
--     c.nombre  as cliente_nombre
--   from detalle_venta dv
--   join venta v          on v.id_venta = dv.id_venta
--   join producto p       on p.id_producto = dv.id_producto
--   join item_producto ip on ip.id_item = dv.id_item
--   left join cliente c   on c.id_cliente = v.id_cliente
--   where dv.id_tenant = auth_tenant_id()
--     and dv.id_proveedor = p_id_proveedor
--     and dv.id_rendicion is null
--     and dv.excluida_rendicion = false
--     and dv.monto_proveedor > 0
--     and v.estado_venta = 'registrada'
--   order by v.fecha asc;
-- $$;
-- 
-- -- Restaurar sp_generar_rendicion original (sin left join devolucion_venta)
-- create or replace function sp_generar_rendicion(
--   p_id_proveedor  uuid,
--   p_observaciones text default null,
--   p_ip            inet default null
-- ) returns uuid language plpgsql as $$
-- declare
--   v_tenant   uuid := auth_tenant_id();
--   v_actor    uuid := auth.uid();
--   v_id       uuid;
--   v_total    numeric(14, 2);
--   v_count    integer;
--   v_desde    timestamptz;
--   v_hasta    timestamptz;
-- begin
--   if v_tenant is null then
--     raise exception 'no-tenant' using errcode = '42501';
--   end if;
-- 
--   select coalesce(sum(dv.monto_proveedor), 0), count(*), min(v.fecha), max(v.fecha)
--   into v_total, v_count, v_desde, v_hasta
--   from detalle_venta dv
--   join venta v on v.id_venta = dv.id_venta
--   where dv.id_tenant = v_tenant
--     and dv.id_proveedor = p_id_proveedor
--     and dv.id_rendicion is null
--     and dv.excluida_rendicion = false
--     and dv.monto_proveedor > 0
--     and v.estado_venta = 'registrada';
-- 
--   if v_count = 0 then
--     raise exception 'sin-lineas-pendientes' using errcode = '22023';
--   end if;
-- 
--   insert into rendicion_proveedor(
--     id_tenant, id_proveedor, id_usuario_alta,
--     periodo_desde, periodo_hasta, monto_total, cantidad_lineas, observaciones
--   ) values (
--     v_tenant, p_id_proveedor, v_actor,
--     v_desde, v_hasta, v_total, v_count, p_observaciones
--   ) returning id_rendicion into v_id;
-- 
--   update detalle_venta dv
--      set id_rendicion = v_id
--    from venta v
--    where v.id_venta = dv.id_venta
--      and dv.id_tenant = v_tenant
--      and dv.id_proveedor = p_id_proveedor
--      and dv.id_rendicion is null
--      and dv.excluida_rendicion = false
--      and dv.monto_proveedor > 0
--      and v.estado_venta = 'registrada';
-- 
--   select coalesce(sum(monto_proveedor), 0), count(*)
--     into v_total, v_count
--     from detalle_venta
--    where id_rendicion = v_id;
-- 
--   update rendicion_proveedor
--      set monto_total = v_total, cantidad_lineas = v_count
--    where id_rendicion = v_id;
-- 
--   insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
--   values (v_tenant, v_actor, 'rendicion_proveedor', v_id::text, 'generar',
--           jsonb_build_object('id_proveedor', p_id_proveedor, 'monto_total', v_total,
--                              'cantidad_lineas', v_count, 'periodo_desde', v_desde, 'periodo_hasta', v_hasta),
--           p_ip);
--   return v_id;
-- end $$;
-- 
-- -- Restaurar sp_registrar_devolucion_cliente (firma void)
-- drop function if exists sp_registrar_devolucion_cliente(uuid, text, uuid, medio_pago, inet);
-- 
-- create or replace function sp_registrar_devolucion_cliente(
--   p_id_detalle_venta uuid,
--   p_motivo           text default null,
--   p_ip               inet default null
-- ) returns void language plpgsql as $$
-- declare
--   v_tenant  uuid := auth_tenant_id();
--   v_actor   uuid := auth.uid();
--   v_id_item uuid;
--   v_estado  estado_item;
-- begin
--   select dv.id_item, ip.estado_item
--     into v_id_item, v_estado
--     from detalle_venta dv
--     join item_producto ip on ip.id_item = dv.id_item
--    where dv.id_detalle_venta = p_id_detalle_venta
--      and dv.id_tenant = v_tenant
--    for update of ip;
-- 
--   if v_id_item is null then
--     raise exception 'detalle-venta-not-found' using errcode = '42704';
--   end if;
--   if v_estado <> 'vendido' then
--     raise exception 'item-no-esta-vendido: estado=%', v_estado using errcode = '22023';
--   end if;
-- 
--   perform sp_transicion_item_producto(
--     v_id_item, 'devuelto_cliente', 'ajuste',
--     p_id_detalle_venta, 'devolucion_cliente', p_ip
--   );
-- 
--   insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
--   values (v_tenant, v_actor, 'detalle_venta', p_id_detalle_venta::text, 'devolucion_cliente',
--           jsonb_build_object('motivo', p_motivo), p_ip);
-- end $$;
-- 
-- grant execute on function sp_registrar_devolucion_cliente(uuid, text, inet) to authenticated;
