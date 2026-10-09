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
  fecha_alta     date not null default current_date,
  activo         boolean not null default true,
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

create unique index revendedora_email_unico_idx on revendedora (id_tenant, email) where activo = true and email is not null and email <> '';

create or replace function sp_crear_revendedora(
  p_nombre text,
  p_apellido text,
  p_telefono text default null,
  p_email text default null,
  p_notas text default null,
  p_ip inet default null
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

  insert into revendedora (id_tenant, nombre, apellido, telefono, email, notas, activo, fecha_alta)
  values (v_tenant, p_nombre, p_apellido, p_telefono, p_email, p_notas, true, current_date)
  returning id_revendedora into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'revendedora', v_id::text, 'crear',
          jsonb_build_object('nombre', p_nombre, 'apellido', p_apellido, 'email', p_email, 'telefono', p_telefono), p_ip);

  return v_id;
end $$;

create or replace function sp_editar_revendedora(
  p_id uuid,
  p_nombre text,
  p_apellido text,
  p_telefono text default null,
  p_email text default null,
  p_notas text default null,
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

  update revendedora
  set nombre = p_nombre,
      apellido = p_apellido,
      telefono = p_telefono,
      email = p_email,
      notas = p_notas
  where id_revendedora = p_id and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'revendedora', p_id::text, 'editar',
          jsonb_build_object('nombre', p_nombre, 'apellido', p_apellido, 'email', p_email, 'telefono', p_telefono), p_ip);
end $$;

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

  -- Para el Slice 1, no hay control de mercadería. El Slice 2/3 agregará el check "revendedora-con-stock".
  
  update revendedora
  set activo = false
  where id_revendedora = p_id and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'revendedora', p_id::text, 'baja',
          jsonb_build_object('activo', false), p_ip);
end $$;
