-- 00098_cambio_venta.sql
-- Tabla cambio_venta (REQ-RV-DB-07, DR-5, DR-7)
--
-- DOWN:
-- drop policy if exists restrict_revendedora_cambio_venta on cambio_venta;
-- drop policy if exists cambio_venta_tenant on cambio_venta;
-- drop table if exists cambio_venta;

create table if not exists cambio_venta (
  id_cambio             uuid primary key default gen_random_uuid(),
  id_tenant             uuid not null references tenant(id_tenant) on delete cascade,
  id_venta_original     uuid not null references venta(id_venta) on delete cascade,
  id_detalle_original   uuid not null references detalle_venta(id_detalle_venta) on delete cascade,
  id_item_entregado     uuid not null references item_producto(id_item),
  diferencia            numeric(14, 2) not null default 0 check (diferencia >= 0),
  motivo                text,
  origen                canal_venta not null check (origen in ('local', 'revendedora')),
  id_usuario_alta       uuid not null references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint cambio_venta_id_detalle_original_key unique (id_detalle_original)
);

create index if not exists cambio_venta_tenant_venta_idx
  on cambio_venta(id_tenant, id_venta_original);

create index if not exists cambio_venta_tenant_item_entregado_idx
  on cambio_venta(id_tenant, id_item_entregado);

alter table cambio_venta enable row level security;

create policy cambio_venta_tenant on cambio_venta
  for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create policy restrict_revendedora_cambio_venta on cambio_venta
  as restrictive for all to authenticated
  using (auth_revendedora_id() is null);
