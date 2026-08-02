-- 00039_cancelar_ingreso_borra_stock.sql
-- UP: la cancelación deja de ser una "baja lógica" y pasa a BORRAR de verdad,
--     para no acumular stock/productos viejos.
--       - Borrador o confirmado: se eliminan los ítems generados por este
--         ingreso (el stock agregado), su detalle y la cabecera → el ingreso
--         desaparece de la lista.
--       - Productos creados en este ingreso (es_nuevo) que quedan huérfanos
--         (sin ítems y sin otro detalle de ingreso) se ELIMINAN. Los que ya
--         existían se conservan: solo pierden el stock que agregó este ingreso.
--       - Regla de seguridad intacta: si algún ítem confirmado ya se movió
--         (vendido/reservado/apartado/baja), NO se cancela y falla con
--         'ingreso-con-items-movidos'.
--     costo_producto y precios cascadean al borrar el producto;
--     movimiento_item cascada al borrar el ítem. Todo en una transacción.
-- DOWN:
--   -- Restaurar la versión 00035 (baja lógica + cancelado_at).

create or replace function sp_cancelar_ingreso(
  p_id_ingreso uuid,
  p_motivo     text default null,
  p_ip         inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_confirmado boolean;
  v_cancelado  timestamptz;
  v_movidos    integer;
  v_items      integer := 0;
  v_prods      integer := 0;
  v_prod_ids   uuid[];
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select confirmado, cancelado_at into v_confirmado, v_cancelado
    from ingreso_mercaderia
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant
   for update;
  if v_confirmado is null then
    raise exception 'ingreso-not-found' using errcode = '42704';
  end if;
  if v_cancelado is not null then
    raise exception 'ingreso-ya-cancelado' using errcode = '22023';
  end if;

  -- Confirmado: solo si TODOS los ítems siguen 'disponible'. Si alguno se
  -- movió, no se puede revertir sin deshacer esa operación primero.
  if v_confirmado then
    select count(*) into v_movidos
      from item_producto
     where id_ingreso = p_id_ingreso and id_tenant = v_tenant
       and estado_item <> 'disponible';
    if v_movidos > 0 then
      raise exception 'ingreso-con-items-movidos: %', v_movidos using errcode = '22023';
    end if;
  end if;

  -- Productos tocados por este ingreso (para evaluar el borrado de los creados acá).
  select array_agg(distinct id_producto) into v_prod_ids
    from ingreso_mercaderia_detalle
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant;

  -- 1) Borrar los ítems generados por este ingreso (el stock agregado).
  --    movimiento_item cascada por FK.
  delete from item_producto
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant;
  get diagnostics v_items = row_count;

  -- 2) Borrar el detalle del ingreso (libera la FK RESTRICT sobre producto).
  delete from ingreso_mercaderia_detalle
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant;

  -- 3) Borrar los productos creados en este ingreso (es_nuevo) que quedaron
  --    huérfanos: sin ítems y sin otro detalle de ingreso. Los preexistentes
  --    se conservan. costo_producto / precios cascadean.
  if v_prod_ids is not null then
    delete from producto p
     where p.id_tenant = v_tenant
       and p.es_nuevo
       and p.id_producto = any(v_prod_ids)
       and not exists (select 1 from item_producto i where i.id_producto = p.id_producto)
       and not exists (
         select 1 from ingreso_mercaderia_detalle d where d.id_producto = p.id_producto
       );
    get diagnostics v_prods = row_count;
  end if;

  -- 4) Borrar la cabecera → el ingreso desaparece de la lista.
  delete from ingreso_mercaderia
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'ingreso_mercaderia', p_id_ingreso::text,
          case when v_confirmado then 'cancelar' else 'cancelar-borrador' end,
          jsonb_build_object(
            'items_eliminados', v_items,
            'productos_eliminados', v_prods,
            'motivo', p_motivo
          ), p_ip);

  return jsonb_build_object(
    'modo', case when v_confirmado then 'confirmado' else 'borrador' end,
    'items_baja', v_items,
    'productos_eliminados', v_prods
  );
end $$;

grant execute on function sp_cancelar_ingreso(uuid, text, inet) to authenticated;
