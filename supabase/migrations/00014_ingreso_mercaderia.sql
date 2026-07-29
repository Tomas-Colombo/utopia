-- 00014_ingreso_mercaderia.sql
-- UP: `ingreso_mercaderia` (cabecera) + `ingreso_mercaderia_detalle`
--     (líneas) + RLS + índices (Planificacion.txt Etapa 3 §65:
--     IngresoMercaderia con tipoIngreso; §67: RF-01 PDF proveedor →
--     parseo → previsualización editable → confirmación). El detalle
--     mapea 1:1 con los `item_producto` generados al confirmar el
--     ingreso (00015 depende de esto).
-- DOWN:
--   drop policy if exists ingreso_detalle_all_own_tenant on ingreso_mercaderia_detalle;
--   drop index if exists ingreso_detalle_ingreso_idx;
--   drop table if exists ingreso_mercaderia_detalle;
--   drop policy if exists ingreso_mercaderia_all_own_tenant on ingreso_mercaderia;
--   drop trigger if exists ingreso_mercaderia_touch on ingreso_mercaderia;
--   drop index if exists ingreso_mercaderia_tenant_fecha_idx;
--   drop index if exists ingreso_mercaderia_proveedor_idx;
--   drop table if exists ingreso_mercaderia;

create table if not exists ingreso_mercaderia (
  id_ingreso        uuid primary key default gen_random_uuid(),
  id_tenant         uuid not null references tenant(id_tenant) on delete cascade,
  id_proveedor      uuid not null references proveedor(id_proveedor) on delete restrict,
  tipo_ingreso      tipo_ingreso not null,
  fecha             timestamptz not null default now(),
  numero_remito     text,                          -- número del remito/factura del proveedor
  pdf_url           text,                          -- storage bucket path (stub Etapa 3, real Etapa 4+)
  observaciones     text,
  confirmado        boolean not null default false,-- true = ya generó items; false = borrador
  id_usuario_alta   uuid references usuario(id_usuario) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ingreso_mercaderia_tenant_fecha_idx
  on ingreso_mercaderia(id_tenant, fecha desc);
create index if not exists ingreso_mercaderia_proveedor_idx
  on ingreso_mercaderia(id_tenant, id_proveedor);

create trigger ingreso_mercaderia_touch before update on ingreso_mercaderia
  for each row execute function set_updated_at();

alter table ingreso_mercaderia enable row level security;

create policy ingreso_mercaderia_all_own_tenant on ingreso_mercaderia for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─────────────────────────────────────────────────────────────────
-- Detalle: línea por producto + cantidad + costo unitario. Al
-- confirmar el ingreso, sp_confirmar_ingreso genera N item_producto
-- (donde N = suma de cantidades).
-- ─────────────────────────────────────────────────────────────────
create table if not exists ingreso_mercaderia_detalle (
  id_detalle        uuid primary key default gen_random_uuid(),
  id_tenant         uuid not null references tenant(id_tenant) on delete cascade,
  id_ingreso        uuid not null references ingreso_mercaderia(id_ingreso) on delete cascade,
  id_producto       uuid not null references producto(id_producto) on delete restrict,
  cantidad          integer not null check (cantidad > 0),
  costo_unitario    numeric(14, 2) not null check (costo_unitario >= 0),
  created_at        timestamptz not null default now()
);

create index if not exists ingreso_detalle_ingreso_idx
  on ingreso_mercaderia_detalle(id_ingreso);

alter table ingreso_mercaderia_detalle enable row level security;

create policy ingreso_detalle_all_own_tenant on ingreso_mercaderia_detalle for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
