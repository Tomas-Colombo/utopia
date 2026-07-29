-- 00023_ventas_reservas_functions.sql
-- UP: sp_* de Ventas y Reservas (Etapa 5, "el punto más crítico del
--     sistema" — Planificacion.txt Etapa 5 §98, Ejecucion §L43/L222).
--
-- Contrato de concurrencia:
--   Toda mutación de estado_item pasa por sp_transicion_item_producto
--   (00016) que hace SELECT ... FOR UPDATE. Cualquier competencia por
--   el mismo item se serializa a nivel de fila. Si el estado ya cambió
--   entre lectura y write, la transición falla con 'invalid-transition'
--   (o 'item-not-found' si RLS lo oculta).
--
-- Contenido:
--   - sp_crear_reserva / sp_cancelar_reserva / sp_convertir_reserva_venta
--     (marca detalle_reserva.estado como convertida_venta y cierra la
--     reserva; sp_registrar_venta lo llama internamente si viene una
--     id_reserva).
--   - sp_vencer_reservas (batch periódico o manual).
--   - sp_registrar_venta (LA transacción: valida items, chequea
--     reserva-de-otro, calcula precio con sp_calcular_precio_venta_snapshot,
--     inserta detalle_venta, transiciona items a 'vendido' vía RPC).
--   - sp_anular_venta (revierte items a 'disponible' si no fueron
--     devueltos a cliente).
--   - sp_registrar_devolucion_cliente (item 'vendido' → 'devuelto_cliente').

-- ─── RESERVAS ────────────────────────────────────────────────────────

-- Crea una reserva con N items. Falla-cerrado si algún item ya está
-- en una reserva activa o si su estado_item no permite reservarlo.
create or replace function sp_crear_reserva(
  p_id_cliente        uuid,
  p_items             uuid[],           -- array de id_item
  p_fecha_vencimiento timestamptz,
  p_observaciones     text default null,
  p_ip                inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_id       uuid;
  v_item_id  uuid;
  v_estado   estado_item;
  v_producto uuid;
  v_precio   numeric;
  v_ya_reservado boolean;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_items is null or array_length(p_items, 1) is null then
    raise exception 'items-vacios' using errcode = '22023';
  end if;
  if p_fecha_vencimiento <= now() then
    raise exception 'vencimiento-invalido' using errcode = '22023';
  end if;

  -- Crea reserva primero para tener id
  insert into reserva(id_tenant, id_cliente, id_usuario_alta,
                      fecha_vencimiento, observaciones)
  values (v_tenant, p_id_cliente, v_actor, p_fecha_vencimiento, p_observaciones)
  returning id_reserva into v_id;

  -- Por cada item: lockeo (FOR UPDATE), valido estado, valido no-reservado.
  foreach v_item_id in array p_items loop
    select estado_item, id_producto, precio_venta
      into v_estado, v_producto, v_precio
      from item_producto ip
      left join producto pr on pr.id_producto = ip.id_producto
     where ip.id_item = v_item_id and ip.id_tenant = v_tenant
     for update of ip;

    if v_estado is null then
      raise exception 'item-not-found: %', v_item_id using errcode = '42704';
    end if;
    if v_estado not in ('disponible') then
      raise exception 'item-no-disponible-para-reserva: % (estado=%)',
        v_item_id, v_estado using errcode = '22023';
    end if;

    -- Chequeo idempotente vía partial unique index (detalle_reserva_item_activa_uk).
    -- Adicional: hacemos SELECT para dar un error mejor que el 23505 del
    -- unique violation.
    select exists (
      select 1 from detalle_reserva dr
       where dr.id_item = v_item_id and dr.estado = 'activa'
    ) into v_ya_reservado;
    if v_ya_reservado then
      raise exception 'item-ya-reservado: %', v_item_id using errcode = '23505';
    end if;

    insert into detalle_reserva(id_tenant, id_reserva, id_item, id_producto,
                                precio_snapshot, estado)
    values (v_tenant, v_id, v_item_id, v_producto,
            coalesce(v_precio, 0), 'activa');
  end loop;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'reserva', v_id::text, 'crear',
          jsonb_build_object('id_cliente', p_id_cliente,
                             'items', to_jsonb(p_items),
                             'fecha_vencimiento', p_fecha_vencimiento),
          p_ip);
  return v_id;
end $$;

-- Cancelación explícita (§L92). Libera todos los items (no cambia
-- estado_item porque nunca subió de 'disponible' al reservar; §L93).
create or replace function sp_cancelar_reserva(
  p_id_reserva uuid,
  p_motivo     text default null,
  p_ip         inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_estado estado_reserva;
begin
  select estado_reserva into v_estado
    from reserva
   where id_reserva = p_id_reserva and id_tenant = v_tenant
   for update;

  if v_estado is null then
    raise exception 'reserva-not-found' using errcode = '42704';
  end if;
  if v_estado <> 'activa' then
    raise exception 'reserva-no-activa: estado=%', v_estado using errcode = '22023';
  end if;

  update reserva
     set estado_reserva = 'cancelada',
         fecha_cierre = now()
   where id_reserva = p_id_reserva;

  update detalle_reserva
     set estado = 'cancelada'
   where id_reserva = p_id_reserva and estado = 'activa';

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'reserva', p_id_reserva::text, 'cancelar',
          jsonb_build_object('motivo', p_motivo), p_ip);
end $$;

-- Vencimiento batch. No requiere argumentos: procesa TODAS las reservas
-- activas con fecha_vencimiento < now() del tenant actual. Devuelve
-- cantidad de reservas vencidas. Se puede llamar desde un cron o desde
-- un botón manual "purgar reservas vencidas".
create or replace function sp_vencer_reservas() returns integer language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_count  integer := 0;
  r_id     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  for r_id in
    select id_reserva
      from reserva
     where id_tenant = v_tenant
       and estado_reserva = 'activa'
       and fecha_vencimiento < now()
     for update
  loop
    update reserva set estado_reserva = 'vencida', fecha_cierre = now()
     where id_reserva = r_id;
    update detalle_reserva set estado = 'vencida'
     where id_reserva = r_id and estado = 'activa';
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios)
    values (v_tenant, auth.uid(), 'reserva', null, 'vencer_batch',
            jsonb_build_object('reservas_vencidas', v_count));
  end if;
  return v_count;
end $$;

-- ─── VENTA (transacción atómica) ─────────────────────────────────────

-- p_lineas: jsonb array de { id_item: uuid }.
--   El precio se resuelve acá vía sp_calcular_precio_venta_snapshot;
--   la app NO puede pasar el precio arbitrariamente (evita
--   manipulación cliente-side).
-- p_id_reserva: opcional. Si viene, valida que TODOS los items estén
--   en detalle_reserva de esa reserva con estado='activa'; si sí,
--   convierte la reserva a 'convertida_venta' en la misma tx.
--
-- Cada item se lockea (FOR UPDATE dentro de sp_transicion_item_producto).
-- Si algún item no está disponible o está en OTRA reserva activa que no
-- es la que se pasa, la tx falla completa (atómica).
create or replace function sp_registrar_venta(
  p_lineas       jsonb,
  p_forma_pago   forma_pago default 'efectivo',
  p_id_cliente   uuid default null,
  p_id_reserva   uuid default null,
  p_observaciones text default null,
  p_ip           inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_id_venta   uuid;
  v_total      numeric(14, 2) := 0;
  v_linea      jsonb;
  v_id_item    uuid;
  v_item       item_producto;
  v_producto   producto;
  v_snap       jsonb;
  v_precio     numeric(14, 2);
  v_costo      numeric(14, 2);
  v_id_prov    uuid;
  v_monto_prov numeric(14, 2);
  v_monto_gan  numeric(14, 2);
  v_reserva_estado estado_reserva;
  v_dr_activa  uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'lineas-vacias' using errcode = '22023';
  end if;

  -- Si viene id_reserva: validar que esté activa. Lockeamos la reserva.
  if p_id_reserva is not null then
    select estado_reserva into v_reserva_estado
      from reserva
     where id_reserva = p_id_reserva and id_tenant = v_tenant
     for update;
    if v_reserva_estado is null then
      raise exception 'reserva-not-found' using errcode = '42704';
    end if;
    if v_reserva_estado <> 'activa' then
      raise exception 'reserva-no-activa: %', v_reserva_estado using errcode = '22023';
    end if;
  end if;

  -- Cabecera provisoria (total se actualiza al final)
  insert into venta(id_tenant, id_cliente, id_usuario_alta, forma_pago,
                    total, observaciones)
  values (v_tenant, p_id_cliente, v_actor, p_forma_pago, 0, p_observaciones)
  returning id_venta into v_id_venta;

  -- Iteración por línea. Cada item se lockea (FOR UPDATE) y se transiciona.
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_id_item := (v_linea->>'id_item')::uuid;
    if v_id_item is null then
      raise exception 'linea-sin-id-item' using errcode = '22023';
    end if;

    -- Lock del item con FOR UPDATE (mismo lock que sp_transicion_item_producto
    -- va a tomar más abajo; lo replicamos acá para poder leer datos
    -- antes de transicionar).
    select * into v_item
      from item_producto
     where id_item = v_id_item and id_tenant = v_tenant
     for update;
    if v_item.id_item is null then
      raise exception 'item-not-found: %', v_id_item using errcode = '42704';
    end if;
    if v_item.estado_item <> 'disponible' then
      raise exception 'item-no-disponible: % (estado=%)',
        v_id_item, v_item.estado_item using errcode = '22023';
    end if;

    -- Chequeo de reserva activa (§L93 "verificación se resuelve consultando
    -- DetalleReserva activo en el momento de vender").
    select id_detalle_reserva into v_dr_activa
      from detalle_reserva
     where id_item = v_id_item and estado = 'activa';
    if v_dr_activa is not null then
      -- Está reservado. Solo permitimos vender si p_id_reserva coincide.
      if p_id_reserva is null then
        raise exception 'item-en-reserva: % (usa la reserva o cancelala primero)',
          v_id_item using errcode = '22023';
      end if;
      -- Ver que el detalle_reserva sea DE la reserva pasada
      if not exists (
        select 1 from detalle_reserva
         where id_detalle_reserva = v_dr_activa
           and id_reserva = p_id_reserva
      ) then
        raise exception 'item-en-otra-reserva: %', v_id_item using errcode = '22023';
      end if;
      -- Marcar detalle_reserva como convertida
      update detalle_reserva set estado = 'convertida_venta'
       where id_detalle_reserva = v_dr_activa;
    end if;

    -- Traer producto
    select * into v_producto from producto
     where id_producto = v_item.id_producto and id_tenant = v_tenant;

    -- Resolver precio final vía snapshot (usa cascada, descuentos, recargo)
    v_snap := sp_calcular_precio_venta_snapshot(v_item.id_producto, p_forma_pago);
    if not (v_snap->>'ok')::boolean then
      raise exception 'precio-no-resoluble: producto % (%)',
        v_item.id_producto, v_snap->>'reason' using errcode = '22023';
    end if;
    v_precio := (v_snap->>'precio_final')::numeric;
    v_costo  := v_item.costo_ingreso;

    -- Calcular montos según tipo_ingreso (§L26 y §L35):
    --   compra       → monto_proveedor=0, monto_ganancia = precio - costo (ya se pagó)
    --   consignacion → monto_proveedor=costo_ingreso, monto_ganancia = precio - costo_ingreso
    if v_item.tipo_ingreso = 'compra' then
      v_monto_prov := 0;
      v_id_prov := null;
    else
      v_monto_prov := v_costo;
      -- Proveedor: el que vino en el ingreso
      select id_proveedor into v_id_prov
        from ingreso_mercaderia
       where id_ingreso = v_item.id_ingreso;
    end if;
    v_monto_gan := v_precio - v_monto_prov;

    insert into detalle_venta(
      id_tenant, id_venta, id_item, id_producto, id_proveedor,
      precio_venta, costo_snapshot, monto_proveedor, monto_gasto, monto_ganancia,
      tipo_ingreso_snapshot, desglose_reglas
    ) values (
      v_tenant, v_id_venta, v_id_item, v_item.id_producto, v_id_prov,
      v_precio, v_costo, v_monto_prov, 0, v_monto_gan,
      v_item.tipo_ingreso, coalesce(v_snap->'desglose', '{}'::jsonb)
    );

    v_total := v_total + v_precio;

    -- Transicionar item a 'vendido' (via el RPC oficial de la state machine
    -- — audit + movimiento_item se registran ahí).
    perform sp_transicion_item_producto(
      v_id_item, 'vendido', 'venta', v_id_venta, 'venta', p_ip
    );
  end loop;

  -- Cerrar reserva si aplica
  if p_id_reserva is not null then
    update reserva
       set estado_reserva = 'convertida_venta',
           fecha_cierre = now()
     where id_reserva = p_id_reserva;
  end if;

  update venta set total = v_total where id_venta = v_id_venta;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'venta', v_id_venta::text, 'crear',
          jsonb_build_object('total', v_total,
                             'lineas', jsonb_array_length(p_lineas),
                             'forma_pago', p_forma_pago,
                             'id_cliente', p_id_cliente,
                             'id_reserva', p_id_reserva),
          p_ip);
  return v_id_venta;
end $$;

-- Anular venta. Reversa: items vuelven a 'disponible' (excepto los ya
-- devueltos por cliente); marca venta.estado_venta='anulada'.
-- No borra detalle_venta — se conserva histórico.
-- IMPORTANTE: no se permite anular si la venta ya fue rendida
-- (id_rendicion no null en alguna línea). Etapa 7 enforceará.
create or replace function sp_anular_venta(
  p_id_venta uuid,
  p_motivo   text default null,
  p_ip       inet default null
) returns void language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_estado   estado_venta;
  v_rendida  boolean;
  r_det      record;
begin
  select estado_venta into v_estado from venta
    where id_venta = p_id_venta and id_tenant = v_tenant for update;
  if v_estado is null then
    raise exception 'venta-not-found' using errcode = '42704';
  end if;
  if v_estado = 'anulada' then
    return; -- idempotente
  end if;

  select exists(
    select 1 from detalle_venta
     where id_venta = p_id_venta and id_rendicion is not null
  ) into v_rendida;
  if v_rendida then
    raise exception 'venta-ya-rendida' using errcode = '22023';
  end if;

  -- Revertir cada item a 'disponible' si sigue en 'vendido'
  for r_det in
    select dv.id_item, ip.estado_item
      from detalle_venta dv
      join item_producto ip on ip.id_item = dv.id_item
     where dv.id_venta = p_id_venta
     for update of ip
  loop
    if r_det.estado_item = 'vendido' then
      perform sp_transicion_item_producto(
        r_det.id_item, 'disponible', 'ajuste', p_id_venta, 'anulacion_venta', p_ip
      );
    end if;
  end loop;

  update venta
     set estado_venta = 'anulada',
         fecha_anulacion = now(),
         motivo_anulacion = p_motivo
   where id_venta = p_id_venta;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'venta', p_id_venta::text, 'anular',
          jsonb_build_object('motivo', p_motivo), p_ip);
end $$;

-- Devolución de un item de una venta (cliente devuelve). El item pasa
-- a 'devuelto_cliente'. La venta NO se anula (se puede tener venta con
-- N items y devolución de 1). El monto de esta línea queda igual — la
-- devolución afecta otras métricas (rendición al proveedor no cambia
-- porque ya se vendió; contable puede querer nota de crédito, out of scope).
create or replace function sp_registrar_devolucion_cliente(
  p_id_detalle_venta uuid,
  p_motivo           text default null,
  p_ip               inet default null
) returns void language plpgsql as $$
declare
  v_tenant  uuid := auth_tenant_id();
  v_actor   uuid := auth.uid();
  v_id_item uuid;
  v_estado  estado_item;
begin
  select dv.id_item, ip.estado_item
    into v_id_item, v_estado
    from detalle_venta dv
    join item_producto ip on ip.id_item = dv.id_item
   where dv.id_detalle_venta = p_id_detalle_venta
     and dv.id_tenant = v_tenant
   for update of ip;

  if v_id_item is null then
    raise exception 'detalle-venta-not-found' using errcode = '42704';
  end if;
  if v_estado <> 'vendido' then
    raise exception 'item-no-esta-vendido: estado=%', v_estado using errcode = '22023';
  end if;

  perform sp_transicion_item_producto(
    v_id_item, 'devuelto_cliente', 'ajuste',
    p_id_detalle_venta, 'devolucion_cliente', p_ip
  );

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'detalle_venta', p_id_detalle_venta::text, 'devolucion_cliente',
          jsonb_build_object('motivo', p_motivo), p_ip);
end $$;

-- ─── COMPROBANTE (metadatos) ─────────────────────────────────────────

create or replace function sp_emitir_comprobante(
  p_id_venta   uuid,
  p_tipo       tipo_comprobante,
  p_numero     text,
  p_ip         inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  insert into comprobante(id_tenant, id_venta, tipo, numero)
  values (v_tenant, p_id_venta, p_tipo, p_numero)
  returning id_comprobante into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'comprobante', v_id::text, 'emitir',
          jsonb_build_object('id_venta', p_id_venta, 'tipo', p_tipo, 'numero', p_numero),
          p_ip);
  return v_id;
end $$;

grant execute on function sp_crear_reserva(uuid, uuid[], timestamptz, text, inet) to authenticated;
grant execute on function sp_cancelar_reserva(uuid, text, inet) to authenticated;
grant execute on function sp_vencer_reservas() to authenticated;
grant execute on function sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet) to authenticated;
grant execute on function sp_anular_venta(uuid, text, inet) to authenticated;
grant execute on function sp_registrar_devolucion_cliente(uuid, text, inet) to authenticated;
grant execute on function sp_emitir_comprobante(uuid, tipo_comprobante, text, inet) to authenticated;

-- DOWN block:
--   drop function if exists sp_emitir_comprobante(uuid, tipo_comprobante, text, inet);
--   drop function if exists sp_registrar_devolucion_cliente(uuid, text, inet);
--   drop function if exists sp_anular_venta(uuid, text, inet);
--   drop function if exists sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet);
--   drop function if exists sp_vencer_reservas();
--   drop function if exists sp_cancelar_reserva(uuid, text, inet);
--   drop function if exists sp_crear_reserva(uuid, uuid[], timestamptz, text, inet);
