-- 00085_consignacion_revendedora_functions.sql
-- Slice 3: Funciones de consignación de salida a revendedora, stock por tenencia y guardia en sp_baja_revendedora (REQ-RV-DB-03).
--
-- DOWN:
-- drop function if exists rf_stock_por_tenencia(uuid);
-- drop function if exists sp_eliminar_consignacion_revendedora(uuid, inet);
-- drop function if exists sp_cerrar_consignacion_revendedora(uuid, inet);
-- drop function if exists sp_registrar_devolucion_revendedora(uuid, uuid[], estado_item, text, inet);
-- drop function if exists sp_confirmar_consignacion_revendedora(uuid, inet);
-- drop function if exists sp_editar_consignacion_revendedora(uuid, text, date, date, inet);
-- drop function if exists sp_crear_consignacion_revendedora_con_items(uuid, uuid[], date, date, text, text, inet);
-- create or replace function sp_baja_revendedora(
--   p_id uuid,
--   p_ip inet default null
-- ) returns void language plpgsql as $$
-- declare
--   v_tenant uuid := auth_tenant_id();
--   v_actor  uuid := auth.uid();
--   v_old    record;
-- begin
--   if v_tenant is null then
--     raise exception 'no-tenant' using errcode = '42501';
--   end if;
--   if not exists (
--     select 1 from tenant_modulo tm
--     join modulo m on m.id_modulo = tm.id_modulo
--     where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
--   ) then
--     raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
--   end if;
--   select * into v_old from revendedora where id_revendedora = p_id and id_tenant = v_tenant for update;
--   if not found then
--     raise exception 'revendedora-not-found' using errcode = 'P0002';
--   end if;
--   if not v_old.activo then
--     return;
--   end if;
--   update revendedora set activo = false where id_revendedora = p_id and id_tenant = v_tenant;
--   insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
--   values (v_tenant, v_actor, 'revendedora', p_id::text, 'baja', jsonb_build_object('activo', false), p_ip);
-- end $$;

-- ─────────────────────────────────────────────────────────────────
-- sp_baja_revendedora (desde 00076): suma validación revendedora-con-stock
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_baja_revendedora(
  p_id uuid,
  p_ip inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_old    record;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select * into v_old from revendedora where id_revendedora = p_id and id_tenant = v_tenant for update;
  if not found then
    raise exception 'revendedora-not-found' using errcode = 'P0002';
  end if;

  if not v_old.activo then
    return;
  end if;

  if exists (
    select 1
      from consignacion_revendedora_detalle d
      join consignacion_revendedora c
        on c.id_consignacion_revendedora = d.id_consignacion_revendedora
       and c.id_tenant = d.id_tenant
     where c.id_tenant = v_tenant
       and c.id_revendedora = p_id
       and d.estado_detalle = 'en_poder'
  ) then
    raise exception 'revendedora-con-stock' using errcode = '22023';
  end if;

  update revendedora
  set activo = false
  where id_revendedora = p_id and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'revendedora', p_id::text, 'baja',
          jsonb_build_object('activo', false), p_ip);
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 1. ALTA EN BORRADOR (revendedora + ítems en lote)
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_crear_consignacion_revendedora_con_items(
  p_id_revendedora uuid,
  p_items          uuid[],
  p_periodo_desde  date default null,
  p_periodo_hasta  date default null,
  p_observaciones  text default null,
  p_motivo         text default null,
  p_ip             inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_rev_activa boolean;
  v_items      uuid[];
  v_total      integer;
  v_id         uuid;
  v_item_id    uuid;
  v_item       item_producto;
  v_id_detalle uuid;
  v_obs        text := nullif(btrim(coalesce(p_observaciones, '')), '');
  v_motivo     text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  if p_id_revendedora is null then
    raise exception 'revendedora-requerida' using errcode = '22023';
  end if;

  if p_periodo_desde is not null and p_periodo_hasta is not null and p_periodo_hasta < p_periodo_desde then
    raise exception 'periodo-invalido' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}')
    into v_items
    from unnest(coalesce(p_items, '{}')) as x
   where x is not null;

  v_total := coalesce(array_length(v_items, 1), 0);
  if v_total = 0 then
    raise exception 'consignacion-vacia' using errcode = '22023';
  end if;

  select activo into v_rev_activa
    from revendedora
   where id_revendedora = p_id_revendedora and id_tenant = v_tenant
   for update;
  if v_rev_activa is null then
    raise exception 'revendedora-not-found' using errcode = '42704';
  end if;
  if not v_rev_activa then
    raise exception 'revendedora-inactiva' using errcode = '22023';
  end if;

  insert into consignacion_revendedora(
    id_tenant, id_revendedora, id_usuario_alta,
    periodo_desde, periodo_hasta, observaciones
  ) values (
    v_tenant, p_id_revendedora, v_actor,
    p_periodo_desde, p_periodo_hasta, v_obs
  ) returning id_consignacion_revendedora into v_id;

  foreach v_item_id in array v_items loop
    select * into v_item
      from item_producto
     where id_item = v_item_id and id_tenant = v_tenant
     for update;

    if v_item.id_item is null then
      raise exception 'item-not-found: %', v_item_id using errcode = '42704';
    end if;

    if v_item.estado_item <> 'disponible'
       or not is_transicion_item_valida(v_item.estado_item, 'en_revendedora') then
      raise exception 'item-no-entregable: % (estado=%)', v_item_id, v_item.estado_item
        using errcode = '22023';
    end if;

    if exists (
      select 1 from detalle_reserva
       where id_item = v_item_id and estado = 'activa'
    ) then
      raise exception 'item-en-reserva: %', v_item_id using errcode = '22023';
    end if;

    if exists (
      select 1 from consignacion_detalle
       where id_item = v_item_id and estado = 'pendiente'
    ) then
      raise exception 'item-ya-en-consignacion-pendiente: %', v_item_id using errcode = '23505';
    end if;

    if exists (
      select 1 from consignacion_revendedora_detalle
       where id_item = v_item_id and estado_detalle in ('pendiente', 'en_poder')
    ) then
      raise exception 'item-ya-en-consignacion-revendedora: %', v_item_id using errcode = '23505';
    end if;

    insert into consignacion_revendedora_detalle(
      id_tenant, id_consignacion_revendedora, id_item, id_producto,
      estado_detalle, motivo
    ) values (
      v_tenant, v_id, v_item_id, v_item.id_producto,
      'pendiente', v_motivo
    ) returning id_consignacion_revendedora_detalle into v_id_detalle;

    insert into movimiento_item(
      id_tenant, id_item, tipo_movimiento,
      estado_desde, estado_hasta,
      referencia_tipo, referencia_id, id_usuario
    ) values (
      v_tenant, v_item_id, 'consignacion_revendedora',
      v_item.estado_item, v_item.estado_item,
      'consignacion_revendedora_detalle', v_id_detalle, v_actor
    );
  end loop;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'consignacion_revendedora', v_id::text, 'crear',
    jsonb_build_object(
      'id_revendedora', p_id_revendedora,
      'periodo_desde', p_periodo_desde,
      'periodo_hasta', p_periodo_hasta,
      'observaciones', v_obs,
      'items', v_total
    ),
    p_ip
  );

  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 2. EDITAR CABECERA
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_editar_consignacion_revendedora(
  p_id_consignacion_revendedora uuid,
  p_observaciones               text default null,
  p_periodo_desde               date default null,
  p_periodo_hasta               date default null,
  p_ip                          inet default null
) returns void language plpgsql as $$
declare
  v_tenant      uuid := auth_tenant_id();
  v_actor       uuid := auth.uid();
  v_consig      consignacion_revendedora;
  v_obs         text := nullif(btrim(coalesce(p_observaciones, '')), '');
  v_desde_final date;
  v_hasta_final date;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select * into v_consig
    from consignacion_revendedora
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant
   for update;

  if v_consig.id_consignacion_revendedora is null then
    raise exception 'consignacion-not-found' using errcode = '42704';
  end if;
  if v_consig.estado <> 'abierta' then
    raise exception 'consignacion-no-activa' using errcode = '22023';
  end if;

  v_desde_final := coalesce(p_periodo_desde, v_consig.periodo_desde);
  v_hasta_final := coalesce(p_periodo_hasta, v_consig.periodo_hasta);
  if v_desde_final is not null and v_hasta_final is not null and v_hasta_final < v_desde_final then
    raise exception 'periodo-invalido' using errcode = '22023';
  end if;

  update consignacion_revendedora
     set observaciones = v_obs,
         periodo_desde = v_desde_final,
         periodo_hasta = v_hasta_final
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'consignacion_revendedora', p_id_consignacion_revendedora::text, 'editar',
    jsonb_build_object(
      'observaciones_antes', v_consig.observaciones,
      'observaciones_despues', v_obs,
      'periodo_desde_antes', v_consig.periodo_desde,
      'periodo_desde_despues', v_desde_final,
      'periodo_hasta_antes', v_consig.periodo_hasta,
      'periodo_hasta_despues', v_hasta_final
    ),
    p_ip
  );
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. CONFIRMAR ENTREGA (mueve ítems a en_revendedora y detalles a en_poder)
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_confirmar_consignacion_revendedora(
  p_id_consignacion_revendedora uuid,
  p_ip                          inet default null
) returns integer language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_consig consignacion_revendedora;
  v_det    record;
  v_item   item_producto;
  v_count  integer := 0;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select * into v_consig
    from consignacion_revendedora
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant
   for update;

  if v_consig.id_consignacion_revendedora is null then
    raise exception 'consignacion-not-found' using errcode = '42704';
  end if;
  if v_consig.estado <> 'abierta' then
    raise exception 'consignacion-no-activa' using errcode = '22023';
  end if;
  if v_consig.confirmada then
    raise exception 'consignacion-ya-confirmada' using errcode = '22023';
  end if;

  for v_det in
    select id_consignacion_revendedora_detalle, id_item
      from consignacion_revendedora_detalle
     where id_consignacion_revendedora = p_id_consignacion_revendedora
       and id_tenant = v_tenant
       and estado_detalle = 'pendiente'
     order by id_item
     for update
  loop
    select * into v_item
      from item_producto
     where id_item = v_det.id_item and id_tenant = v_tenant
     for update;

    if v_item.estado_item <> 'disponible'
       or not is_transicion_item_valida(v_item.estado_item, 'en_revendedora') then
      raise exception 'item-no-entregable: % (estado=%)', v_det.id_item, v_item.estado_item
        using errcode = '22023';
    end if;

    perform sp_transicion_item_producto(
      v_det.id_item,
      'en_revendedora',
      'entrega_revendedora',
      v_det.id_consignacion_revendedora_detalle,
      'consignacion_revendedora_detalle',
      p_ip
    );

    update consignacion_revendedora_detalle
       set estado_detalle = 'en_poder',
           fecha_entrega = now()
     where id_consignacion_revendedora_detalle = v_det.id_consignacion_revendedora_detalle;

    v_count := v_count + 1;
  end loop;

  update consignacion_revendedora
     set confirmada = true,
         fecha_confirmacion = now()
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'consignacion_revendedora', p_id_consignacion_revendedora::text, 'confirmar',
    jsonb_build_object('items_confirmados', v_count),
    p_ip
  );

  return v_count;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 4. DEVOLUCIÓN DE ÍTEMS EN LOTE (disponible o devuelto/baja si dañado)
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_registrar_devolucion_revendedora(
  p_id_consignacion_revendedora uuid,
  p_items                       uuid[],
  p_estado_destino              estado_item default 'disponible',
  p_motivo                      text default null,
  p_ip                          inet default null
) returns integer language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_consig   consignacion_revendedora;
  v_items    uuid[];
  v_total    integer;
  v_item_id  uuid;
  v_det      consignacion_revendedora_detalle;
  v_item     item_producto;
  v_motivo   text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_est_det  estado_consignacion_revendedora_detalle;
  v_count    integer := 0;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  if p_estado_destino not in ('disponible', 'devuelto', 'baja') then
    raise exception 'invalid-transition' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}')
    into v_items
    from unnest(coalesce(p_items, '{}')) as x
   where x is not null;

  v_total := coalesce(array_length(v_items, 1), 0);
  if v_total = 0 then
    raise exception 'items-vacios' using errcode = '22023';
  end if;

  select * into v_consig
    from consignacion_revendedora
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant
   for update;

  if v_consig.id_consignacion_revendedora is null then
    raise exception 'consignacion-not-found' using errcode = '42704';
  end if;
  if v_consig.estado <> 'abierta' then
    raise exception 'consignacion-no-activa' using errcode = '22023';
  end if;
  if not v_consig.confirmada then
    raise exception 'consignacion-no-confirmada' using errcode = '22023';
  end if;

  v_est_det := case
    when p_estado_destino = 'baja' then 'baja'::estado_consignacion_revendedora_detalle
    else 'devuelto'::estado_consignacion_revendedora_detalle
  end;

  foreach v_item_id in array v_items loop
    select * into v_det
      from consignacion_revendedora_detalle
     where id_consignacion_revendedora = p_id_consignacion_revendedora
       and id_item = v_item_id
       and id_tenant = v_tenant
     for update;

    if v_det.id_consignacion_revendedora_detalle is null then
      raise exception 'detalle-not-found' using errcode = '42704';
    end if;
    if v_det.estado_detalle <> 'en_poder' then
      raise exception 'detalle-no-pendiente' using errcode = '22023';
    end if;

    select * into v_item
      from item_producto
     where id_item = v_item_id and id_tenant = v_tenant
     for update;

    if not is_transicion_item_valida(v_item.estado_item, p_estado_destino) then
      raise exception 'invalid-transition' using errcode = '22023';
    end if;

    perform sp_transicion_item_producto(
      v_item_id,
      p_estado_destino,
      'devolucion_revendedora',
      v_det.id_consignacion_revendedora_detalle,
      'consignacion_revendedora_detalle',
      p_ip
    );

    update consignacion_revendedora_detalle
       set estado_detalle = v_est_det,
           fecha_devolucion = now(),
           motivo = coalesce(v_motivo, motivo)
     where id_consignacion_revendedora_detalle = v_det.id_consignacion_revendedora_detalle;

    v_count := v_count + 1;
  end loop;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'consignacion_revendedora', p_id_consignacion_revendedora::text, 'devolucion',
    jsonb_build_object(
      'items_devueltos', v_count,
      'estado_destino', p_estado_destino,
      'motivo', v_motivo
    ),
    p_ip
  );

  return v_count;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 5. CERRAR CONSIGNACIÓN (rechaza si quedan ítems pendientes o en poder)
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_cerrar_consignacion_revendedora(
  p_id_consignacion_revendedora uuid,
  p_ip                          inet default null
) returns void language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_consig   consignacion_revendedora;
  v_en_poder integer;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select * into v_consig
    from consignacion_revendedora
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant
   for update;

  if v_consig.id_consignacion_revendedora is null then
    raise exception 'consignacion-not-found' using errcode = '42704';
  end if;
  if v_consig.estado = 'cerrada' then
    return;
  end if;

  select count(*) into v_en_poder
    from consignacion_revendedora_detalle
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant
     and estado_detalle in ('pendiente', 'en_poder');

  if v_en_poder > 0 then
    raise exception 'consignacion-con-items-en-poder: %', v_en_poder using errcode = '22023';
  end if;

  update consignacion_revendedora
     set estado = 'cerrada',
         fecha_cierre = now()
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'consignacion_revendedora', p_id_consignacion_revendedora::text, 'cerrar',
    '{}'::jsonb,
    p_ip
  );
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 6. ELIMINAR CONSIGNACIÓN (solo borrador no confirmado)
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_eliminar_consignacion_revendedora(
  p_id_consignacion_revendedora uuid,
  p_ip                          inet default null
) returns void language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_consig   consignacion_revendedora;
  v_snapshot jsonb;
  v_borrados integer := 0;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select * into v_consig
    from consignacion_revendedora
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant
   for update;

  if v_consig.id_consignacion_revendedora is null then
    raise exception 'consignacion-not-found' using errcode = '42704';
  end if;

  if v_consig.confirmada or v_consig.estado <> 'abierta' then
    raise exception 'consignacion-confirmada' using errcode = '22023';
  end if;

  select jsonb_build_object(
           'id_revendedora', c.id_revendedora,
           'periodo_desde', c.periodo_desde,
           'periodo_hasta', c.periodo_hasta,
           'observaciones', c.observaciones,
           'detalles', coalesce(jsonb_agg(
             jsonb_build_object(
               'id_item', d.id_item,
               'id_producto', d.id_producto,
               'estado_detalle', d.estado_detalle,
               'motivo', d.motivo
             )
           ) filter (where d.id_consignacion_revendedora_detalle is not null), '[]'::jsonb)
         )
    into v_snapshot
    from consignacion_revendedora c
    left join consignacion_revendedora_detalle d
           on d.id_consignacion_revendedora = c.id_consignacion_revendedora
          and d.id_tenant = c.id_tenant
   where c.id_consignacion_revendedora = p_id_consignacion_revendedora
     and c.id_tenant = v_tenant
   group by c.id_consignacion_revendedora;

  delete from consignacion_revendedora_detalle
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant;
  get diagnostics v_borrados = row_count;

  delete from consignacion_revendedora
   where id_consignacion_revendedora = p_id_consignacion_revendedora
     and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant, v_actor, 'consignacion_revendedora', p_id_consignacion_revendedora::text, 'eliminar',
    coalesce(v_snapshot, '{}'::jsonb) || jsonb_build_object('detalles_borrados', v_borrados),
    p_ip
  );
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 7. LECTURA: rf_stock_por_tenencia (SECURITY INVOKER)
-- ─────────────────────────────────────────────────────────────────

create or replace function rf_stock_por_tenencia(
  p_id_producto uuid default null
) returns table (
  id_producto        uuid,
  disponible_central bigint,
  reservado_central  bigint,
  en_revendedoras    bigint,
  por_revendedora    jsonb
) language plpgsql stable security invoker as $$
declare
  v_tenant uuid := auth_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  return query
  with conteos_item as (
    select
      i.id_producto,
      count(*) filter (where i.estado_item = 'disponible')      as disp_central,
      count(*) filter (where i.estado_item = 'reservado')       as res_central,
      count(*) filter (where i.estado_item = 'en_revendedora')  as en_rev
    from item_producto i
    where i.id_tenant = v_tenant
      and (p_id_producto is null or i.id_producto = p_id_producto)
    group by i.id_producto
  ),
  desglose_rev as (
    select
      d.id_producto,
      jsonb_agg(
        jsonb_build_object(
          'id_revendedora', r.id_revendedora,
          'nombre', r.nombre,
          'apellido', r.apellido,
          'cantidad', sub.cant
        ) order by r.apellido, r.nombre
      ) as detalle_rev
    from (
      select
        d2.id_producto,
        c.id_revendedora,
        count(*) as cant
      from consignacion_revendedora_detalle d2
      join consignacion_revendedora c
        on c.id_consignacion_revendedora = d2.id_consignacion_revendedora
       and c.id_tenant = d2.id_tenant
      where d2.id_tenant = v_tenant
        and d2.estado_detalle = 'en_poder'
        and (p_id_producto is null or d2.id_producto = p_id_producto)
      group by d2.id_producto, c.id_revendedora
    ) sub
    join revendedora r
      on r.id_revendedora = sub.id_revendedora
     and r.id_tenant = v_tenant
    left join lateral (select sub.id_producto) d on true
    group by d.id_producto
  )
  select
    p.id_producto,
    coalesce(ci.disp_central, 0)::bigint as disponible_central,
    coalesce(ci.res_central, 0)::bigint  as reservado_central,
    coalesce(ci.en_rev, 0)::bigint       as en_revendedoras,
    coalesce(dr.detalle_rev, '[]'::jsonb) as por_revendedora
  from producto p
  left join conteos_item ci on ci.id_producto = p.id_producto
  left join desglose_rev dr on dr.id_producto = p.id_producto
  where p.id_tenant = v_tenant
    and (p_id_producto is null or p.id_producto = p_id_producto);
end $$;

grant execute on function sp_baja_revendedora(uuid, inet) to authenticated;
grant execute on function sp_crear_consignacion_revendedora_con_items(uuid, uuid[], date, date, text, text, inet) to authenticated;
grant execute on function sp_editar_consignacion_revendedora(uuid, text, date, date, inet) to authenticated;
grant execute on function sp_confirmar_consignacion_revendedora(uuid, inet) to authenticated;
grant execute on function sp_registrar_devolucion_revendedora(uuid, uuid[], estado_item, text, inet) to authenticated;
grant execute on function sp_cerrar_consignacion_revendedora(uuid, inet) to authenticated;
grant execute on function sp_eliminar_consignacion_revendedora(uuid, inet) to authenticated;
grant execute on function rf_stock_por_tenencia(uuid) to authenticated;
