-- 00013_producto.sql
-- UP: `producto` + `costo_producto` (historizado) + RLS + índices
--     (Planificacion.txt Etapa 3 §63: Producto con stockMinimo,
--     CostoProducto historizado, sección 4.3).
--
-- Historización: cada cambio de costo INSERTA una nueva fila en
-- `costo_producto` con `vigente_desde = now()` y cierra la anterior
-- seteando su `vigente_hasta`. La fila con `vigente_hasta IS NULL` es
-- el costo vigente. Se resuelve por `sp_set_costo_producto` (00016).
--
-- DOWN:
--   drop policy if exists costo_producto_all_own_tenant on costo_producto;
--   drop index if exists costo_producto_producto_desde_idx;
--   drop index if exists costo_producto_vigente_uk;
--   drop table if exists costo_producto;
--   drop policy if exists producto_all_own_tenant on producto;
--   drop trigger if exists producto_touch on producto;
--   drop index if exists producto_tenant_idx;
--   drop index if exists producto_tenant_categoria_idx;
--   drop index if exists producto_tenant_sku_uk;
--   drop table if exists producto;

create table if not exists producto (
  id_producto   uuid primary key default gen_random_uuid(),
  id_tenant     uuid not null references tenant(id_tenant) on delete cascade,
  id_categoria  uuid not null references categoria(id_categoria) on delete restrict,
  sku           text,                              -- opcional; algunos catálogos no usan SKU
  nombre        text not null,
  descripcion   text,
  stock_minimo  integer not null default 0 check (stock_minimo >= 0),
  activo        boolean not null default true,     -- baja lógica
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- SKU único por tenant cuando está presente (partial unique index).
create unique index if not exists producto_tenant_sku_uk
  on producto(id_tenant, sku)
  where sku is not null;

create index if not exists producto_tenant_idx on producto(id_tenant);
create index if not exists producto_tenant_categoria_idx on producto(id_tenant, id_categoria);

create trigger producto_touch before update on producto
  for each row execute function set_updated_at();

alter table producto enable row level security;

create policy producto_all_own_tenant on producto for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─────────────────────────────────────────────────────────────────
-- Historización de costos. Nunca se hace UPDATE de `costo`; se
-- inserta una nueva fila y se cierra la anterior. Etapa 4 (precios)
-- va a leer el costo vigente en cada snapshot de venta.
-- ─────────────────────────────────────────────────────────────────
create table if not exists costo_producto (
  id_costo        uuid primary key default gen_random_uuid(),
  id_tenant       uuid not null references tenant(id_tenant) on delete cascade,
  id_producto     uuid not null references producto(id_producto) on delete cascade,
  costo           numeric(14, 2) not null check (costo >= 0),
  moneda          text not null default 'ARS',
  vigente_desde   timestamptz not null default now(),
  vigente_hasta   timestamptz,                     -- NULL = vigente ahora
  id_usuario_alta uuid references usuario(id_usuario) on delete set null,
  motivo          text,
  created_at      timestamptz not null default now()
);

-- Sólo un costo vigente por producto en cualquier momento (partial unique).
create unique index if not exists costo_producto_vigente_uk
  on costo_producto(id_producto)
  where vigente_hasta is null;

create index if not exists costo_producto_producto_desde_idx
  on costo_producto(id_producto, vigente_desde desc);

alter table costo_producto enable row level security;

create policy costo_producto_all_own_tenant on costo_producto for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
