-- 00103_declaracion_venta.sql
-- Slice 9b: Tabla declaracion_venta_revendedora, enum y RLS restrictivo (REQ-RV-ACC-30..33, DR-11)
--
-- UP:
--   1. Crea enum estado_declaracion (pendiente, confirmada, rechazada).
--   2. Crea tabla declaracion_venta_revendedora con FK compuestas e índice único parcial.
--   3. Habilita RLS por tenant y políticas restrictivas de lista blanca ACC-03.
--
-- DOWN:
--   drop policy if exists restrict_revendedora_declaracion_delete on declaracion_venta_revendedora;
--   drop policy if exists restrict_revendedora_declaracion_update on declaracion_venta_revendedora;
--   drop policy if exists restrict_revendedora_declaracion_insert on declaracion_venta_revendedora;
--   drop policy if exists revendedora_propia_declaracion on declaracion_venta_revendedora;
--   drop policy if exists declaracion_venta_revendedora_tenant on declaracion_venta_revendedora;
--   drop table if exists declaracion_venta_revendedora;
--   drop type if exists estado_declaracion;

-- 1. Enum de estado de declaración
create type estado_declaracion as enum ('pendiente', 'confirmada', 'rechazada');

-- 2. Tabla declaracion_venta_revendedora
create table if not exists declaracion_venta_revendedora (
  id_declaracion  uuid primary key default gen_random_uuid(),
  id_tenant       uuid not null references tenant(id_tenant) on delete cascade,
  id_revendedora  uuid not null,
  id_item         uuid not null,
  fecha           date not null default current_date,
  nota            text not null default '',
  estado          estado_declaracion not null default 'pendiente',
  id_venta        uuid,
  motivo_rechazo  text,
  confirmada_por  uuid references usuario(id_usuario),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint declaracion_venta_tenant_id_uk
    unique (id_tenant, id_declaracion),

  constraint declaracion_venta_revendedora_fk
    foreign key (id_tenant, id_revendedora)
    references revendedora(id_tenant, id_revendedora)
    on delete cascade,

  constraint declaracion_venta_item_fk
    foreign key (id_tenant, id_item)
    references item_producto(id_tenant, id_item)
    on delete cascade,

  constraint declaracion_venta_venta_fk
    foreign key (id_venta)
    references venta(id_venta)
    on delete set null
);

-- Índice único parcial: un ítem no puede tener más de una declaración pendiente
create unique index if not exists declaracion_venta_item_pendiente_uk
  on declaracion_venta_revendedora (id_tenant, id_item)
  where (estado = 'pendiente');

-- Trigger de updated_at
create trigger declaracion_venta_touch
  before update on declaracion_venta_revendedora
  for each row execute function set_updated_at();

-- 3. RLS
alter table declaracion_venta_revendedora enable row level security;

-- Política general por tenant
create policy declaracion_venta_revendedora_tenant on declaracion_venta_revendedora
  for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- Políticas restrictivas para la sesión de revendedora (ACC-03)
-- SELECT: el operador ve todo el tenant; la revendedora ve únicamente sus declaraciones
create policy revendedora_propia_declaracion on declaracion_venta_revendedora
  as restrictive for select to authenticated
  using (auth_revendedora_id() is null or id_revendedora = auth_revendedora_id());

-- INSERT: la revendedora solo puede insertar declaraciones para sí misma
create policy restrict_revendedora_declaracion_insert on declaracion_venta_revendedora
  as restrictive for insert to authenticated
  with check (auth_revendedora_id() is null or id_revendedora = auth_revendedora_id());

-- UPDATE: denegado a la sesión de revendedora (solo el operador confirma/rechaza)
create policy restrict_revendedora_declaracion_update on declaracion_venta_revendedora
  as restrictive for update to authenticated
  using (auth_revendedora_id() is null)
  with check (auth_revendedora_id() is null);

-- DELETE: denegado a la sesión de revendedora directo por RLS
create policy restrict_revendedora_declaracion_delete on declaracion_venta_revendedora
  as restrictive for delete to authenticated
  using (auth_revendedora_id() is null);

grant select, insert, update, delete on declaracion_venta_revendedora to authenticated;
