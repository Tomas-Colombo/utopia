-- 00105_declaracion_venta_invoker.sql
-- Slice 9b (corrección): sp_declarar_venta_revendedora y sp_retirar_declaracion pasan a SECURITY INVOKER.
-- Nueva función rvp_item_en_mi_poder (SECURITY DEFINER, DR-13).
--
-- UP:
--   1. Agrega valor 'retirada' al enum estado_declaracion.
--   2. Permite UPDATE acotado para que la revendedora pueda marcar 'retirada' su declaración pendiente.
--   3. Trigger de inmutabilidad para impedir que la revendedora modifique otros campos.
--   4. Función rvp_item_en_mi_poder (SECURITY DEFINER, DR-13).
--   5. Redefinición de sp_declarar_venta_revendedora y sp_retirar_declaracion (SECURITY INVOKER).
--
-- DOWN:
--   drop function if exists sp_retirar_declaracion(uuid);
--   drop function if exists sp_declarar_venta_revendedora(uuid, text);
--   drop function if exists rvp_item_en_mi_poder(uuid);
--   drop trigger if exists tg_declaracion_revendedora_inmutable on declaracion_venta_revendedora;
--   drop function if exists fn_declaracion_revendedora_inmutable();
--   drop policy if exists restrict_revendedora_declaracion_update on declaracion_venta_revendedora;
--   create policy restrict_revendedora_declaracion_update on declaracion_venta_revendedora
--     as restrictive for update to authenticated
--     using (auth_revendedora_id() is null)
--     with check (auth_revendedora_id() is null);

-- 1. Agregar valor 'retirada' al enum estado_declaracion
alter type estado_declaracion add value if not exists 'retirada';

-- 2. Actualizar policy restrictiva de UPDATE en declaracion_venta_revendedora
-- Se evita usar el literal 'retirada'::estado_declaracion directamente en la policy para prevenir 55P04 en la misma transacción DDL.
-- La validación exacta de estado = 'retirada' e inmutabilidad de columnas se delega al trigger.
drop policy if exists restrict_revendedora_declaracion_update on declaracion_venta_revendedora;

create policy restrict_revendedora_declaracion_update on declaracion_venta_revendedora
  as restrictive for update to authenticated
  using (auth_revendedora_id() is null or (id_revendedora = auth_revendedora_id() and estado = 'pendiente'))
  with check (auth_revendedora_id() is null or id_revendedora = auth_revendedora_id());

-- 3. Trigger para garantizar que la revendedora no modifique otros campos al retirar
create or replace function fn_declaracion_revendedora_inmutable()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if auth_revendedora_id() is not null then
    if old.id_declaracion <> new.id_declaracion
       or old.id_tenant <> new.id_tenant
       or old.id_revendedora <> new.id_revendedora
       or old.id_item <> new.id_item
       or old.fecha <> new.fecha
       or old.nota <> new.nota
       or old.id_venta is distinct from new.id_venta
       or old.motivo_rechazo is distinct from new.motivo_rechazo
       or old.confirmada_por is distinct from new.confirmada_por
       or old.created_at <> new.created_at
       or old.estado <> 'pendiente'
       or new.estado::text <> 'retirada' then
      raise exception 'no-permission' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_declaracion_revendedora_inmutable on declaracion_venta_revendedora;
create trigger tg_declaracion_revendedora_inmutable
  before update on declaracion_venta_revendedora
  for each row execute function fn_declaracion_revendedora_inmutable();

-- 4. Función de LECTURA rvp_item_en_mi_poder (SECURITY DEFINER, DR-13)
create or replace function rvp_item_en_mi_poder(
  p_id_item uuid
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant         uuid := auth_tenant_id();
  v_revendedora_id uuid := auth_revendedora_id();
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

  if p_id_item is null then
    return false;
  end if;

  return exists (
    select 1
    from consignacion_revendedora_detalle crd
    join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
    join item_producto ip on ip.id_item = crd.id_item and ip.id_tenant = cr.id_tenant
    where crd.id_item = p_id_item
      and cr.id_tenant = v_tenant
      and cr.id_revendedora = v_revendedora_id
      and cr.confirmada = true
      and cr.estado = 'abierta'
      and crd.estado_detalle = 'en_poder'
      and ip.estado_item = 'en_revendedora'
  );
end;
$$;

revoke execute on function rvp_item_en_mi_poder(uuid) from public;
grant execute on function rvp_item_en_mi_poder(uuid) to authenticated;

-- 5. sp_declarar_venta_revendedora (SECURITY INVOKER)
create or replace function sp_declarar_venta_revendedora(
  p_id_item uuid,
  p_nota    text default ''
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tenant         uuid := auth_tenant_id();
  v_revendedora_id uuid := auth_revendedora_id();
  v_id_declaracion uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Si es operador (sin claim revendedora), validar módulo antes de rechazar
  if v_revendedora_id is null then
    if not exists (
      select 1 from tenant_modulo tm
      join modulo m on m.id_modulo = tm.id_modulo
      where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
    ) then
      raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
    end if;
    raise exception 'no-revendedora' using errcode = '42501';
  end if;

  if p_id_item is null then
    raise exception 'item-invalido' using errcode = '22023';
  end if;

  -- Valida módulo e ítem en su poder mediante rvp_item_en_mi_poder
  if not rvp_item_en_mi_poder(p_id_item) then
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

  return v_id_declaracion;
end;
$$;

grant execute on function sp_declarar_venta_revendedora(uuid, text) to authenticated;

-- 6. sp_retirar_declaracion (SECURITY INVOKER)
create or replace function sp_retirar_declaracion(
  p_id_declaracion uuid
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tenant         uuid := auth_tenant_id();
  v_revendedora_id uuid := auth_revendedora_id();
  v_dec            declaracion_venta_revendedora;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Si es operador, validar módulo antes de rechazar
  if v_revendedora_id is null then
    if not exists (
      select 1 from tenant_modulo tm
      join modulo m on m.id_modulo = tm.id_modulo
      where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
    ) then
      raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
    end if;
    raise exception 'no-revendedora' using errcode = '42501';
  end if;

  -- Validar módulo llamando rvp_item_en_mi_poder(null)
  perform rvp_item_en_mi_poder(null);

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

  update declaracion_venta_revendedora
  set estado = 'retirada'
  where id_declaracion = p_id_declaracion and id_tenant = v_tenant;
end;
$$;

grant execute on function sp_retirar_declaracion(uuid) to authenticated;
