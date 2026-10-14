-- 00104_declaracion_venta_functions.sql
-- Slice 9b: Stored procedures para declarar, retirar, confirmar y rechazar ventas de revendedoras (REQ-RV-ACC-31..32, DR-11)
--
-- UP:
--   1. sp_declarar_venta_revendedora (INVOKER, solo sesión con auth_revendedora_id).
--   2. sp_retirar_declaracion (INVOKER, ella retira una declaración propia pendiente).
--   3. sp_confirmar_declaracion_venta (INVOKER, solo operador, registra venta canal revendedora).
--   4. sp_rechazar_declaracion_venta (INVOKER, solo operador, exige motivo).
--
-- DOWN:
--   drop function if exists sp_rechazar_declaracion_venta(uuid, text);
--   drop function if exists sp_confirmar_declaracion_venta(uuid);
--   drop function if exists sp_retirar_declaracion(uuid);
--   drop function if exists sp_declarar_venta_revendedora(uuid, text);

-- ─── 1. sp_declarar_venta_revendedora ─────────────────────────────────────

create or replace function sp_declarar_venta_revendedora(
  p_id_item uuid,
  p_nota    text default ''
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant         uuid := auth_tenant_id();
  v_actor          uuid := auth.uid();
  v_revendedora_id uuid := auth_revendedora_id();
  v_item           item_producto;
  v_id_crd         uuid;
  v_id_declaracion uuid;
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

  -- Identidad únicamente del claim (ACC-12 / ACC-05)
  if v_revendedora_id is null then
    raise exception 'no-revendedora' using errcode = '42501';
  end if;

  if p_id_item is null then
    raise exception 'item-invalido' using errcode = '22023';
  end if;

  -- Bloquear y validar ítem
  select * into v_item
  from item_producto
  where id_tenant = v_tenant and id_item = p_id_item
  for update;

  if v_item.id_item is null then
    raise exception 'item-not-found' using errcode = '42704';
  end if;

  if v_item.estado_item <> 'en_revendedora' then
    raise exception 'item-no-disponible' using errcode = '22023';
  end if;

  -- El ítem debe estar en consignación abierta, confirmada y en poder de ELLA
  select crd.id_consignacion_revendedora_detalle into v_id_crd
  from consignacion_revendedora_detalle crd
  join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
  where crd.id_item = p_id_item
    and cr.id_tenant = v_tenant
    and cr.id_revendedora = v_revendedora_id
    and cr.confirmada = true
    and cr.estado = 'abierta'
    and crd.estado_detalle = 'en_poder'
  for update of crd;

  if v_id_crd is null then
    raise exception 'item-no-en-poder' using errcode = '22023';
  end if;

  -- No puede haber dos declaraciones pendientes para el mismo ítem
  if exists (
    select 1 from declaracion_venta_revendedora
    where id_tenant = v_tenant and id_item = p_id_item and estado = 'pendiente'
  ) then
    raise exception 'declaracion-duplicada' using errcode = '22023';
  end if;

  -- Insertar declaración en estado pendiente
  insert into declaracion_venta_revendedora (
    id_tenant, id_revendedora, id_item, fecha, nota, estado
  ) values (
    v_tenant, v_revendedora_id, p_id_item, current_date, coalesce(p_nota, ''), 'pendiente'
  ) returning id_declaracion into v_id_declaracion;

  -- Auditoría
  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios)
  values (
    v_tenant, v_actor, 'declaracion_venta_revendedora', v_id_declaracion::text,
    'declarar_venta_revendedora',
    jsonb_build_object('id_item', p_id_item, 'id_revendedora', v_revendedora_id, 'nota', p_nota)
  );

  return v_id_declaracion;
end;
$$;

grant execute on function sp_declarar_venta_revendedora(uuid, text) to authenticated;

-- ─── 2. sp_retirar_declaracion ───────────────────────────────────────────

create or replace function sp_retirar_declaracion(
  p_id_declaracion uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant         uuid := auth_tenant_id();
  v_actor          uuid := auth.uid();
  v_revendedora_id uuid := auth_revendedora_id();
  v_dec            declaracion_venta_revendedora;
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

  if v_revendedora_id is null then
    raise exception 'no-revendedora' using errcode = '42501';
  end if;

  select * into v_dec
  from declaracion_venta_revendedora
  where id_tenant = v_tenant and id_declaracion = p_id_declaracion
  for update;

  if v_dec.id_declaracion is null then
    raise exception 'declaracion-no-encontrada' using errcode = '42704';
  end if;

  if v_dec.id_revendedora <> v_revendedora_id then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if v_dec.estado <> 'pendiente' then
    raise exception 'declaracion-no-pendiente' using errcode = '22023';
  end if;

  delete from declaracion_venta_revendedora
  where id_declaracion = p_id_declaracion and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios)
  values (
    v_tenant, v_actor, 'declaracion_venta_revendedora', p_id_declaracion::text,
    'retirar_declaracion',
    jsonb_build_object('id_item', v_dec.id_item, 'id_revendedora', v_dec.id_revendedora)
  );
end;
$$;

grant execute on function sp_retirar_declaracion(uuid) to authenticated;

-- ─── 3. sp_confirmar_declaracion_venta ───────────────────────────────────

create or replace function sp_confirmar_declaracion_venta(
  p_id_declaracion uuid
) returns uuid language plpgsql security invoker as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_dec      declaracion_venta_revendedora;
  v_id_venta uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Solo operador del local (sin claim de revendedora)
  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  select * into v_dec
  from declaracion_venta_revendedora
  where id_tenant = v_tenant and id_declaracion = p_id_declaracion
  for update;

  if v_dec.id_declaracion is null then
    raise exception 'declaracion-no-encontrada' using errcode = '42704';
  end if;

  if v_dec.estado <> 'pendiente' then
    raise exception 'declaracion-no-pendiente' using errcode = '22023';
  end if;

  -- Registrar la venta a través de sp_registrar_venta (canal revendedora, pago cuenta_revendedora automático)
  v_id_venta := sp_registrar_venta(
    p_lineas := jsonb_build_array(jsonb_build_object('id_item', v_dec.id_item)),
    p_canal := 'revendedora',
    p_id_revendedora := v_dec.id_revendedora
  );

  update declaracion_venta_revendedora
  set estado = 'confirmada',
      id_venta = v_id_venta,
      confirmada_por = v_actor,
      updated_at = now()
  where id_declaracion = p_id_declaracion and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios)
  values (
    v_tenant, v_actor, 'declaracion_venta_revendedora', p_id_declaracion::text,
    'confirmar_declaracion_venta',
    jsonb_build_object('id_venta', v_id_venta, 'id_item', v_dec.id_item, 'id_revendedora', v_dec.id_revendedora)
  );

  return v_id_venta;
end;
$$;

grant execute on function sp_confirmar_declaracion_venta(uuid) to authenticated;

-- ─── 4. sp_rechazar_declaracion_venta ────────────────────────────────────

create or replace function sp_rechazar_declaracion_venta(
  p_id_declaracion uuid,
  p_motivo         text
) returns void language plpgsql security invoker as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_dec    declaracion_venta_revendedora;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Solo operador del local
  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  -- Motivo obligatorio
  if v_motivo is null then
    raise exception 'motivo-requerido' using errcode = '22023';
  end if;

  select * into v_dec
  from declaracion_venta_revendedora
  where id_tenant = v_tenant and id_declaracion = p_id_declaracion
  for update;

  if v_dec.id_declaracion is null then
    raise exception 'declaracion-no-encontrada' using errcode = '42704';
  end if;

  if v_dec.estado <> 'pendiente' then
    raise exception 'declaracion-no-pendiente' using errcode = '22023';
  end if;

  update declaracion_venta_revendedora
  set estado = 'rechazada',
      motivo_rechazo = v_motivo,
      confirmada_por = v_actor,
      updated_at = now()
  where id_declaracion = p_id_declaracion and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios)
  values (
    v_tenant, v_actor, 'declaracion_venta_revendedora', p_id_declaracion::text,
    'rechazar_declaracion_venta',
    jsonb_build_object('id_item', v_dec.id_item, 'id_revendedora', v_dec.id_revendedora, 'motivo', v_motivo)
  );
end;
$$;

grant execute on function sp_rechazar_declaracion_venta(uuid, text) to authenticated;
