-- 00025_consignacion_functions.sql
-- UP: sp_* de consignación (Etapa 6). Todos con FOR UPDATE + audit +
--     movimiento_item apropiado.
--
-- Contenido:
--   sp_crear_consignacion            — crea lote vacío para un proveedor.
--   sp_agregar_item_consignacion     — aparta un item (crea consignacion_detalle
--                                       + movimiento_item tipo='consignacion').
--                                       Item SIGUE 'disponible' físicamente.
--   sp_cancelar_item_consignacion    — libera un item apartado sin confirmar salida.
--   sp_confirmar_salida_item         — item sale físicamente:
--                                       consignacion_detalle→'devuelto',
--                                       movimiento_item tipo='devolucion',
--                                       item transiciona 'disponible'→'devuelto'.
--   sp_cerrar_consignacion           — cierra el lote (estado='cerrada').
--                                       No permite si quedan detalles 'pendiente'.
--   sp_registrar_ajuste_inventario   — diferencia stock sistema vs conteo real
--                                       (§L86); crea movimiento tipo='ajuste_inventario'
--                                       con diferencia jsonb {cantidad_sistema,
--                                       cantidad_contada, diferencia, observaciones}.
--                                       Opcionalmente transiciona item a 'baja'.
-- DOWN: drops en orden inverso al final.

create or replace function sp_crear_consignacion(
  p_id_proveedor  uuid,
  p_observaciones text default null,
  p_ip            inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  insert into consignacion(id_tenant, id_proveedor, id_usuario_alta, observaciones)
  values (v_tenant, p_id_proveedor, v_actor, p_observaciones)
  returning id_consignacion into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'consignacion', v_id::text, 'crear',
          jsonb_build_object('id_proveedor', p_id_proveedor,
                             'observaciones', p_observaciones),
          p_ip);
  return v_id;
end $$;

-- ─── APARTAR ITEM ────────────────────────────────────────────────────

create or replace function sp_agregar_item_consignacion(
  p_id_consignacion uuid,
  p_id_item         uuid,
  p_motivo          text default null,
  p_ip              inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant           uuid := auth_tenant_id();
  v_actor            uuid := auth.uid();
  v_estado_cons      estado_consignacion;
  v_id_proveedor_cons uuid;
  v_item             item_producto;
  v_id_proveedor_item uuid;
  v_id_detalle       uuid;
  v_ya_pendiente     boolean;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Lock consignación + validar estado
  select estado, id_proveedor into v_estado_cons, v_id_proveedor_cons
    from consignacion
   where id_consignacion = p_id_consignacion and id_tenant = v_tenant
   for update;
  if v_estado_cons is null then
    raise exception 'consignacion-not-found' using errcode = '42704';
  end if;
  if v_estado_cons <> 'activa' then
    raise exception 'consignacion-no-activa' using errcode = '22023';
  end if;

  -- Lock item + validar
  select * into v_item
    from item_producto
   where id_item = p_id_item and id_tenant = v_tenant
   for update;
  if v_item.id_item is null then
    raise exception 'item-not-found: %', p_id_item using errcode = '42704';
  end if;
  if v_item.estado_item <> 'disponible' then
    raise exception 'item-no-disponible: % (estado=%)',
      p_id_item, v_item.estado_item using errcode = '22023';
  end if;
  if v_item.tipo_ingreso <> 'consignacion' then
    raise exception 'item-no-es-consignacion: % (tipo_ingreso=%)',
      p_id_item, v_item.tipo_ingreso using errcode = '22023';
  end if;

  -- Validar que el item viene del proveedor de esta consignación
  select im.id_proveedor into v_id_proveedor_item
    from ingreso_mercaderia im
   where im.id_ingreso = v_item.id_ingreso;
  if v_id_proveedor_item is null or v_id_proveedor_item <> v_id_proveedor_cons then
    raise exception 'item-otro-proveedor: %', p_id_item using errcode = '22023';
  end if;

  -- Chequeo explícito de "1 consignación pendiente por item" (§L41).
  -- El partial unique index también atajará, pero este raise da error
  -- semántico mejor que el 23505 crudo.
  select exists(
    select 1 from consignacion_detalle
     where id_item = p_id_item and estado = 'pendiente'
  ) into v_ya_pendiente;
  if v_ya_pendiente then
    raise exception 'item-ya-en-consignacion-pendiente: %', p_id_item using errcode = '23505';
  end if;

  -- Chequeo: no se puede apartar un item que está en reserva activa
  if exists(
    select 1 from detalle_reserva
     where id_item = p_id_item and estado = 'activa'
  ) then
    raise exception 'item-en-reserva: %', p_id_item using errcode = '22023';
  end if;

  insert into consignacion_detalle(
    id_tenant, id_consignacion, id_item, id_producto, motivo
  ) values (
    v_tenant, p_id_consignacion, p_id_item, v_item.id_producto, p_motivo
  ) returning id_consignacion_detalle into v_id_detalle;

  -- Movimiento "aparté" (item SIGUE 'disponible' físicamente).
  insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                              estado_desde, estado_hasta,
                              referencia_tipo, referencia_id, id_usuario)
  values (v_tenant, p_id_item, 'consignacion',
          v_item.estado_item, v_item.estado_item,
          'consignacion_detalle', v_id_detalle, v_actor);

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'consignacion_detalle', v_id_detalle::text, 'apartar',
          jsonb_build_object('id_item', p_id_item,
                             'id_consignacion', p_id_consignacion,
                             'motivo', p_motivo),
          p_ip);
  return v_id_detalle;
end $$;

-- ─── CANCELAR ITEM (antes de salir) ──────────────────────────────────

create or replace function sp_cancelar_item_consignacion(
  p_id_detalle uuid,
  p_motivo     text default null,
  p_ip         inet default null
) returns void language plpgsql as $$
declare
  v_tenant  uuid := auth_tenant_id();
  v_actor   uuid := auth.uid();
  v_estado  estado_consignacion_detalle;
  v_id_item uuid;
begin
  select estado, id_item into v_estado, v_id_item
    from consignacion_detalle
   where id_consignacion_detalle = p_id_detalle and id_tenant = v_tenant
   for update;
  if v_estado is null then
    raise exception 'detalle-not-found' using errcode = '42704';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'detalle-no-pendiente: estado=%', v_estado using errcode = '22023';
  end if;

  update consignacion_detalle
     set estado = 'cancelado',
         fecha_devolucion = null
   where id_consignacion_detalle = p_id_detalle;

  insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                              estado_desde, estado_hasta,
                              referencia_tipo, referencia_id, id_usuario)
  select v_tenant, v_id_item, 'ajuste',
         estado_item, estado_item,
         'consignacion_detalle', p_id_detalle, v_actor
    from item_producto where id_item = v_id_item;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'consignacion_detalle', p_id_detalle::text, 'cancelar',
          jsonb_build_object('motivo', p_motivo), p_ip);
end $$;

-- ─── CONFIRMAR SALIDA (el segundo movimiento) ────────────────────────

create or replace function sp_confirmar_salida_item(
  p_id_detalle uuid,
  p_ip         inet default null
) returns void language plpgsql as $$
declare
  v_tenant  uuid := auth_tenant_id();
  v_actor   uuid := auth.uid();
  v_estado  estado_consignacion_detalle;
  v_id_item uuid;
begin
  select estado, id_item into v_estado, v_id_item
    from consignacion_detalle
   where id_consignacion_detalle = p_id_detalle and id_tenant = v_tenant
   for update;
  if v_estado is null then
    raise exception 'detalle-not-found' using errcode = '42704';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'detalle-no-pendiente: estado=%', v_estado using errcode = '22023';
  end if;

  -- 1) transicionar item a 'devuelto' (§L83). Este RPC crea SU PROPIO
  --    movimiento_item tipo='devolucion' vía la máquina de estados.
  --    Le pasamos p_tipo_movimiento='devolucion' para que quede así en
  --    movimiento_item — es el "ya salió" del §L85.
  perform sp_transicion_item_producto(
    v_id_item, 'devuelto', 'devolucion',
    p_id_detalle, 'consignacion_detalle', p_ip
  );

  -- 2) marcar detalle como devuelto con fecha
  update consignacion_detalle
     set estado = 'devuelto',
         fecha_devolucion = now()
   where id_consignacion_detalle = p_id_detalle;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'consignacion_detalle', p_id_detalle::text, 'confirmar_salida',
          jsonb_build_object('id_item', v_id_item), p_ip);
end $$;

-- ─── CERRAR CONSIGNACIÓN ─────────────────────────────────────────────

create or replace function sp_cerrar_consignacion(
  p_id_consignacion uuid,
  p_ip              inet default null
) returns void language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_estado     estado_consignacion;
  v_pendientes integer;
begin
  select estado into v_estado
    from consignacion
   where id_consignacion = p_id_consignacion and id_tenant = v_tenant
   for update;
  if v_estado is null then
    raise exception 'consignacion-not-found' using errcode = '42704';
  end if;
  if v_estado = 'cerrada' then
    return; -- idempotente
  end if;

  select count(*) into v_pendientes
    from consignacion_detalle
   where id_consignacion = p_id_consignacion and estado = 'pendiente';
  if v_pendientes > 0 then
    raise exception 'quedan-pendientes: %', v_pendientes using errcode = '22023';
  end if;

  update consignacion
     set estado = 'cerrada', fecha_cierre = now()
   where id_consignacion = p_id_consignacion;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'consignacion', p_id_consignacion::text, 'cerrar',
          '{}'::jsonb, p_ip);
end $$;

-- ─── AJUSTE DE INVENTARIO (§L86) ─────────────────────────────────────
-- Registra una diferencia stock sistema vs conteo real. Se persiste como
-- movimiento_item tipo='ajuste_inventario' con `diferencia` jsonb.
-- Si p_dar_de_baja=true, el item pasa a 'baja' (típico caso: no está
-- físicamente porque se perdió/robó).

create or replace function sp_registrar_ajuste_inventario(
  p_id_item          uuid,
  p_cantidad_sistema integer,
  p_cantidad_contada integer,
  p_observaciones    text,
  p_dar_de_baja      boolean default false,
  p_ip               inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_diferencia integer := coalesce(p_cantidad_contada, 0) - coalesce(p_cantidad_sistema, 0);
  v_item       item_producto;
  v_id_mov     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_observaciones is null or trim(p_observaciones) = '' then
    raise exception 'observaciones-requeridas' using errcode = '22023';
  end if;

  select * into v_item from item_producto
   where id_item = p_id_item and id_tenant = v_tenant
   for update;
  if v_item.id_item is null then
    raise exception 'item-not-found' using errcode = '42704';
  end if;

  -- Si van a dar de baja: la transición se hace vía state machine (que
  -- crea SU propio movimiento_item). Después registramos otro movimiento
  -- tipo='ajuste_inventario' con la diferencia. Son dos movimientos
  -- válidos (baja + ajuste_inventario) — cada uno documenta un aspecto.
  if p_dar_de_baja then
    if v_item.estado_item not in ('disponible', 'devuelto_cliente') then
      raise exception 'item-no-puede-darse-de-baja: estado=%', v_item.estado_item
        using errcode = '22023';
    end if;
    perform sp_transicion_item_producto(
      p_id_item, 'baja', 'baja', null, 'ajuste_inventario', p_ip
    );
  end if;

  insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                              estado_desde, estado_hasta,
                              referencia_tipo, referencia_id, diferencia, id_usuario)
  values (v_tenant, p_id_item, 'ajuste_inventario',
          v_item.estado_item,
          case when p_dar_de_baja then 'baja'::estado_item else v_item.estado_item end,
          'ajuste', null,
          jsonb_build_object(
            'cantidad_sistema', p_cantidad_sistema,
            'cantidad_contada', p_cantidad_contada,
            'diferencia', v_diferencia,
            'observaciones', p_observaciones,
            'dado_de_baja', p_dar_de_baja
          ),
          v_actor)
  returning id_movimiento into v_id_mov;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'item_producto', p_id_item::text, 'ajuste_inventario',
          jsonb_build_object(
            'cantidad_sistema', p_cantidad_sistema,
            'cantidad_contada', p_cantidad_contada,
            'diferencia', v_diferencia,
            'dado_de_baja', p_dar_de_baja,
            'observaciones', p_observaciones
          ),
          p_ip);
  return v_id_mov;
end $$;

grant execute on function sp_crear_consignacion(uuid, text, inet) to authenticated;
grant execute on function sp_agregar_item_consignacion(uuid, uuid, text, inet) to authenticated;
grant execute on function sp_cancelar_item_consignacion(uuid, text, inet) to authenticated;
grant execute on function sp_confirmar_salida_item(uuid, inet) to authenticated;
grant execute on function sp_cerrar_consignacion(uuid, inet) to authenticated;
grant execute on function sp_registrar_ajuste_inventario(uuid, integer, integer, text, boolean, inet) to authenticated;

-- DOWN block:
--   drop function if exists sp_registrar_ajuste_inventario(uuid, integer, integer, text, boolean, inet);
--   drop function if exists sp_cerrar_consignacion(uuid, inet);
--   drop function if exists sp_confirmar_salida_item(uuid, inet);
--   drop function if exists sp_cancelar_item_consignacion(uuid, text, inet);
--   drop function if exists sp_agregar_item_consignacion(uuid, uuid, text, inet);
--   drop function if exists sp_crear_consignacion(uuid, text, inet);
