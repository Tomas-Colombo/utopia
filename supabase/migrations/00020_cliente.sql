-- 00020_cliente.sql
-- UP: `cliente` (sección 4.6, 5-Clientes). Alta, baja lógica, historial.
--     La asociación a Venta/Reserva es opcional — se permiten ventas de
--     mostrador (Ejecucion §L95).
-- DOWN:
--   drop policy if exists cliente_all_own_tenant on cliente;
--   drop trigger if exists cliente_touch on cliente;
--   drop index if exists cliente_tenant_activo_idx;
--   drop index if exists cliente_tenant_email_uk;
--   drop table if exists cliente;

create table if not exists cliente (
  id_cliente   uuid primary key default gen_random_uuid(),
  id_tenant    uuid not null references tenant(id_tenant) on delete cascade,
  nombre       text not null,
  telefono     text,                             -- E.164 recomendado
  email        text,
  notas        text,
  activo       boolean not null default true,    -- baja lógica
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Email único por tenant cuando está presente (partial). No forzamos que
-- sea obligatorio: hay clientes de mostrador que no dan email.
create unique index if not exists cliente_tenant_email_uk
  on cliente(id_tenant, lower(email))
  where email is not null;

create index if not exists cliente_tenant_activo_idx
  on cliente(id_tenant, activo);

create trigger cliente_touch before update on cliente
  for each row execute function set_updated_at();

alter table cliente enable row level security;

create policy cliente_all_own_tenant on cliente for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
