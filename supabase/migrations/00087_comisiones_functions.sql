-- 00087_comisiones_functions.sql
-- Stored procedures transaccionales para mutaciones de reglas de comisión.
--
-- DOWN:
-- drop function if exists sp_terminar_regla_comision(uuid, date, inet);
-- drop function if exists sp_crear_regla_comision(ambito_comision, text, uuid, date, date, jsonb, inet);

create or replace function sp_crear_regla_comision(
  p_ambito         ambito_comision,
  p_nombre         text,
  p_id_revendedora uuid default null,
  p_vigente_desde  date default current_date,
  p_vigente_hasta  date default null,
  p_escalas        jsonb default '[]'::jsonb,
  p_ip             inet default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_id_regla uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- 1. Validar módulo revendedoras habilitado para el tenant
  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  -- 2. Validar escalas no vacías
  if p_escalas is null or jsonb_typeof(p_escalas) <> 'array' or jsonb_array_length(p_escalas) = 0 then
    raise exception 'escala-comision-invalida' using errcode = '22023';
  end if;

  -- 3. Si es regla propia de revendedora, validar que pertenezca al tenant
  if p_id_revendedora is not null then
    if not exists (
      select 1 from revendedora
      where id_tenant = v_tenant and id_revendedora = p_id_revendedora
    ) then
      raise exception 'revendedora-not-found' using errcode = '42704';
    end if;
  end if;

  -- 4. Insertar regla y tramos de escala en una sola transacción protegiendo exclusión
  begin
    insert into regla_comision(
      id_tenant,
      ambito,
      nombre,
      id_revendedora,
      vigente_desde,
      vigente_hasta,
      activo
    ) values (
      v_tenant,
      p_ambito,
      p_nombre,
      p_id_revendedora,
      p_vigente_desde,
      p_vigente_hasta,
      true
    ) returning id_regla into v_id_regla;

    insert into escala_comision(
      id_tenant,
      id_regla,
      objetivo_desde,
      porcentaje
    )
    select
      v_tenant,
      v_id_regla,
      (elem->>'objetivo_desde')::numeric,
      (elem->>'porcentaje')::numeric
    from jsonb_array_elements(p_escalas) as elem;

  exception
    when exclusion_violation then
      raise exception 'regla-solapada' using errcode = '23P01';
  end;

  -- 5. Auditar creación
  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant,
    v_actor,
    'regla_comision',
    v_id_regla::text,
    'crear',
    jsonb_build_object(
      'ambito', p_ambito,
      'nombre', p_nombre,
      'id_revendedora', p_id_revendedora,
      'vigente_desde', p_vigente_desde,
      'vigente_hasta', p_vigente_hasta,
      'escalas', p_escalas
    ),
    p_ip
  );

  return v_id_regla;
end;
$$;

create or replace function sp_terminar_regla_comision(
  p_id_regla      uuid,
  p_vigente_hasta date default current_date,
  p_ip            inet default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_regla  regla_comision%rowtype;
  v_fecha  date := coalesce(p_vigente_hasta, current_date);
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- 1. Validar módulo revendedoras habilitado
  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  -- 2. Validar que la regla exista en el tenant
  select * into v_regla from regla_comision
  where id_tenant = v_tenant and id_regla = p_id_regla
  for update;

  if not found then
    raise exception 'regla-comision-not-found' using errcode = '42704';
  end if;

  -- 3. Actualizar fecha de fin de vigencia
  begin
    update regla_comision
    set vigente_hasta = v_fecha
    where id_tenant = v_tenant and id_regla = p_id_regla;
  exception
    when exclusion_violation then
      raise exception 'regla-solapada' using errcode = '23P01';
  end;

  -- 4. Auditar término de vigencia
  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (
    v_tenant,
    v_actor,
    'regla_comision',
    p_id_regla::text,
    'terminar',
    jsonb_build_object(
      'vigente_hasta_anterior', v_regla.vigente_hasta,
      'vigente_hasta_nuevo', v_fecha
    ),
    p_ip
  );
end;
$$;

grant execute on function sp_crear_regla_comision(ambito_comision, text, uuid, date, date, jsonb, inet) to authenticated;
grant execute on function sp_terminar_regla_comision(uuid, date, inet) to authenticated;
