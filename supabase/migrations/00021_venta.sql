-- 00021_venta.sql
-- UP: `venta` + `detalle_venta` + `comprobante` (RF-08, §L35).
--     - Venta.total = suma de precio_venta de sus detalles (validado
--       en la transacción de sp_registrar_venta, no acá; check DB sería
--       circular con el orden de INSERTs).
--     - DetalleVenta separa monto_proveedor / monto_gasto / monto_ganancia.
--       Si el ítem viene de tipo_ingreso='compra', monto_proveedor=0
--       (Ejecucion §L26 y §L35). Si es 'consignacion', monto_proveedor =
--       costo_ingreso, monto_ganancia = precio_venta - monto_proveedor.
--     - idRendicion NULL = "pendiente de rendir" (Etapa 7).
--     - excluida_rendicion excluye manualmente esa línea de rendiciones
--       futuras (§L45 y §L227).
--     - Comprobante: solo metadatos (tipo/numero/fechaEmision); PDF real
--       se genera on-demand a partir de venta+detalle (§L37).
-- DOWN: (drops en orden inverso al final)

create type estado_venta as enum ('registrada', 'anulada');

create table if not exists venta (
  id_venta        uuid primary key default gen_random_uuid(),
  id_tenant       uuid not null references tenant(id_tenant) on delete cascade,
  id_cliente      uuid references cliente(id_cliente) on delete set null,
  id_usuario_alta uuid references usuario(id_usuario) on delete set null,

  fecha           timestamptz not null default now(),
  forma_pago      forma_pago not null default 'efectivo',
  total           numeric(14, 2) not null check (total >= 0),
  observaciones   text,
  estado_venta    estado_venta not null default 'registrada',
  fecha_anulacion timestamptz,
  motivo_anulacion text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists venta_tenant_fecha_idx on venta(id_tenant, fecha desc);
create index if not exists venta_tenant_cliente_idx on venta(id_tenant, id_cliente);
create index if not exists venta_tenant_estado_idx on venta(id_tenant, estado_venta);

create trigger venta_touch before update on venta
  for each row execute function set_updated_at();

alter table venta enable row level security;

create policy venta_all_own_tenant on venta for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── DetalleVenta ────────────────────────────────────────────────────

create table if not exists detalle_venta (
  id_detalle_venta uuid primary key default gen_random_uuid(),
  id_tenant        uuid not null references tenant(id_tenant) on delete cascade,
  id_venta         uuid not null references venta(id_venta) on delete cascade,
  id_item          uuid not null references item_producto(id_item) on delete restrict,
  id_producto      uuid not null references producto(id_producto) on delete restrict,
  id_proveedor     uuid references proveedor(id_proveedor) on delete set null,

  -- Snapshot inmutable (RF-08). Se congela en sp_registrar_venta;
  -- editar Producto o CostoProducto después no toca esto.
  precio_venta     numeric(14, 2) not null check (precio_venta >= 0),
  costo_snapshot   numeric(14, 2) not null check (costo_snapshot >= 0),
  monto_proveedor  numeric(14, 2) not null default 0 check (monto_proveedor >= 0),
  monto_gasto      numeric(14, 2) not null default 0 check (monto_gasto >= 0),
  monto_ganancia   numeric(14, 2) not null,  -- puede ser negativo si vendiste bajo costo
  tipo_ingreso_snapshot tipo_ingreso not null,

  -- Desglose de reglas aplicadas (jsonb con las reglas de descuento/recargo
  -- que impactaron esta línea). Auditable, no vive como FK para no romper
  -- si se da de baja una regla histórica.
  desglose_reglas jsonb not null default '{}'::jsonb,

  -- Rendición (Etapa 7)
  id_rendicion        uuid,  -- FK a rendicion_proveedor cuando exista
  excluida_rendicion  boolean not null default false,

  created_at      timestamptz not null default now()
);

create index if not exists detalle_venta_venta_idx on detalle_venta(id_venta);
create index if not exists detalle_venta_item_idx on detalle_venta(id_item);
create index if not exists detalle_venta_producto_fecha_idx
  on detalle_venta(id_tenant, id_producto);
-- Índice crítico para rendición (Etapa 7): trae las líneas pendientes de
-- rendir por proveedor.
create index if not exists detalle_venta_rendicion_pendiente_idx
  on detalle_venta(id_tenant, id_proveedor)
  where id_rendicion is null and excluida_rendicion = false and monto_proveedor > 0;

-- Un item puede aparecer en detalle_venta más de una vez SOLO si la
-- venta original fue anulada y luego se re-vendió. Regla:
-- "no puede haber DOS líneas activas para el mismo item" — se enforcea
-- vía partial unique index vinculando a venta.estado_venta.
-- Como no podemos joinear en un index, lo enforceamos en
-- sp_registrar_venta con FOR UPDATE + validación explícita.

alter table detalle_venta enable row level security;

create policy detalle_venta_all_own_tenant on detalle_venta for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── Comprobante (metadatos) ─────────────────────────────────────────

create type tipo_comprobante as enum ('factura_a', 'factura_b', 'factura_c', 'remito', 'ticket');

create table if not exists comprobante (
  id_comprobante  uuid primary key default gen_random_uuid(),
  id_tenant       uuid not null references tenant(id_tenant) on delete cascade,
  id_venta        uuid not null references venta(id_venta) on delete cascade,
  tipo            tipo_comprobante not null,
  numero          text not null,
  fecha_emision   timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists comprobante_venta_idx on comprobante(id_venta);
create unique index if not exists comprobante_numero_uk
  on comprobante(id_tenant, tipo, numero);

alter table comprobante enable row level security;

create policy comprobante_all_own_tenant on comprobante for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
