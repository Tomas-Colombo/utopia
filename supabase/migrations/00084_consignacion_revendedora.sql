-- 00084_consignacion_revendedora.sql
-- Slice 3: Consignación de salida a revendedora — tablas, índices, FKs compuestas (MOD-09) y RLS (REQ-RV-DB-03).
--
-- DOWN:
-- drop policy if exists restrict_revendedora_consignacion_revendedora_detalle on consignacion_revendedora_detalle;
-- drop policy if exists consignacion_revendedora_detalle_all_own_tenant on consignacion_revendedora_detalle;
-- drop index if exists consignacion_revendedora_detalle_tenant_estado_idx;
-- drop index if exists consignacion_revendedora_detalle_item_idx;
-- drop index if exists consignacion_revendedora_detalle_consig_idx;
-- drop index if exists consignacion_revendedora_detalle_item_activo_uk;
-- drop table if exists consignacion_revendedora_detalle;
-- drop policy if exists restrict_revendedora_consignacion_revendedora on consignacion_revendedora;
-- drop policy if exists consignacion_revendedora_all_own_tenant on consignacion_revendedora;
-- drop trigger if exists consignacion_revendedora_touch on consignacion_revendedora;
-- drop index if exists consignacion_revendedora_tenant_estado_idx;
-- drop index if exists consignacion_revendedora_tenant_revendedora_idx;
-- drop table if exists consignacion_revendedora;
-- alter table producto drop constraint if exists producto_tenant_id_uk;
-- alter table item_producto drop constraint if exists item_producto_tenant_id_uk;
-- alter table revendedora drop constraint if exists revendedora_tenant_id_uk;
-- drop type if exists estado_consignacion_revendedora_detalle;
-- drop type if exists estado_consignacion_revendedora;

create type estado_consignacion_revendedora as enum ('abierta', 'cerrada');
create type estado_consignacion_revendedora_detalle as enum (
  'pendiente',
  'en_poder',
  'vendido',
  'devuelto',
  'baja'
);

-- Claves únicas compuestas (id_tenant, id_*) para sostener FKs compuestas anti-cruce de tenant (REQ-RV-MOD-09).
alter table revendedora
  add constraint revendedora_tenant_id_uk unique (id_tenant, id_revendedora);

alter table item_producto
  add constraint item_producto_tenant_id_uk unique (id_tenant, id_item);

alter table producto
  add constraint producto_tenant_id_uk unique (id_tenant, id_producto);

create table if not exists consignacion_revendedora (
  id_consignacion_revendedora uuid primary key default gen_random_uuid(),
  id_tenant                   uuid not null references tenant(id_tenant) on delete cascade,
  id_revendedora              uuid not null,
  id_usuario_alta             uuid references usuario(id_usuario) on delete set null,

  periodo_desde               date,
  periodo_hasta               date,
  estado                      estado_consignacion_revendedora not null default 'abierta',
  confirmada                  boolean not null default false,
  fecha_confirmacion          timestamptz,
  fecha_cierre                timestamptz,
  observaciones               text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint consignacion_revendedora_periodo_check
    check (periodo_desde is null or periodo_hasta is null or periodo_hasta >= periodo_desde),
  constraint consignacion_revendedora_tenant_id_uk
    unique (id_tenant, id_consignacion_revendedora),
  constraint consignacion_revendedora_revendedora_fk
    foreign key (id_tenant, id_revendedora)
    references revendedora(id_tenant, id_revendedora)
    on delete restrict
);

create index if not exists consignacion_revendedora_tenant_revendedora_idx
  on consignacion_revendedora(id_tenant, id_revendedora);

create index if not exists consignacion_revendedora_tenant_estado_idx
  on consignacion_revendedora(id_tenant, estado);

create trigger consignacion_revendedora_touch
  before update on consignacion_revendedora
  for each row execute function set_updated_at();

alter table consignacion_revendedora enable row level security;

create policy consignacion_revendedora_all_own_tenant
  on consignacion_revendedora for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create policy restrict_revendedora_consignacion_revendedora
  on consignacion_revendedora as restrictive for all to authenticated
  using (auth_revendedora_id() is null);

create table if not exists consignacion_revendedora_detalle (
  id_consignacion_revendedora_detalle uuid primary key default gen_random_uuid(),
  id_tenant                           uuid not null references tenant(id_tenant) on delete cascade,
  id_consignacion_revendedora         uuid not null,
  id_item                             uuid not null,
  id_producto                         uuid not null,

  estado_detalle                      estado_consignacion_revendedora_detalle not null default 'pendiente',
  fecha_entrega                       timestamptz,
  fecha_devolucion                    timestamptz,
  motivo                              text,

  created_at                          timestamptz not null default now(),

  constraint consignacion_revendedora_detalle_consig_fk
    foreign key (id_tenant, id_consignacion_revendedora)
    references consignacion_revendedora(id_tenant, id_consignacion_revendedora)
    on delete cascade,
  constraint consignacion_revendedora_detalle_item_fk
    foreign key (id_tenant, id_item)
    references item_producto(id_tenant, id_item)
    on delete restrict,
  constraint consignacion_revendedora_detalle_producto_fk
    foreign key (id_tenant, id_producto)
    references producto(id_tenant, id_producto)
    on delete restrict
);

-- Un ítem no puede estar activo (en borrador pendiente o entregado en_poder) en dos consignaciones a la vez.
create unique index if not exists consignacion_revendedora_detalle_item_activo_uk
  on consignacion_revendedora_detalle(id_item)
  where estado_detalle in ('pendiente', 'en_poder');

create index if not exists consignacion_revendedora_detalle_consig_idx
  on consignacion_revendedora_detalle(id_consignacion_revendedora);

create index if not exists consignacion_revendedora_detalle_item_idx
  on consignacion_revendedora_detalle(id_item);

create index if not exists consignacion_revendedora_detalle_tenant_estado_idx
  on consignacion_revendedora_detalle(id_tenant, estado_detalle);

alter table consignacion_revendedora_detalle enable row level security;

create policy consignacion_revendedora_detalle_all_own_tenant
  on consignacion_revendedora_detalle for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create policy restrict_revendedora_consignacion_revendedora_detalle
  on consignacion_revendedora_detalle as restrictive for all to authenticated
  using (auth_revendedora_id() is null);
