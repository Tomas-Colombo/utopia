-- 00011_categoria.sql
-- UP: `categoria` table + `set_updated_at` trigger + RLS
--     (`categoria_all_own_tenant`) (Planificacion.txt Etapa 3 §62,
--     sección 4.1 — Categoria como entidad, seed + alta desde la app).
-- DOWN:
--   drop policy if exists categoria_all_own_tenant on categoria;
--   drop trigger if exists categoria_touch on categoria;
--   drop index if exists categoria_tenant_idx;
--   drop index if exists categoria_tenant_nombre_uk;
--   drop table if exists categoria;

create table if not exists categoria (
  id_categoria uuid primary key default gen_random_uuid(),
  id_tenant    uuid not null references tenant(id_tenant) on delete cascade,
  nombre       text not null,
  descripcion  text,
  activa       boolean not null default true,  -- baja lógica (design §5 confirmaciones)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Nombre único por tenant (dos tenants pueden tener "Camisas" cada uno).
create unique index if not exists categoria_tenant_nombre_uk
  on categoria(id_tenant, lower(nombre));

create index if not exists categoria_tenant_idx on categoria(id_tenant);

create trigger categoria_touch before update on categoria
  for each row execute function set_updated_at();

alter table categoria enable row level security;

create policy categoria_all_own_tenant on categoria for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
