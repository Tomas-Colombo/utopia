-- 00076_revendedora.sql
-- Slice 1: Módulo y entidad revendedora

-- DOWN:
-- drop function if exists sp_baja_revendedora(uuid, inet);
-- drop function if exists sp_editar_revendedora(uuid, text, text, text, text, text, inet);
-- drop function if exists sp_crear_revendedora(text, text, text, text, text, inet);
-- drop table if exists revendedora cascade;
-- delete from modulo where codigo = 'revendedoras';

insert into modulo (codigo, nombre) values ('revendedoras', 'Revendedoras') on conflict (codigo) do nothing;

create table if not exists revendedora (
  id_revendedora uuid primary key default gen_random_uuid(),
  id_tenant      uuid not null references tenant(id_tenant) on delete cascade,
  nombre         text not null,
  apellido       text not null,
  telefono       text,
  email          text,
  notas          text,
  estado         text not null default 'activa' check (estado in ('activa', 'baja')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger revendedora_updated_at
  before update on revendedora
  for each row execute function set_updated_at();

alter table revendedora enable row level security;

create policy revendedora_tenant on revendedora for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create unique index revendedora_email_unico_idx on revendedora (id_tenant, email) where estado = 'activa' and email is not null and email <> '';

create or replace function sp_crear_revendedora(
  _nombre text,
  _apellido text,
  _telefono text default null,
  _email text default null,
  _notas text default null,
  _ip inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
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

  insert into revendedora (id_tenant, nombre, apellido, telefono, email, notas, estado)
  values (v_tenant, _nombre, _apellido, _telefono, _email, _notas, 'activa')
  returning id_revendedora into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'revendedora', v_id::text, 'crear',
          jsonb_build_object('nombre', _nombre, 'apellido', _apellido, 'email', _email, 'telefono', _telefono), _ip);

  return v_id;
end $$;

create or replace function sp_editar_revendedora(
  _id uuid,
  _nombre text,
  _apellido text,
  _telefono text default null,
  _email text default null,
  _notas text default null,
  _ip inet default null
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

  select * into v_old from revendedora where id_revendedora = _id and id_tenant = v_tenant for update;
  if not found then
    raise exception 'revendedora-not-found' using errcode = 'P0002';
  end if;

  update revendedora
  set nombre = _nombre,
      apellido = _apellido,
      telefono = _telefono,
      email = _email,
      notas = _notas
  where id_revendedora = _id and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'revendedora', _id::text, 'editar',
          jsonb_build_object('nombre', _nombre, 'apellido', _apellido, 'email', _email, 'telefono', _telefono), _ip);
end $$;

create or replace function sp_baja_revendedora(
  _id uuid,
  _ip inet default null
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

  select * into v_old from revendedora where id_revendedora = _id and id_tenant = v_tenant for update;
  if not found then
    raise exception 'revendedora-not-found' using errcode = 'P0002';
  end if;
  
  if v_old.estado = 'baja' then
    return;
  end if;

  -- Para el Slice 1, no hay control de mercadería. El Slice 2/3 agregará el check "revendedora-con-stock".
  
  update revendedora
  set estado = 'baja'
  where id_revendedora = _id and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'revendedora', _id::text, 'baja',
          jsonb_build_object('estado', 'baja'), _ip);
end $$;

-- DOWN:
-- drop function if exists sp_baja_revendedora(uuid);
-- drop function if exists sp_editar_revendedora(uuid, text, text, text, text, text);
-- drop function if exists sp_crear_revendedora(text, text, text, text, text);
-- drop table if exists revendedora;
-- delete from modulo where codigo = 'revendedoras';
