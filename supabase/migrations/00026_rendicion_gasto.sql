-- 00026_rendicion_gasto.sql
-- UP: rendicion_proveedor + gasto_negocio (Etapa 7).
--     Planificacion.txt §112-122, Ejecucion §L45/L227/L228 (rendición) y §L46 + RF-10 (gastos).
--
--   rendicion_proveedor      = lote de saldo con un proveedor puntual.
--                              Estado pendiente|pagada + fecha_pago.
--   categoria_gasto          = catálogo por tenant (alquiler, marketing, publicidad, canjes, …).
--                              Con presupuesto mensual opcional (RF-10 §L46).
--   gasto_negocio            = movimiento de gasto individual, imputado a una categoría.
--
-- Cierre de la FK circular: en 00021 (Etapa 5) creé detalle_venta.id_rendicion
-- SIN referencia (comentario "FK a rendicion_proveedor cuando exista"). Ahora
-- la tabla existe → agrego la FK. `ON DELETE SET NULL` para no cascadear si
-- alguien borra una rendición (aunque el flujo real no permite borrar).
--
-- DOWN: drops en orden inverso al final.

create type estado_rendicion as enum ('pendiente', 'pagada');

create table if not exists rendicion_proveedor (
  id_rendicion    uuid primary key default gen_random_uuid(),
  id_tenant       uuid not null references tenant(id_tenant) on delete cascade,
  id_proveedor    uuid not null references proveedor(id_proveedor) on delete restrict,
  id_usuario_alta uuid references usuario(id_usuario) on delete set null,

  fecha_generacion timestamptz not null default now(),
  -- Rango informativo: min/max fecha de las ventas incluidas. NO se usa
  -- como criterio de selección (§L45: "el criterio real es
  -- idRendicion IS NULL, sin filtrar por fecha").
  periodo_desde    timestamptz,
  periodo_hasta    timestamptz,

  monto_total      numeric(14, 2) not null check (monto_total >= 0),
  cantidad_lineas  integer not null check (cantidad_lineas >= 0),

  estado           estado_rendicion not null default 'pendiente',
  fecha_pago       timestamptz,
  observaciones    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists rendicion_proveedor_tenant_fecha_idx
  on rendicion_proveedor(id_tenant, fecha_generacion desc);
create index if not exists rendicion_proveedor_tenant_proveedor_idx
  on rendicion_proveedor(id_tenant, id_proveedor);
create index if not exists rendicion_proveedor_tenant_estado_idx
  on rendicion_proveedor(id_tenant, estado);

create trigger rendicion_proveedor_touch before update on rendicion_proveedor
  for each row execute function set_updated_at();

alter table rendicion_proveedor enable row level security;

create policy rendicion_proveedor_all_own_tenant on rendicion_proveedor for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- Cerrar FK circular. Ver comentario en 00021 detalle_venta.id_rendicion.
alter table detalle_venta
  add constraint detalle_venta_rendicion_fk
  foreign key (id_rendicion) references rendicion_proveedor(id_rendicion)
  on delete set null;

-- ─── categoria_gasto ─────────────────────────────────────────────────

create table if not exists categoria_gasto (
  id_categoria_gasto uuid primary key default gen_random_uuid(),
  id_tenant          uuid not null references tenant(id_tenant) on delete cascade,
  nombre             text not null,
  descripcion        text,
  -- Presupuesto MENSUAL en $ (RF-10). NULL = sin control de presupuesto.
  -- Se compara contra la suma de gasto_negocio.monto de la categoría en el
  -- mes calendario en curso.
  presupuesto_mensual numeric(14, 2) check (presupuesto_mensual is null or presupuesto_mensual >= 0),
  activa             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists categoria_gasto_tenant_nombre_uk
  on categoria_gasto(id_tenant, lower(nombre));
create index if not exists categoria_gasto_tenant_activa_idx
  on categoria_gasto(id_tenant, activa);

create trigger categoria_gasto_touch before update on categoria_gasto
  for each row execute function set_updated_at();

alter table categoria_gasto enable row level security;

create policy categoria_gasto_all_own_tenant on categoria_gasto for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── gasto_negocio ───────────────────────────────────────────────────

create table if not exists gasto_negocio (
  id_gasto           uuid primary key default gen_random_uuid(),
  id_tenant          uuid not null references tenant(id_tenant) on delete cascade,
  id_categoria_gasto uuid not null references categoria_gasto(id_categoria_gasto) on delete restrict,
  id_usuario_alta    uuid references usuario(id_usuario) on delete set null,

  fecha              timestamptz not null default now(),
  monto              numeric(14, 2) not null check (monto >= 0),
  descripcion        text not null,
  comprobante_ref    text,  -- número de factura/recibo del proveedor externo (opcional)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists gasto_negocio_tenant_fecha_idx
  on gasto_negocio(id_tenant, fecha desc);
create index if not exists gasto_negocio_categoria_fecha_idx
  on gasto_negocio(id_tenant, id_categoria_gasto, fecha desc);

create trigger gasto_negocio_touch before update on gasto_negocio
  for each row execute function set_updated_at();

alter table gasto_negocio enable row level security;

create policy gasto_negocio_all_own_tenant on gasto_negocio for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
