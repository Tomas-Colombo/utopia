-- 00022_reserva.sql
-- UP: `reserva` + `detalle_reserva` (sección 4.6, §L91-95).
--   - Un ítem puede estar en 0..* DetalleReserva (histórico) pero SOLO
--     en 1 activa a la vez (regla de negocio). Enforce vía partial
--     unique index sobre id_item WHERE estado='activa'.
--   - Estados: activa → cancelada | vencida | convertida_venta.
--   - Vencimiento por batch (sp_vencer_reservas) o manual.
--   - IMPORTANTE (§L93): estado_item NUNCA cambia al reservar; la
--     verificación al vender consulta detalle_reserva con estado='activa'
--     (lo hace sp_registrar_venta en 00023).
--   - Conversión: NO se guarda vínculo Reserva→Venta (§L94, decisión
--     intencional del negocio).
-- DOWN: (drops en orden inverso al final)

create type estado_reserva as enum ('activa', 'cancelada', 'vencida', 'convertida_venta');

create table if not exists reserva (
  id_reserva      uuid primary key default gen_random_uuid(),
  id_tenant       uuid not null references tenant(id_tenant) on delete cascade,
  id_cliente      uuid references cliente(id_cliente) on delete set null,
  id_usuario_alta uuid references usuario(id_usuario) on delete set null,

  fecha           timestamptz not null default now(),
  fecha_vencimiento timestamptz not null,
  estado_reserva  estado_reserva not null default 'activa',
  fecha_cierre    timestamptz,  -- cuándo se canceló/venció/convirtió
  observaciones   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint reserva_vencimiento_ok check (fecha_vencimiento > fecha)
);

create index if not exists reserva_tenant_estado_idx
  on reserva(id_tenant, estado_reserva);
create index if not exists reserva_tenant_vencimiento_idx
  on reserva(id_tenant, fecha_vencimiento)
  where estado_reserva = 'activa';
create index if not exists reserva_tenant_cliente_idx
  on reserva(id_tenant, id_cliente);

create trigger reserva_touch before update on reserva
  for each row execute function set_updated_at();

alter table reserva enable row level security;

create policy reserva_all_own_tenant on reserva for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── DetalleReserva ──────────────────────────────────────────────────

create table if not exists detalle_reserva (
  id_detalle_reserva uuid primary key default gen_random_uuid(),
  id_tenant          uuid not null references tenant(id_tenant) on delete cascade,
  id_reserva         uuid not null references reserva(id_reserva) on delete cascade,
  id_item            uuid not null references item_producto(id_item) on delete restrict,
  id_producto        uuid not null references producto(id_producto) on delete restrict,

  -- Snapshot del precio "prometido" al reservar. En la venta el precio
  -- final se recalcula (puede cambiar por forma_pago). El snapshot es
  -- informativo y sirve para mostrar historial.
  precio_snapshot    numeric(14, 2) not null check (precio_snapshot >= 0),

  -- Estado propagado desde la reserva (denormalizado para queries de
  -- "reservas activas por item"). Se actualiza en sp_cancelar_reserva
  -- y sp_vencer_reservas.
  estado             estado_reserva not null default 'activa',

  created_at         timestamptz not null default now()
);

create index if not exists detalle_reserva_reserva_idx on detalle_reserva(id_reserva);
create index if not exists detalle_reserva_item_idx on detalle_reserva(id_item);

-- REGLA DURA: un item puede tener a lo sumo UNA reserva activa a la vez
-- (§L91). Partial unique index en DB — no solo validación frontend.
create unique index if not exists detalle_reserva_item_activa_uk
  on detalle_reserva(id_item)
  where estado = 'activa';

alter table detalle_reserva enable row level security;

create policy detalle_reserva_all_own_tenant on detalle_reserva for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
