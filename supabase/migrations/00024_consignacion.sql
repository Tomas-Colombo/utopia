-- 00024_consignacion.sql
-- UP: Consignación (devolución al proveedor) — Etapa 6.
--     Planificacion.txt §100-110, Ejecucion §L38-L42, §L82-L85.
--
--   `consignacion`         = lote/evento por proveedor (estado activa|cerrada).
--   `consignacion_detalle` = línea (item apartado) con su ciclo pendiente|devuelto|cancelado.
--
-- REGLA DURA (§L41): un item NO puede tener más de un consignacion_detalle
-- en estado 'pendiente' a la vez. Enforce vía partial unique index en DB
-- (no solo validación frontend). Encima está sp_agregar_item_consignacion
-- que hace el chequeo explícito para dar un error semántico mejor que el
-- 23505 crudo del unique violation.
--
-- MOVIMIENTOS SEPARADOS (§L42/L85): al apartar el item se crea
-- movimiento_item tipo='consignacion' (el item SIGUE físicamente en estado
-- 'disponible' — está comprometido pero no salió). Al confirmar la salida
-- física, se crea un SEGUNDO movimiento_item tipo='devolucion' + se
-- transiciona el item a estado 'devuelto' vía sp_transicion_item_producto.
-- Esta separación mantiene rastro del "aparté" vs "salió".
-- DOWN: (drops en orden inverso al final del archivo)

create type estado_consignacion as enum ('activa', 'cerrada');
create type estado_consignacion_detalle as enum ('pendiente', 'devuelto', 'cancelado');

create table if not exists consignacion (
  id_consignacion  uuid primary key default gen_random_uuid(),
  id_tenant        uuid not null references tenant(id_tenant) on delete cascade,
  id_proveedor     uuid not null references proveedor(id_proveedor) on delete restrict,
  id_usuario_alta  uuid references usuario(id_usuario) on delete set null,

  fecha            timestamptz not null default now(),
  estado           estado_consignacion not null default 'activa',
  fecha_cierre     timestamptz,
  observaciones    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists consignacion_tenant_fecha_idx
  on consignacion(id_tenant, fecha desc);
create index if not exists consignacion_tenant_proveedor_idx
  on consignacion(id_tenant, id_proveedor);
create index if not exists consignacion_tenant_estado_idx
  on consignacion(id_tenant, estado);

create trigger consignacion_touch before update on consignacion
  for each row execute function set_updated_at();

alter table consignacion enable row level security;

create policy consignacion_all_own_tenant on consignacion for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─────────────────────────────────────────────────────────────────
-- consignacion_detalle — la unidad clave del proceso
-- ─────────────────────────────────────────────────────────────────

create table if not exists consignacion_detalle (
  id_consignacion_detalle uuid primary key default gen_random_uuid(),
  id_tenant               uuid not null references tenant(id_tenant) on delete cascade,
  id_consignacion         uuid not null references consignacion(id_consignacion) on delete cascade,
  id_item                 uuid not null references item_producto(id_item) on delete restrict,
  id_producto             uuid not null references producto(id_producto) on delete restrict,

  estado           estado_consignacion_detalle not null default 'pendiente',
  fecha_apartado   timestamptz not null default now(),
  fecha_devolucion timestamptz,  -- se completa al confirmar salida
  motivo           text,          -- por qué se decidió devolver (rotación baja, defecto, etc.)

  created_at       timestamptz not null default now()
);

-- REGLA DURA (§L41): partial unique index.
-- Un item puede tener HISTORIAL de consignaciones (fue devuelto, canceladas,
-- etc.) pero SOLO UNA en estado 'pendiente' a la vez.
create unique index if not exists consignacion_detalle_item_pendiente_uk
  on consignacion_detalle(id_item)
  where estado = 'pendiente';

create index if not exists consignacion_detalle_consignacion_idx
  on consignacion_detalle(id_consignacion);
create index if not exists consignacion_detalle_item_idx
  on consignacion_detalle(id_item);
create index if not exists consignacion_detalle_tenant_estado_idx
  on consignacion_detalle(id_tenant, estado);

alter table consignacion_detalle enable row level security;

create policy consignacion_detalle_all_own_tenant on consignacion_detalle for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
