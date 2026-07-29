-- 00015_item_producto.sql
-- UP: `item_producto` (unidad física con QR único + estado) + RLS +
--     índices (Planificacion.txt Etapa 3 §64: ItemProducto con QR
--     único, estadoItem, máquina de estados con transiciones válidas).
--     Transiciones se enforcean por `sp_transicion_item_producto`
--     (00016) — nunca por UPDATE directo. La app llama al RPC.
-- DOWN:
--   drop policy if exists item_producto_all_own_tenant on item_producto;
--   drop trigger if exists item_producto_touch on item_producto;
--   drop index if exists item_producto_producto_estado_idx;
--   drop index if exists item_producto_tenant_estado_idx;
--   drop index if exists item_producto_qr_uk;
--   drop table if exists item_producto;

create table if not exists item_producto (
  id_item          uuid primary key default gen_random_uuid(),
  id_tenant        uuid not null references tenant(id_tenant) on delete cascade,
  id_producto      uuid not null references producto(id_producto) on delete restrict,
  id_ingreso       uuid references ingreso_mercaderia(id_ingreso) on delete set null,
  id_ingreso_detalle uuid references ingreso_mercaderia_detalle(id_detalle) on delete set null,
  qr_code          text not null,
  estado_item      estado_item not null default 'disponible',
  costo_ingreso    numeric(14, 2) not null check (costo_ingreso >= 0),
  tipo_ingreso     tipo_ingreso not null,           -- copiado del ingreso; simplifica queries de consignación
  fecha_ingreso    timestamptz not null default now(),
  fecha_venta      timestamptz,
  fecha_devolucion timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- QR global-único (no por tenant): un QR escaneado debe resolver a UN
-- solo item en el sistema entero. Alineado con el flujo de escaneo
-- del punto 5 del anexo.
create unique index if not exists item_producto_qr_uk on item_producto(qr_code);

create index if not exists item_producto_tenant_estado_idx
  on item_producto(id_tenant, estado_item);
create index if not exists item_producto_producto_estado_idx
  on item_producto(id_producto, estado_item);

create trigger item_producto_touch before update on item_producto
  for each row execute function set_updated_at();

alter table item_producto enable row level security;

create policy item_producto_all_own_tenant on item_producto for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─────────────────────────────────────────────────────────────────
-- MovimientoItem (bitácora inmutable de movimientos por item).
-- Planificacion.txt Etapa 6 §108 la define como append-only con dos
-- movimientos separados (consignacion + devolucion). Se crea acá
-- porque Etapa 3 ya necesita registrar el movimiento de "alta" al
-- confirmar un ingreso. Extendida en Etapas 5/6.
-- ─────────────────────────────────────────────────────────────────
create table if not exists movimiento_item (
  id_movimiento    uuid primary key default gen_random_uuid(),
  id_tenant        uuid not null references tenant(id_tenant) on delete cascade,
  id_item          uuid not null references item_producto(id_item) on delete cascade,
  tipo_movimiento  text not null,                  -- 'alta' | 'venta' | 'reserva' | 'liberacion' | 'consignacion' | 'devolucion' | 'ajuste' | 'baja'
  estado_desde     estado_item,
  estado_hasta     estado_item not null,
  referencia_tipo  text,                           -- 'ingreso' | 'venta' | 'consignacion' | 'reserva' | 'ajuste' (dependiendo del tipo)
  referencia_id    uuid,
  diferencia       jsonb,                          -- ajuste_inventario: { antes, despues } (Etapa 6 §108)
  id_usuario       uuid references usuario(id_usuario) on delete set null,
  ts               timestamptz not null default now()
);

create index if not exists movimiento_item_tenant_ts_idx
  on movimiento_item(id_tenant, ts desc);
create index if not exists movimiento_item_item_ts_idx
  on movimiento_item(id_item, ts desc);

alter table movimiento_item enable row level security;

-- Append-only: sólo INSERT + SELECT, nunca UPDATE ni DELETE
-- (misma estrategia que `auditoria` en 00007).
create policy movimiento_item_select_own_tenant on movimiento_item for select to authenticated
  using (id_tenant = auth_tenant_id());
create policy movimiento_item_insert_own_tenant on movimiento_item for insert to authenticated
  with check (id_tenant = auth_tenant_id());
