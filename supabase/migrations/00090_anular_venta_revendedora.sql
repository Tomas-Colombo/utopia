-- 00090_anular_venta_revendedora.sql
-- DR-7: anular canal revendedora devuelve ítem a en_revendedora; venta-liquidada; devolucion-venta-revendedora.
--
-- DOWN:
-- -- Restaurar is_transicion_item_valida de 00082
-- create or replace function is_transicion_item_valida(
--   p_desde estado_item, p_hasta estado_item
-- ) returns boolean language sql immutable as $$
--   select case
--     when p_desde = 'disponible'       and p_hasta in ('reservado', 'vendido', 'devuelto', 'baja', 'en_revendedora') then true
--     when p_desde = 'reservado'        and p_hasta in ('disponible', 'vendido', 'baja') then true
--     when p_desde = 'vendido'          and p_hasta in ('disponible', 'devuelto_cliente', 'devuelto', 'baja') then true
--     when p_desde = 'devuelto_cliente' and p_hasta in ('disponible', 'baja') then true
--     when p_desde = 'en_revendedora'   and p_hasta in ('disponible', 'vendido', 'devuelto', 'baja') then true
--     else false
--   end;
-- $$;
-- 
-- -- Restaurar sp_anular_venta de 00070
-- create or replace function sp_anular_venta(
--   p_id_venta uuid,
--   p_motivo   text default null,
--   p_ip       inet default null
-- ) returns jsonb language plpgsql as $$
-- declare
--   v_tenant            uuid := auth_tenant_id();
--   v_actor             uuid := auth.uid();
--   v_estado            estado_venta;
--   v_rendida           boolean;
--   v_anuladas          integer := 0;
--   r_det               record;
--   r_pago              record;
--   v_total_reintegrado numeric(14,2) := 0;
--   v_reintegro_pago    numeric(14,2);
--   v_restante          numeric(14,2);
--   v_tiene_incobrables boolean;
-- begin
--   select estado_venta into v_estado from venta
--     where id_venta = p_id_venta and id_tenant = v_tenant for update;
--   if v_estado is null then
--     raise exception 'venta-not-found' using errcode = '42704';
--   end if;
--   if v_estado = 'anulada' then
--     return jsonb_build_object('total_reintegrado', 0);
--   end if;
--   select exists(
--     select 1 from cuota_financiada
--      where id_venta = p_id_venta and estado = 'incobrable'
--   ) into v_tiene_incobrables;
--   if v_tiene_incobrables then
--     raise exception 'venta-con-incobrables' using errcode = '22023';
--   end if;
--   select exists(
--     select 1 from detalle_venta
--      where id_venta = p_id_venta and id_rendicion is not null
--   ) into v_rendida;
--   if v_rendida then
--     raise exception 'venta-ya-rendida' using errcode = '22023';
--   end if;
--   for r_det in
--     select dv.id_item, ip.estado_item
--       from detalle_venta dv
--       join item_producto ip on ip.id_item = dv.id_item
--      where dv.id_venta = p_id_venta
--      for update of ip
--   loop
--     if r_det.estado_item = 'vendido' then
--       perform sp_transicion_item_producto(
--         r_det.id_item, 'disponible', 'ajuste', p_id_venta, 'anulacion_venta', p_ip
--       );
--     end if;
--   end loop;
--   with anuladas as (
--     update cuota_financiada
--        set estado = 'anulada'
--      where id_venta = p_id_venta
--        and estado in ('pendiente', 'parcial')
--     returning 1
--   )
--   select count(*) into v_anuladas from anuladas;
--   v_restante := greatest(0::numeric,
--     (select coalesce(sum(monto), 0) from pago_venta where id_venta = p_id_venta)
--     - (select coalesce(sum(monto), 0) from reintegro_cliente where id_venta = p_id_venta)
--   );
--   for r_pago in
--     select id_pago_venta, id_cuenta_destino, medio, monto
--       from pago_venta
--      where id_venta = p_id_venta
--      order by created_at, id_pago_venta
--   loop
--     v_reintegro_pago := least(v_restante, r_pago.monto - coalesce((
--       select sum(monto) from reintegro_cliente
--        where id_pago_venta = r_pago.id_pago_venta
--     ), 0));
--     if v_reintegro_pago > 0 then
--       insert into reintegro_cliente (
--         id_tenant, id_venta, id_pago_venta, id_cuenta_destino,
--         medio, monto, origen, motivo, id_usuario
--       ) values (
--         v_tenant, p_id_venta, r_pago.id_pago_venta, r_pago.id_cuenta_destino,
--         r_pago.medio, v_reintegro_pago, 'anulacion', p_motivo, v_actor
--       );
--       v_total_reintegrado := v_total_reintegrado + v_reintegro_pago;
--       v_restante := v_restante - v_reintegro_pago;
--     end if;
--   end loop;
--   update venta
--      set estado_venta     = 'anulada',
--          fecha_anulacion  = now(),
--          motivo_anulacion = p_motivo
--    where id_venta = p_id_venta;
--   insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
--   values (v_tenant, v_actor, 'venta', p_id_venta::text, 'anular',
--           jsonb_build_object('motivo', p_motivo, 'cuotas_anuladas', v_anuladas, 'total_reintegrado', v_total_reintegrado),
--           p_ip);
--   return jsonb_build_object('total_reintegrado', v_total_reintegrado);
-- end $$;
-- 
-- -- Restaurar sp_registrar_devolucion_cliente de 00071
-- create or replace function sp_registrar_devolucion_cliente(
--   p_id_detalle_venta    uuid,
--   p_motivo              text default null,
--   p_id_cuenta_reintegro uuid default null,
--   p_medio_reintegro     medio_pago default null,
--   p_ip                  inet default null
-- ) returns jsonb language plpgsql as $$
-- declare
--   v_tenant            uuid := auth_tenant_id();
--   v_actor             uuid := auth.uid();
--   v_id_item           uuid;
--   v_id_venta          uuid;
--   v_id_devolucion     uuid;
--   v_estado_item       estado_item;
--   v_estado_venta      estado_venta;
--   v_total_venta       numeric(14,2);
--   v_precio_venta      numeric(14,2);
--   v_costo_snapshot    numeric(14,2);
--   v_sum_pagos         numeric(14,2);
--   v_sum_dev_previas   numeric(14,2);
--   v_sum_reint_previos numeric(14,2);
--   v_reintegro         numeric(14,2) := 0;
--   v_cuotas_abiertas   boolean;
--   v_ya_devuelta       boolean;
--   v_ya_rendida        boolean;
-- begin
--   select dv.id_item, ip.estado_item, dv.id_venta, dv.precio_venta, dv.costo_snapshot, dv.id_rendicion is not null
--     into v_id_item, v_estado_item, v_id_venta, v_precio_venta, v_costo_snapshot, v_ya_rendida
--     from detalle_venta dv
--     join item_producto ip on ip.id_item = dv.id_item
--    where dv.id_detalle_venta = p_id_detalle_venta
--      and dv.id_tenant = v_tenant
--    for update of ip;
--   if v_id_item is null then
--     raise exception 'detalle-venta-not-found' using errcode = '42704';
--   end if;
--   if v_estado_item <> 'vendido' then
--     raise exception 'item-no-esta-vendido: estado=%', v_estado_item using errcode = '22023';
--   end if;
--   if v_ya_rendida then
--     raise exception 'detalle-ya-rendido' using errcode = '22023';
--   end if;
--   select exists(
--     select 1 from devolucion_venta
--      where id_detalle_venta = p_id_detalle_venta
--   ) into v_ya_devuelta;
--   if v_ya_devuelta then
--     raise exception 'detalle-ya-devuelto' using errcode = '22023';
--   end if;
--   select estado_venta, total into v_estado_venta, v_total_venta
--     from venta
--    where id_venta = v_id_venta for update;
--   if v_estado_venta = 'anulada' then
--     raise exception 'venta-anulada' using errcode = '22023';
--   end if;
--   select exists(
--     select 1 from cuota_financiada
--      where id_venta = v_id_venta and estado in ('pendiente', 'parcial')
--   ) into v_cuotas_abiertas;
--   if v_cuotas_abiertas then
--     raise exception 'devolucion-venta-con-cuotas-abiertas' using errcode = '22023';
--   end if;
--   select coalesce(sum(monto), 0) into v_sum_pagos
--     from pago_venta where id_venta = v_id_venta;
--   select coalesce(sum(dv.precio_venta), 0) into v_sum_dev_previas
--     from devolucion_venta dev
--     join detalle_venta dv on dv.id_detalle_venta = dev.id_detalle_venta
--    where dev.id_venta = v_id_venta;
--   select coalesce(sum(monto), 0) into v_sum_reint_previos
--     from reintegro_cliente
--    where id_venta = v_id_venta;
--   v_reintegro := greatest(0::numeric, v_sum_pagos - (v_total_venta - v_sum_dev_previas - v_precio_venta) - v_sum_reint_previos);
--   if v_reintegro > 0 and (p_id_cuenta_reintegro is null or p_medio_reintegro is null) then
--     raise exception 'reintegro-requiere-cuenta-y-medio' using errcode = '22023';
--   end if;
--   insert into devolucion_venta (
--     id_tenant, id_venta, id_detalle_venta, id_item,
--     monto, costo_recuperado, motivo, id_usuario
--   ) values (
--     v_tenant, v_id_venta, p_id_detalle_venta, v_id_item,
--     v_precio_venta, v_costo_snapshot, p_motivo, v_actor
--   ) returning id_devolucion into v_id_devolucion;
--   if v_reintegro > 0 then
--     insert into reintegro_cliente (
--       id_tenant, id_venta, id_devolucion, id_cuenta_destino,
--       medio, monto, origen, motivo, id_usuario
--     ) values (
--       v_tenant, v_id_venta, v_id_devolucion, p_id_cuenta_reintegro,
--       p_medio_reintegro, v_reintegro, 'devolucion', p_motivo, v_actor
--     );
--   end if;
--   perform sp_transicion_item_producto(
--     v_id_item, 'devuelto_cliente', 'ajuste',
--     p_id_detalle_venta, 'devolucion_cliente', p_ip
--   );
--   insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
--   values (v_tenant, v_actor, 'detalle_venta', p_id_detalle_venta::text, 'devolucion_cliente',
--           jsonb_build_object('motivo', p_motivo, 'reintegro', v_reintegro), p_ip);
--   return jsonb_build_object('reintegro', v_reintegro);
-- end $$;

-- 1. Permitir transición de 'vendido' a 'en_revendedora' para anulación de venta revendedora
create or replace function is_transicion_item_valida(
  p_desde estado_item, p_hasta estado_item
) returns boolean language sql immutable as $$
  select case
    when p_desde = 'disponible'       and p_hasta in ('reservado', 'vendido', 'devuelto', 'baja', 'en_revendedora') then true
    when p_desde = 'reservado'        and p_hasta in ('disponible', 'vendido', 'baja') then true
    when p_desde = 'vendido'          and p_hasta in ('disponible', 'devuelto_cliente', 'devuelto', 'baja', 'en_revendedora') then true
    when p_desde = 'devuelto_cliente' and p_hasta in ('disponible', 'baja') then true
    when p_desde = 'en_revendedora'   and p_hasta in ('disponible', 'vendido', 'devuelto', 'baja') then true
    else false
  end;
$$;

-- 2. sp_anular_venta con soporte de canal revendedora y guarda contra ventas liquidadas (DR-7)
create or replace function sp_anular_venta(
  p_id_venta uuid,
  p_motivo   text default null,
  p_ip       inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant            uuid := auth_tenant_id();
  v_actor             uuid := auth.uid();
  v_estado            estado_venta;
  v_canal             canal_venta;
  v_rendida           boolean;
  v_liquidada         boolean;
  v_anuladas          integer := 0;
  r_det               record;
  r_pago              record;
  v_total_reintegrado numeric(14,2) := 0;
  v_reintegro_pago    numeric(14,2);
  v_restante          numeric(14,2);
  v_tiene_incobrables boolean;
begin
  select estado_venta, canal into v_estado, v_canal from venta
    where id_venta = p_id_venta and id_tenant = v_tenant for update;
  
  if v_estado is null then
    raise exception 'venta-not-found' using errcode = '42704';
  end if;
  
  if v_estado = 'anulada' then
    return jsonb_build_object('total_reintegrado', 0); -- idempotente
  end if;

  select exists(
    select 1 from cuota_financiada
     where id_venta = p_id_venta and estado = 'incobrable'
  ) into v_tiene_incobrables;
  
  if v_tiene_incobrables then
    raise exception 'venta-con-incobrables' using errcode = '22023';
  end if;

  select exists(
    select 1 from detalle_venta
     where id_venta = p_id_venta and id_rendicion is not null
  ) into v_rendida;
  
  if v_rendida then
    raise exception 'venta-ya-rendida' using errcode = '22023';
  end if;

  select exists(
    select 1 from detalle_venta
     where id_venta = p_id_venta and id_liquidacion is not null
  ) into v_liquidada;
  
  if v_liquidada then
    raise exception 'venta-liquidada' using errcode = '22023';
  end if;

  for r_det in
    select dv.id_item, ip.estado_item
      from detalle_venta dv
      join item_producto ip on ip.id_item = dv.id_item
     where dv.id_venta = p_id_venta
     for update of ip
  loop
    if r_det.estado_item = 'vendido' then
      if v_canal = 'revendedora' then
        perform sp_transicion_item_producto(
          r_det.id_item, 'en_revendedora', 'ajuste', p_id_venta, 'anulacion_venta', p_ip
        );
        update consignacion_revendedora_detalle
           set estado_detalle = 'en_poder'
         where id_item = r_det.id_item and estado_detalle = 'vendido';
      else
        perform sp_transicion_item_producto(
          r_det.id_item, 'disponible', 'ajuste', p_id_venta, 'anulacion_venta', p_ip
        );
      end if;
    end if;
  end loop;

  with anuladas as (
    update cuota_financiada
       set estado = 'anulada'
     where id_venta = p_id_venta
       and estado in ('pendiente', 'parcial')
    returning 1
  )
  select count(*) into v_anuladas from anuladas;

  -- Lo que queda por devolver es lo cobrado menos TODO lo ya reintegrado de la
  -- venta. Los reintegros de una devolución no cuelgan de un pago (id_pago_venta
  -- nulo), así que restar solo los de cada pago devolvía dos veces esa plata.
  v_restante := greatest(0::numeric,
    (select coalesce(sum(monto), 0) from pago_venta where id_venta = p_id_venta)
    - (select coalesce(sum(monto), 0) from reintegro_cliente where id_venta = p_id_venta)
  );

  for r_pago in
    select id_pago_venta, id_cuenta_destino, medio, monto
      from pago_venta
     where id_venta = p_id_venta
     order by created_at, id_pago_venta
  loop
    v_reintegro_pago := least(v_restante, r_pago.monto - coalesce((
      select sum(monto) from reintegro_cliente
       where id_pago_venta = r_pago.id_pago_venta
    ), 0));
    
    if v_reintegro_pago > 0 then
      insert into reintegro_cliente (
        id_tenant, id_venta, id_pago_venta, id_cuenta_destino,
        medio, monto, origen, motivo, id_usuario
      ) values (
        v_tenant, p_id_venta, r_pago.id_pago_venta, r_pago.id_cuenta_destino,
        r_pago.medio, v_reintegro_pago, 'anulacion', p_motivo, v_actor
      );
      v_total_reintegrado := v_total_reintegrado + v_reintegro_pago;
      v_restante := v_restante - v_reintegro_pago;
    end if;
  end loop;

  update venta
     set estado_venta     = 'anulada',
         fecha_anulacion  = now(),
         motivo_anulacion = p_motivo
   where id_venta = p_id_venta;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'venta', p_id_venta::text, 'anular',
          jsonb_build_object('motivo', p_motivo, 'cuotas_anuladas', v_anuladas, 'total_reintegrado', v_total_reintegrado),
          p_ip);

  return jsonb_build_object('total_reintegrado', v_total_reintegrado);
end $$;

-- 3. sp_registrar_devolucion_cliente: rechaza canal revendedora con devolucion-venta-revendedora (DR-7)
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
  v_canal             canal_venta;
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

  select estado_venta, total, canal into v_estado_venta, v_total_venta, v_canal
    from venta
   where id_venta = v_id_venta for update;

  if v_canal = 'revendedora' then
    raise exception 'devolucion-venta-revendedora' using errcode = '22023';
  end if;

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

grant execute on function sp_anular_venta(uuid, text, inet) to authenticated;
grant execute on function sp_registrar_devolucion_cliente(uuid, text, uuid, medio_pago, inet) to authenticated;
