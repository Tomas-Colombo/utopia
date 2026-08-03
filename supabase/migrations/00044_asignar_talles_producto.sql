-- 00044_asignar_talles_producto.sql
-- UP: RPC para asignar talles retroactivamente a ítems que se ingresaron
--     "sin talle" y todavía no se vendieron. Escenario típico: se dio de alta
--     stock antes de definir los talles de la categoría; ahora hay 10 unidades
--     disponibles sin talle y se quiere distribuirlas (ej: 4 M, 3 L, 3 XL).
--
--   Reglas:
--     * Solo toca ítems con `talle IS NULL` y `estado_item = 'disponible'`
--       (los reservados/vendidos/devueltos ya están "engaged" y no se retocan).
--     * FIFO: elige los más antiguos primero (`fecha_ingreso ASC`).
--     * Valida que la suma de la distribución no exceda los disponibles.
--     * Cada talle debe existir en `categoria.talles` del producto.
--     * Registra un `movimiento_item` tipo `ajuste` por unidad tocada
--       (misma estado_desde/estado_hasta = 'disponible') + audit global.
--
-- DOWN:
--   drop function if exists sp_asignar_talles_a_producto(uuid, jsonb, inet);

create or replace function sp_asignar_talles_a_producto(
  p_id_producto  uuid,
  -- Formato: [{"talle": "M", "cantidad": 4}, {"talle": "L", "cantidad": 3}]
  p_distribucion jsonb,
  p_ip           inet default null
) returns integer language plpgsql as $$
declare
  v_tenant       uuid := auth_tenant_id();
  v_actor        uuid := auth.uid();
  v_talles_cat   text[];
  v_disponibles  integer;
  v_total_dist   integer := 0;
  v_asignados    integer := 0;
  v_entrada      record;
  v_item         record;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- 1) Categoría del producto → talles válidos.
  select c.talles into v_talles_cat
    from producto p
    join categoria c on c.id_categoria = p.id_categoria
   where p.id_producto = p_id_producto
     and p.id_tenant   = v_tenant;

  if v_talles_cat is null then
    raise exception 'producto-not-found' using errcode = '42704';
  end if;

  if array_length(v_talles_cat, 1) is null then
    raise exception 'categoria-sin-talles' using errcode = '22023';
  end if;

  -- 2) Validar distribución: talles conocidos + cantidades positivas.
  for v_entrada in
    select (elem->>'talle')::text as talle,
           (elem->>'cantidad')::integer as cantidad
      from jsonb_array_elements(p_distribucion) as elem
  loop
    if v_entrada.cantidad is null or v_entrada.cantidad <= 0 then
      raise exception 'cantidad-invalida' using errcode = '22023';
    end if;
    if not (v_entrada.talle = ANY(v_talles_cat)) then
      raise exception 'talle-no-valido: %', v_entrada.talle using errcode = '22023';
    end if;
    v_total_dist := v_total_dist + v_entrada.cantidad;
  end loop;

  if v_total_dist = 0 then
    return 0;
  end if;

  -- 3) Cupo: nunca asignar más talles que ítems editables.
  select count(*) into v_disponibles
    from item_producto
   where id_tenant   = v_tenant
     and id_producto = p_id_producto
     and talle is null
     and estado_item = 'disponible';

  if v_total_dist > v_disponibles then
    raise exception 'excede-disponibles: pide % pero hay %', v_total_dist, v_disponibles
      using errcode = '22023';
  end if;

  -- 4) Aplicar la distribución talle por talle, FIFO, con lock.
  for v_entrada in
    select (elem->>'talle')::text as talle,
           (elem->>'cantidad')::integer as cantidad
      from jsonb_array_elements(p_distribucion) as elem
  loop
    for v_item in
      select id_item
        from item_producto
       where id_tenant   = v_tenant
         and id_producto = p_id_producto
         and talle is null
         and estado_item = 'disponible'
       order by fecha_ingreso asc, id_item asc
       limit v_entrada.cantidad
       for update
    loop
      update item_producto
         set talle = v_entrada.talle
       where id_item = v_item.id_item;

      insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                                  estado_desde, estado_hasta,
                                  referencia_tipo, referencia_id,
                                  diferencia, id_usuario)
      values (v_tenant, v_item.id_item, 'ajuste',
              'disponible', 'disponible',
              'producto', p_id_producto::text,
              jsonb_build_object('talle_asignado', v_entrada.talle),
              v_actor);

      v_asignados := v_asignados + 1;
    end loop;
  end loop;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'producto', p_id_producto::text, 'asignar_talles',
          jsonb_build_object('distribucion', p_distribucion,
                             'items_actualizados', v_asignados),
          p_ip);

  return v_asignados;
end $$;

grant execute on function sp_asignar_talles_a_producto(uuid, jsonb, inet) to authenticated;
