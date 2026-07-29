-- 00012_proveedor.sql
-- UP: `proveedor` table + RLS + trigger (Planificacion.txt Etapa 3 §66:
--     tipo, teléfono, diasRotacion, botón wa.me). Botón wa.me se arma en
--     UI desde el teléfono; no requiere columna extra.
-- DOWN:
--   drop policy if exists proveedor_all_own_tenant on proveedor;
--   drop trigger if exists proveedor_touch on proveedor;
--   drop index if exists proveedor_tenant_idx;
--   drop index if exists proveedor_tenant_nombre_uk;
--   drop table if exists proveedor;

create table if not exists proveedor (
  id_proveedor   uuid primary key default gen_random_uuid(),
  id_tenant      uuid not null references tenant(id_tenant) on delete cascade,
  nombre         text not null,
  tipo           tipo_proveedor not null default 'mayorista',
  telefono       text,                             -- E.164 recomendado; UI construye wa.me/<telefono>
  email          text,
  cuit           text,                             -- opcional; sin validación en DB
  dias_rotacion  integer,                          -- RF-12: días esperados para rotar consigna
  notas          text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Nombre único por tenant (case-insensitive).
create unique index if not exists proveedor_tenant_nombre_uk
  on proveedor(id_tenant, lower(nombre));

create index if not exists proveedor_tenant_idx on proveedor(id_tenant);

create trigger proveedor_touch before update on proveedor
  for each row execute function set_updated_at();

alter table proveedor enable row level security;

create policy proveedor_all_own_tenant on proveedor for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
