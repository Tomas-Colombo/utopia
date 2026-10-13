-- 00086_comisiones.sql
-- Motor de comisiones (REQ-RV-DB-04 / DR-16 / DR-6).
--
-- DOWN:
-- drop function if exists fn_resolver_comision(uuid, date, numeric, ambito_comision);
-- drop policy if exists restrict_revendedora_escala_comision on escala_comision;
-- drop policy if exists restrict_revendedora_regla_comision on regla_comision;
-- drop policy if exists escala_comision_tenant on escala_comision;
-- drop policy if exists regla_comision_tenant on regla_comision;
-- drop table if exists escala_comision;
-- drop table if exists regla_comision;
-- drop type if exists ambito_comision;
-- create or replace function sp_toggle_tenant_modulo(p_id_modulo uuid, p_habilitado boolean, p_ip inet default null)
-- returns void language plpgsql as $$
-- declare
--   v_tenant uuid := auth_tenant_id();
--   v_actor  uuid := auth.uid();
-- begin
--   if v_tenant is null then
--     raise exception 'no-tenant' using errcode = '42501';
--   end if;
--   insert into tenant_modulo(id_tenant, id_modulo, habilitado)
--   values (v_tenant, p_id_modulo, p_habilitado)
--   on conflict (id_tenant, id_modulo)
--   do update set habilitado = excluded.habilitado;
--   insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
--   values (v_tenant, v_actor, 'tenant_modulo', p_id_modulo::text,
--           case when p_habilitado then 'habilitar' else 'deshabilitar' end,
--           jsonb_build_object('habilitado', p_habilitado), p_ip);
-- end $$;
-- grant execute on function sp_toggle_tenant_modulo(uuid, boolean, inet) to authenticated;

create extension if not exists btree_gist;

create type ambito_comision as enum ('revendedora', 'local');

create table if not exists regla_comision (
  id_regla       uuid primary key default gen_random_uuid(),
  id_tenant      uuid not null references tenant(id_tenant) on delete cascade,
  ambito         ambito_comision not null,
  id_revendedora uuid,
  nombre         text not null default '',
  vigente_desde  date not null default current_date,
  vigente_hasta  date,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint regla_comision_tenant_id_uk
    unique (id_tenant, id_regla),

  constraint regla_comision_vigencia_check
    check (vigente_hasta is null or vigente_hasta >= vigente_desde),

  constraint regla_comision_ambito_revendedora_check
    check (ambito = 'revendedora' or id_revendedora is null),

  constraint regla_comision_revendedora_fk
    foreign key (id_tenant, id_revendedora)
    references revendedora(id_tenant, id_revendedora)
    on delete cascade
);

-- Exclusión de vigencias solapadas (DB-04)
-- Regla general: no pueden solaparse vigencias activas del mismo tenant y ámbito
alter table regla_comision
  add constraint regla_comision_general_no_solapada
  exclude using gist (
    id_tenant with =,
    ambito with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  ) where (activo = true and id_revendedora is null);

-- Regla propia: no pueden solaparse vigencias activas de la misma revendedora
alter table regla_comision
  add constraint regla_comision_propia_no_solapada
  exclude using gist (
    id_tenant with =,
    id_revendedora with =,
    daterange(vigente_desde, vigente_hasta, '[]') with &&
  ) where (activo = true and id_revendedora is not null);

create trigger regla_comision_touch
  before update on regla_comision
  for each row execute function set_updated_at();

create table if not exists escala_comision (
  id_escala      uuid primary key default gen_random_uuid(),
  id_tenant      uuid not null references tenant(id_tenant) on delete cascade,
  id_regla       uuid not null,
  objetivo_desde numeric(14,2) not null check (objetivo_desde >= 0),
  porcentaje     numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  created_at     timestamptz not null default now(),

  constraint escala_comision_regla_fk
    foreign key (id_tenant, id_regla)
    references regla_comision(id_tenant, id_regla)
    on delete cascade,

  constraint escala_comision_regla_objetivo_uk
    unique (id_regla, objetivo_desde)
);

create index if not exists escala_comision_regla_idx
  on escala_comision(id_regla, objetivo_desde desc);

-- RLS y políticas restrictivas
alter table regla_comision enable row level security;
alter table escala_comision enable row level security;

create policy regla_comision_tenant on regla_comision
  for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create policy escala_comision_tenant on escala_comision
  for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create policy restrict_revendedora_regla_comision on regla_comision
  as restrictive for all to authenticated
  using (auth_revendedora_id() is null);

create policy restrict_revendedora_escala_comision on escala_comision
  as restrictive for all to authenticated
  using (auth_revendedora_id() is null);

-- fn_resolver_comision (NR-34 / DR-16 / DB-04)
-- Nunca lanza excepción: devuelve 0 con marca sin_regla si no hay regla aplicable.
create or replace function fn_resolver_comision(
  p_id_revendedora uuid default null,
  p_fecha          date default current_date,
  p_monto_periodo  numeric default 0,
  p_ambito         ambito_comision default 'revendedora'
) returns table (
  porcentaje numeric,
  origen     text,
  id_regla   uuid,
  sin_regla  boolean
) language plpgsql security invoker set search_path = public as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_id_regla   uuid := null;
  v_origen     text := null;
  v_porcentaje numeric := null;
begin
  if v_tenant is null then
    porcentaje := 0;
    origen := 'ninguna';
    id_regla := null;
    sin_regla := true;
    return next;
    return;
  end if;

  -- 1. Regla específica de la revendedora si se especificó id_revendedora
  if p_id_revendedora is not null then
    select rc.id_regla, 'propia' into v_id_regla, v_origen
    from regla_comision rc
    where rc.id_tenant = v_tenant
      and rc.ambito = 'revendedora'
      and rc.id_revendedora = p_id_revendedora
      and rc.activo = true
      and rc.vigente_desde <= p_fecha
      and (rc.vigente_hasta is null or rc.vigente_hasta >= p_fecha)
    order by rc.vigente_desde desc
    limit 1;
  end if;

  -- 2. Si no hay regla propia, buscar regla general del tenant
  if v_id_regla is null then
    select rc.id_regla, 'general' into v_id_regla, v_origen
    from regla_comision rc
    where rc.id_tenant = v_tenant
      and rc.ambito = p_ambito
      and rc.id_revendedora is null
      and rc.activo = true
      and rc.vigente_desde <= p_fecha
      and (rc.vigente_hasta is null or rc.vigente_hasta >= p_fecha)
    order by rc.vigente_desde desc
    limit 1;
  end if;

  -- 3. Fallback: sin regla vigente
  if v_id_regla is null then
    porcentaje := 0;
    origen := 'ninguna';
    id_regla := null;
    sin_regla := true;
    return next;
    return;
  end if;

  -- 4. Resolver tramo de la escala según el monto acumulado del período
  select ec.porcentaje into v_porcentaje
  from escala_comision ec
  where ec.id_regla = v_id_regla
    and ec.objetivo_desde <= coalesce(p_monto_periodo, 0)
  order by ec.objetivo_desde desc
  limit 1;

  if v_porcentaje is null then
    -- La regla existe pero no alcanzó el primer objetivo de la escala (piso)
    porcentaje := 0;
    origen := v_origen;
    id_regla := v_id_regla;
    sin_regla := false;
  else
    porcentaje := v_porcentaje;
    origen := v_origen;
    id_regla := v_id_regla;
    sin_regla := false;
  end if;

  return next;
  return;
end;
$$;

grant execute on function fn_resolver_comision(uuid, date, numeric, ambito_comision) to authenticated;

-- sp_toggle_tenant_modulo: actualizada desde 00029 para sembrar regla local con 0% (DR-6)
create or replace function sp_toggle_tenant_modulo(
  p_id_modulo   uuid,
  p_habilitado  boolean,
  p_ip          inet default null
) returns void language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_codigo   text;
  v_id_regla uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- upsert: si no existía la fila la crea; si existía la actualiza.
  insert into tenant_modulo(id_tenant, id_modulo, habilitado)
  values (v_tenant, p_id_modulo, p_habilitado)
  on conflict (id_tenant, id_modulo)
  do update set habilitado = excluded.habilitado;

  -- Semilla de regla general (porcentaje 0 para local, DR-6) al habilitar revendedoras
  if p_habilitado then
    select codigo into v_codigo from modulo where id_modulo = p_id_modulo;
    if v_codigo = 'revendedoras' then
      if not exists (
        select 1 from regla_comision
        where id_tenant = v_tenant
          and ambito = 'local'
          and id_revendedora is null
      ) then
        insert into regla_comision(id_tenant, ambito, nombre, vigente_desde, activo)
        values (v_tenant, 'local', 'Comisión Local (Semilla 0%)', current_date, true)
        returning id_regla into v_id_regla;

        insert into escala_comision(id_tenant, id_regla, objetivo_desde, porcentaje)
        values (v_tenant, v_id_regla, 0, 0);
      end if;
    end if;
  end if;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'tenant_modulo', p_id_modulo::text,
          case when p_habilitado then 'habilitar' else 'deshabilitar' end,
          jsonb_build_object('habilitado', p_habilitado), p_ip);
end $$;

grant execute on function sp_toggle_tenant_modulo(uuid, boolean, inet) to authenticated;
