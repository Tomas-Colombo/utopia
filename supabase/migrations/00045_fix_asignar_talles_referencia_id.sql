-- 00045_fix_asignar_talles_referencia_id.sql
-- UP: Fix del RPC `sp_asignar_talles_a_producto` (00044).
--     `movimiento_item.referencia_id` es `uuid`, pero la versión anterior
--     insertaba `p_id_producto::text`, lo que fallaba con:
--       "column 'referencia_id' is of type uuid but expression is of type text"
--     El resto de la lógica se mantiene idéntica; solo se ajusta el cast.
--
-- DOWN:
--   -- restaurar la versión de 00044 (no recomendado: rompe la asignación de talles)

create or replace function sp_asignar_talles_a_producto(
  p_id_producto  uuid,
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

      -- Fix vs 00044: `referencia_id` es uuid, no text. Pasamos el uuid crudo
      -- igual que hace sp_confirmar_ingreso con `p_id_ingreso`.
      insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                                  estado_desde, estado_hasta,
                                  referencia_tipo, referencia_id,
                                  diferencia, id_usuario)
      values (v_tenant, v_item.id_item, 'ajuste',
              'disponible', 'disponible',
              'producto', p_id_producto,
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
