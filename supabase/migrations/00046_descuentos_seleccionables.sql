-- 00046_descuentos_seleccionables.sql
-- UP: los descuentos dejan de aplicarse automáticamente. Ahora el vendedor
--     elige, por línea, qué descuentos aplicar en la venta.
--
--   Cambios:
--   - regla_precio.acumulable (boolean) — flag informativo para descuentos.
--     El sistema NO fuerza exclusividad (modelo "avisar, no bloquear"); la UI
--     advierte si se cruzan no-acumulables pero permite la combinación.
--   - sp_calcular_precio_venta_snapshot: nueva firma con p_ids_descuentos.
--     Ya no auto-resuelve la cascada de descuentos; recibe los ids elegidos
--     y aplica sólo los que son válidos para ESE producto (alcance+vigencia).
--     El desglose pasa a incluir el impacto en $ de cada descuento aplicado.
--   - sp_descuentos_disponibles_venta: dado un set de productos (el carrito),
--     devuelve qué descuentos vigentes aplican a cada uno, por alcance.
--   - sp_registrar_venta: cada línea puede traer `descuentos` (array de ids);
--     se revalidan en la tx y su impacto queda en desglose_reglas.
--   - sp_create_regla_precio: nuevo parámetro p_acumulable.
-- DOWN: al final (drops en orden inverso).

-- ─────────────────────────────────────────────────────────────────
-- COLUMNA: acumulable. Sólo tiene sentido en tipo_regla='descuento'.
-- default false = un descuento nuevo es, por defecto, NO acumulable.
-- ─────────────────────────────────────────────────────────────────
alter table regla_precio
  add column if not exists acumulable boolean not null default false;

-- ─────────────────────────────────────────────────────────────────
-- SNAPSHOT DE PRECIO (reescrito). Antes resolvía la cascada de
-- descuentos por su cuenta; ahora recibe los ids que el vendedor eligió
-- (p_ids_descuentos) y aplica SÓLO los que son válidos para el producto:
--   - vigentes (sin baja, dentro de fecha_inicio/hasta), del tenant
--   - de alcance compatible (global | ese producto | su categoría | su
--     proveedor del último ingreso)
-- Los % se suman como impacto en $ sobre el precio de LISTA (no sobre el
-- costo); los monto_fijo se restan directo. Cada descuento aplicado deja
-- su impacto en el desglose para mostrarlo en la venta. El recargo por
-- forma de pago se aplica DESPUÉS, sobre el precio ya descontado.
-- ─────────────────────────────────────────────────────────────────

-- La firma cambia (agrega un parámetro), así que dropeamos la de 2 args
-- para que las llamadas con 2 argumentos caigan en la nueva (default).
drop function if exists sp_calcular_precio_venta_snapshot(uuid, forma_pago);

create or replace function sp_calcular_precio_venta_snapshot(
  p_id_producto    uuid,
  p_forma_pago     forma_pago default 'efectivo',
  p_ids_descuentos uuid[] default '{}'
) returns jsonb language plpgsql stable as $$
declare
  v_tenant         uuid := auth_tenant_id();
  v_precio_lista   numeric;
  v_desactualizado boolean;
  v_id_categoria   uuid;
  v_id_proveedor   uuid;
  v_desc           regla_precio;
  v_id             uuid;
  v_aplica         boolean;
  v_monto          numeric;
  v_desc_total     numeric := 0;   -- suma de impactos (siempre en $)
  v_recargo        regla_precio;
  v_precio_desc    numeric;
  v_precio_final   numeric;
  v_descuentos     jsonb := '[]'::jsonb;
  v_desglose       jsonb := '{}'::jsonb;
begin
  select precio_venta, precio_venta_desactualizado, id_categoria
    into v_precio_lista, v_desactualizado, v_id_categoria
    from producto
   where id_producto = p_id_producto and id_tenant = v_tenant;

  if v_precio_lista is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'sin-precio-lista',
      'requiere_recalcular', true
    );
  end if;

  -- Proveedor del último ingreso (misma lógica que la cascada de margen).
  select im.id_proveedor into v_id_proveedor
    from ingreso_mercaderia im
    join item_producto ip on ip.id_ingreso = im.id_ingreso
   where ip.id_producto = p_id_producto
   order by im.fecha desc
   limit 1;

  -- Descuentos elegidos por el vendedor. Se validan uno a uno; los que no
  -- son válidos para este producto se ignoran en silencio (ej. un descuento
  -- de categoría pasado a un producto de otra categoría).
  if p_ids_descuentos is not null then
    foreach v_id in array p_ids_descuentos loop
      select * into v_desc from regla_precio
       where id_regla = v_id
         and id_tenant = v_tenant
         and tipo_regla = 'descuento'
         and fecha_baja is null
         and (fecha_inicio is null or fecha_inicio <= now())
         and (fecha_hasta  is null or fecha_hasta  >= now());
      if v_desc.id_regla is null then continue; end if;

      v_aplica := (v_desc.alcance = 'global')
        or (v_desc.alcance = 'producto'  and v_desc.id_producto  = p_id_producto)
        or (v_desc.alcance = 'categoria' and v_desc.id_categoria = v_id_categoria)
        or (v_desc.alcance = 'proveedor' and v_desc.id_proveedor = v_id_proveedor);
      if not v_aplica then continue; end if;

      if v_desc.tipo_valor = 'porcentaje' then
        v_monto := round(v_precio_lista * v_desc.valor, 2);
      else
        v_monto := round(v_desc.valor, 2);
      end if;
      v_desc_total := v_desc_total + v_monto;

      v_descuentos := v_descuentos || jsonb_build_array(jsonb_build_object(
        'id_regla',   v_desc.id_regla,
        'nombre',     v_desc.nombre,
        'alcance',    v_desc.alcance,
        'tipo_valor', v_desc.tipo_valor,
        'valor',      v_desc.valor,
        'acumulable', v_desc.acumulable,
        'monto',      v_monto
      ));
    end loop;
  end if;

  v_precio_desc := v_precio_lista - v_desc_total;
  if v_precio_desc < 0 then v_precio_desc := 0; end if;

  v_desglose := jsonb_build_object('descuentos', v_descuentos);

  -- Recargo por forma de pago (después del descuento).
  select * into v_recargo from resolver_regla_recargo(p_id_producto, p_forma_pago);
  if v_recargo.id_regla is null or p_forma_pago = 'efectivo' then
    v_precio_final := v_precio_desc;
  elsif v_recargo.tipo_valor = 'porcentaje' then
    v_precio_final := v_precio_desc * (1 + v_recargo.valor);
    v_desglose := v_desglose || jsonb_build_object(
      'recargo_forma_pago',
      jsonb_build_object('id_regla', v_recargo.id_regla, 'tipo_valor', 'porcentaje',
                         'valor', v_recargo.valor, 'forma_pago', p_forma_pago,
                         'monto', round(v_precio_desc * v_recargo.valor, 2))
    );
  else
    v_precio_final := v_precio_desc + v_recargo.valor;
    v_desglose := v_desglose || jsonb_build_object(
      'recargo_forma_pago',
      jsonb_build_object('id_regla', v_recargo.id_regla, 'tipo_valor', 'monto_fijo',
                         'valor', v_recargo.valor, 'forma_pago', p_forma_pago,
                         'monto', round(v_recargo.valor, 2))
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'precio_lista', v_precio_lista,
    'precio_final', round(v_precio_final::numeric, 2),
    'forma_pago', p_forma_pago,
    'desactualizado', v_desactualizado,
    'desglose', v_desglose
  );
end $$;

-- ─────────────────────────────────────────────────────────────────
-- DESCUENTOS DISPONIBLES PARA UN CARRITO. Dado el set de productos que
-- el vendedor tiene cargado, devuelve una fila por (producto, descuento
-- aplicable). La UI la agrupa: los de alcance='producto' se ofrecen en la
-- fila del producto; global/categoría/proveedor en el panel lateral.
-- ─────────────────────────────────────────────────────────────────
create or replace function sp_descuentos_disponibles_venta(
  p_ids_productos uuid[]
) returns table (
  id_producto uuid,
  id_regla    uuid,
  nombre      text,
  alcance     alcance_regla,
  tipo_valor  tipo_valor_regla,
  valor       numeric,
  acumulable  boolean
) language sql stable as $$
  with prods as (
    select pr.id_producto, pr.id_categoria,
           (select im.id_proveedor
              from ingreso_mercaderia im
              join item_producto ip on ip.id_ingreso = im.id_ingreso
             where ip.id_producto = pr.id_producto
             order by im.fecha desc
             limit 1) as id_proveedor
      from producto pr
     where pr.id_tenant = auth_tenant_id()
       and pr.id_producto = any(p_ids_productos)
  )
  select pp.id_producto, r.id_regla, r.nombre, r.alcance,
         r.tipo_valor, r.valor, r.acumulable
    from prods pp
    join regla_precio r
      on r.id_tenant  = auth_tenant_id()
     and r.tipo_regla = 'descuento'
     and r.fecha_baja is null
     and (r.fecha_inicio is null or r.fecha_inicio <= now())
     and (r.fecha_hasta  is null or r.fecha_hasta  >= now())
     and (
       r.alcance = 'global'
       or (r.alcance = 'producto'  and r.id_producto  = pp.id_producto)
       or (r.alcance = 'categoria' and r.id_categoria = pp.id_categoria)
       or (r.alcance = 'proveedor' and r.id_proveedor = pp.id_proveedor)
     );
$$;

-- ─────────────────────────────────────────────────────────────────
-- sp_create_regla_precio (reescrito): agrega p_acumulable. La firma
-- cambia, así que dropeamos la anterior primero.
-- ─────────────────────────────────────────────────────────────────
drop function if exists sp_create_regla_precio(
  text, tipo_regla, tipo_valor_regla, numeric, alcance_regla,
  uuid, uuid, uuid, forma_pago, integer, timestamptz, timestamptz, inet);

create or replace function sp_create_regla_precio(
  p_nombre       text,
  p_tipo_regla   tipo_regla,
  p_tipo_valor   tipo_valor_regla,
  p_valor        numeric,
  p_alcance      alcance_regla,
  p_id_producto  uuid default null,
  p_id_categoria uuid default null,
  p_id_proveedor uuid default null,
  p_forma_pago   forma_pago default null,
  p_prioridad    integer default 0,
  p_fecha_inicio timestamptz default null,
  p_fecha_hasta  timestamptz default null,
  p_acumulable   boolean default false,
  p_ip           inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  insert into regla_precio(
    id_tenant, nombre, tipo_regla, tipo_valor, valor, alcance,
    id_producto, id_categoria, id_proveedor, forma_pago,
    prioridad, fecha_inicio, fecha_hasta, acumulable
  ) values (
    v_tenant, p_nombre, p_tipo_regla, p_tipo_valor, p_valor, p_alcance,
    p_id_producto, p_id_categoria, p_id_proveedor, p_forma_pago,
    coalesce(p_prioridad, 0), p_fecha_inicio, p_fecha_hasta,
    -- acumulable sólo aplica a descuentos; para margen/recargo se guarda false.
    case when p_tipo_regla = 'descuento' then coalesce(p_acumulable, false) else false end
  ) returning id_regla into v_id;

  if p_tipo_regla = 'margen' then
    perform sp_marcar_precio_desactualizado_by_regla(v_id);
  end if;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'regla_precio', v_id::text, 'crear',
          jsonb_build_object('nombre', p_nombre, 'tipo_regla', p_tipo_regla,
                             'tipo_valor', p_tipo_valor, 'valor', p_valor,
                             'alcance', p_alcance, 'forma_pago', p_forma_pago,
                             'prioridad', p_prioridad, 'acumulable', p_acumulable),
          p_ip);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- sp_registrar_venta (reescrito): cada línea puede traer `descuentos`,
-- un array de ids que el vendedor eligió. Se pasan al snapshot (que los
-- revalida contra el producto) y su impacto queda en desglose_reglas.
-- El resto de la lógica es idéntica a 00023.
-- ─────────────────────────────────────────────────────────────────
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
  v_ids_desc   uuid[];
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

  insert into venta(id_tenant, id_cliente, id_usuario_alta, forma_pago,
                    total, observaciones)
  values (v_tenant, p_id_cliente, v_actor, p_forma_pago, 0, p_observaciones)
  returning id_venta into v_id_venta;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_id_item := (v_linea->>'id_item')::uuid;
    if v_id_item is null then
      raise exception 'linea-sin-id-item' using errcode = '22023';
    end if;

    -- Descuentos elegidos para esta línea (opcional; default vacío).
    v_ids_desc := coalesce(
      (select array_agg(e::uuid)
         from jsonb_array_elements_text(coalesce(v_linea->'descuentos', '[]'::jsonb)) e),
      '{}'::uuid[]
    );

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

    select id_detalle_reserva into v_dr_activa
      from detalle_reserva
     where id_item = v_id_item and estado = 'activa';
    if v_dr_activa is not null then
      if p_id_reserva is null then
        raise exception 'item-en-reserva: % (usa la reserva o cancelala primero)',
          v_id_item using errcode = '22023';
      end if;
      if not exists (
        select 1 from detalle_reserva
         where id_detalle_reserva = v_dr_activa
           and id_reserva = p_id_reserva
      ) then
        raise exception 'item-en-otra-reserva: %', v_id_item using errcode = '22023';
      end if;
      update detalle_reserva set estado = 'convertida_venta'
       where id_detalle_reserva = v_dr_activa;
    end if;

    select * into v_producto from producto
     where id_producto = v_item.id_producto and id_tenant = v_tenant;

    -- Resolver precio final vía snapshot (cascada + descuentos elegidos + recargo)
    v_snap := sp_calcular_precio_venta_snapshot(v_item.id_producto, p_forma_pago, v_ids_desc);
    if not (v_snap->>'ok')::boolean then
      raise exception 'precio-no-resoluble: producto % (%)',
        v_item.id_producto, v_snap->>'reason' using errcode = '22023';
    end if;
    v_precio := (v_snap->>'precio_final')::numeric;
    v_costo  := v_item.costo_ingreso;

    if v_item.tipo_ingreso = 'compra' then
      v_monto_prov := 0;
      v_id_prov := null;
    else
      v_monto_prov := v_costo;
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

    perform sp_transicion_item_producto(
      v_id_item, 'vendido', 'venta', v_id_venta, 'venta', p_ip
    );
  end loop;

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

grant execute on function sp_calcular_precio_venta_snapshot(uuid, forma_pago, uuid[]) to authenticated;
grant execute on function sp_descuentos_disponibles_venta(uuid[]) to authenticated;
grant execute on function sp_create_regla_precio(text, tipo_regla, tipo_valor_regla, numeric, alcance_regla, uuid, uuid, uuid, forma_pago, integer, timestamptz, timestamptz, boolean, inet) to authenticated;
grant execute on function sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet) to authenticated;

-- DOWN block (idempotent drops):
--   drop function if exists sp_descuentos_disponibles_venta(uuid[]);
--   drop function if exists sp_calcular_precio_venta_snapshot(uuid, forma_pago, uuid[]);
--   -- recrear la versión 2-args de 00019 si se revierte
--   drop function if exists sp_create_regla_precio(text, tipo_regla, tipo_valor_regla, numeric, alcance_regla, uuid, uuid, uuid, forma_pago, integer, timestamptz, timestamptz, boolean, inet);
--   -- recrear sp_create_regla_precio / sp_registrar_venta de 00019/00023
--   alter table regla_precio drop column if exists acumulable;
