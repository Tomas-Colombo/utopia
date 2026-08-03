-- 00048_fix_sp_crear_reserva_ambiguo.sql
-- UP: arregla `sp_crear_reserva` (00023), que fallaba SIEMPRE con
--     'column reference "id_producto" is ambiguous'.
--
--     El SELECT que resuelve el ítem joinea `item_producto` con `producto`, y
--     AMBAS tienen `id_producto`. La lista de selección lo pedía sin calificar:
--
--       select estado_item, id_producto, precio_venta
--         from item_producto ip
--         left join producto pr on pr.id_producto = ip.id_producto
--
--     El cuerpo de una función plpgsql no se analiza al crearla, así que el
--     error nunca apareció al aplicar 00023: sale recién al ejecutar, y como
--     es la primera sentencia del loop de ítems, ninguna reserva se podía
--     crear. `precio_venta` sí es unívoco (vive sólo en `producto`, agregada
--     en 00018), así que la corrección es sólo calificar las tres columnas.
--
--     El resto del cuerpo queda idéntico a 00023.
-- DOWN: al final, comentado.

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
    -- Columnas calificadas: `id_producto` existe en las dos tablas del join.
    select ip.estado_item, ip.id_producto, pr.precio_venta
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

grant execute on function sp_crear_reserva(uuid, uuid[], timestamptz, text, inet)
  to authenticated;

-- ─── DOWN ────────────────────────────────────────────────────────────
--   Recrear el cuerpo de 00023 (que tiene el bug). No hay motivo para
--   volver atrás: esta migración sólo califica columnas.
