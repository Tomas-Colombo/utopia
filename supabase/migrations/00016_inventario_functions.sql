-- 00016_inventario_functions.sql
-- UP: sp_* audit-wrapped mutation helpers for Etapa 3 (Inventario).
--     Every mutation performs its write + `auditoria` INSERT in the
--     same transaction (REQ-AL-02/03/04). State machine transitions
--     for `item_producto` are enforced here — never by direct UPDATE
--     from the app.
-- DOWN:
--   revoke execute on function sp_confirmar_ingreso(uuid, inet) from authenticated;
--   drop function if exists sp_confirmar_ingreso(uuid, inet);
--   revoke execute on function sp_transicion_item_producto(uuid, estado_item, text, uuid, jsonb, inet) from authenticated;
--   drop function if exists sp_transicion_item_producto(uuid, estado_item, text, uuid, jsonb, inet);
--   revoke execute on function sp_set_costo_producto(uuid, numeric, text, text, inet) from authenticated;
--   drop function if exists sp_set_costo_producto(uuid, numeric, text, text, inet);
--   revoke execute on function sp_create_producto(uuid, text, text, integer, text, inet) from authenticated;
--   drop function if exists sp_create_producto(uuid, text, text, integer, text, inet);
--   drop function if exists is_transicion_item_valida(estado_item, estado_item);

-- ─────────────────────────────────────────────────────────────────
-- STATE MACHINE (Planificacion.txt Etapa 3 §71 "no se puede llevar
-- un ítem a un estado inválido"). Fuente única de verdad de qué
-- transiciones están permitidas. Cualquier UPDATE de estado que no
-- pase por sp_transicion_item_producto se considera bug.
-- ─────────────────────────────────────────────────────────────────
create or replace function is_transicion_item_valida(
  p_desde estado_item, p_hasta estado_item
) returns boolean language sql immutable as $$
  select case
    -- Alta (no hay estado previo): manejado por confirmar_ingreso, no por transición
    when p_desde = 'disponible'       and p_hasta in ('reservado', 'vendido', 'devuelto', 'baja') then true
    when p_desde = 'reservado'        and p_hasta in ('disponible', 'vendido', 'baja') then true
    when p_desde = 'vendido'          and p_hasta in ('devuelto_cliente', 'devuelto', 'baja') then true
    when p_desde = 'devuelto_cliente' and p_hasta in ('disponible', 'baja') then true
    -- 'devuelto' y 'baja' son estados terminales (excepto reingreso manual = nuevo item)
    else false
  end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- sp_create_producto: alta de producto + opcionalmente su primer
-- costo. Devuelve el id_producto.
-- ─────────────────────────────────────────────────────────────────
create or replace function sp_create_producto(
  p_id_categoria uuid,
  p_nombre       text,
  p_sku          text default null,
  p_stock_minimo integer default 0,
  p_descripcion  text default null,
  p_ip           inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_id         uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  insert into producto(id_tenant, id_categoria, nombre, sku, stock_minimo, descripcion)
  values (v_tenant, p_id_categoria, p_nombre, p_sku, coalesce(p_stock_minimo, 0), p_descripcion)
  returning id_producto into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'producto', v_id::text, 'crear',
          jsonb_build_object('nombre', p_nombre, 'sku', p_sku,
                             'id_categoria', p_id_categoria,
                             'stock_minimo', p_stock_minimo),
          p_ip);

  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- sp_set_costo_producto: cierra el costo vigente actual (si existe)
-- y abre uno nuevo. Preserva historial (Planificacion.txt §63,
-- sección 4.3 CostoProducto historizado).
-- ─────────────────────────────────────────────────────────────────
create or replace function sp_set_costo_producto(
  p_id_producto uuid,
  p_costo       numeric,
  p_moneda      text default 'ARS',
  p_motivo      text default null,
  p_ip          inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_id       uuid;
  v_previous numeric;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Cierra vigente actual
  update costo_producto
     set vigente_hasta = now()
   where id_producto = p_id_producto
     and vigente_hasta is null
  returning costo into v_previous;

  -- Nueva fila vigente
  insert into costo_producto(id_tenant, id_producto, costo, moneda,
                             id_usuario_alta, motivo)
  values (v_tenant, p_id_producto, p_costo, coalesce(p_moneda, 'ARS'),
          v_actor, p_motivo)
  returning id_costo into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'costo_producto', v_id::text, 'crear',
          jsonb_build_object('id_producto', p_id_producto,
                             'costo_anterior', v_previous,
                             'costo_nuevo', p_costo,
                             'moneda', coalesce(p_moneda, 'ARS'),
                             'motivo', p_motivo),
          p_ip);

  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- sp_transicion_item_producto: ÚNICO camino permitido para cambiar
-- `estado_item`. Valida contra `is_transicion_item_valida`; graba
-- movimiento_item + auditoria en la misma tx. Falla-cerrado.
-- ─────────────────────────────────────────────────────────────────
create or replace function sp_transicion_item_producto(
  p_id_item        uuid,
  p_estado_hasta   estado_item,
  p_tipo_movimiento text,
  p_referencia_id  uuid default null,
  p_referencia_tipo text default null,
  p_ip             inet default null
) returns void language plpgsql as $$
declare
  v_tenant  uuid := auth_tenant_id();
  v_actor   uuid := auth.uid();
  v_desde   estado_item;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Lock optimista: SELECT ... FOR UPDATE evita carreras
  -- (Etapa 5 §98 "dos escaneos simultáneos no duplican la venta").
  select estado_item into v_desde
    from item_producto
   where id_item = p_id_item and id_tenant = v_tenant
   for update;

  if v_desde is null then
    raise exception 'item-not-found' using errcode = '42704';
  end if;

  if not is_transicion_item_valida(v_desde, p_estado_hasta) then
    raise exception 'invalid-transition: % -> %', v_desde, p_estado_hasta
      using errcode = '22023';
  end if;

  update item_producto
     set estado_item = p_estado_hasta,
         fecha_venta = case when p_estado_hasta = 'vendido' then now() else fecha_venta end,
         fecha_devolucion = case when p_estado_hasta in ('devuelto', 'devuelto_cliente')
                                 then now() else fecha_devolucion end
   where id_item = p_id_item;

  insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                              estado_desde, estado_hasta,
                              referencia_tipo, referencia_id, id_usuario)
  values (v_tenant, p_id_item, p_tipo_movimiento,
          v_desde, p_estado_hasta,
          p_referencia_tipo, p_referencia_id, v_actor);

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'item_producto', p_id_item::text, p_tipo_movimiento,
          jsonb_build_object('desde', v_desde, 'hasta', p_estado_hasta,
                             'referencia', jsonb_build_object('tipo', p_referencia_tipo,
                                                              'id', p_referencia_id)),
          p_ip);
end $$;

-- ─────────────────────────────────────────────────────────────────
-- sp_confirmar_ingreso: convierte un ingreso "borrador" en items
-- físicos. Genera N item_producto (uno por unidad de cada detalle),
-- cada uno con QR único, estado=disponible. Setea confirmado=true.
-- Idempotente: si ya está confirmado, no hace nada.
-- ─────────────────────────────────────────────────────────────────
create or replace function sp_confirmar_ingreso(
  p_id_ingreso uuid,
  p_ip         inet default null
) returns integer language plpgsql as $$
declare
  v_tenant    uuid := auth_tenant_id();
  v_actor     uuid := auth.uid();
  v_confirmado boolean;
  v_tipo      tipo_ingreso;
  v_count     integer := 0;
  v_detalle   record;
  v_i         integer;
  v_qr        text;
  v_new_item  uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select confirmado, tipo_ingreso into v_confirmado, v_tipo
    from ingreso_mercaderia
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant
   for update;

  if v_confirmado is null then
    raise exception 'ingreso-not-found' using errcode = '42704';
  end if;

  if v_confirmado then
    return 0;  -- idempotente
  end if;

  -- Por cada detalle genera N items
  for v_detalle in
    select id_detalle, id_producto, cantidad, costo_unitario
      from ingreso_mercaderia_detalle
     where id_ingreso = p_id_ingreso and id_tenant = v_tenant
  loop
    for v_i in 1 .. v_detalle.cantidad loop
      -- QR global-único: prefijo tenant + timestamp + random.
      -- Formato pensado para escaneo QR + código fallback.
      v_qr := encode(gen_random_bytes(12), 'hex');

      insert into item_producto(id_tenant, id_producto, id_ingreso, id_ingreso_detalle,
                                qr_code, estado_item, costo_ingreso, tipo_ingreso)
      values (v_tenant, v_detalle.id_producto, p_id_ingreso, v_detalle.id_detalle,
              v_qr, 'disponible', v_detalle.costo_unitario, v_tipo)
      returning id_item into v_new_item;

      insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                                  estado_desde, estado_hasta,
                                  referencia_tipo, referencia_id, id_usuario)
      values (v_tenant, v_new_item, 'alta',
              null, 'disponible',
              'ingreso', p_id_ingreso, v_actor);

      v_count := v_count + 1;
    end loop;
  end loop;

  update ingreso_mercaderia
     set confirmado = true
   where id_ingreso = p_id_ingreso;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'ingreso_mercaderia', p_id_ingreso::text, 'confirmar',
          jsonb_build_object('items_generados', v_count, 'tipo_ingreso', v_tipo),
          p_ip);

  return v_count;
end $$;

grant execute on function is_transicion_item_valida(estado_item, estado_item) to authenticated;
grant execute on function sp_create_producto(uuid, text, text, integer, text, inet) to authenticated;
grant execute on function sp_set_costo_producto(uuid, numeric, text, text, inet) to authenticated;
grant execute on function sp_transicion_item_producto(uuid, estado_item, text, uuid, text, inet) to authenticated;
grant execute on function sp_confirmar_ingreso(uuid, inet) to authenticated;
