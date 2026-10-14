-- 00094_liquidacion_revendedora.sql
-- Slice 7a: Liquidación de revendedoras — schema, tablas, índices, FK circular y RLS (REQ-RV-DB-06, DR-2, DR-3, DR-14).
--
-- DOWN:
-- alter table detalle_venta drop constraint if exists detalle_venta_liquidacion_fk;
-- drop trigger if exists pago_revendedora_inmutable_trg on pago_revendedora;
-- drop function if exists fn_pago_revendedora_inmutable();
-- drop policy if exists restrict_revendedora_pago_revendedora on pago_revendedora;
-- drop policy if exists pago_revendedora_all_own_tenant on pago_revendedora;
-- drop index if exists pago_revendedora_tenant_fecha_idx;
-- drop index if exists pago_revendedora_tenant_cuenta_idx;
-- drop index if exists pago_revendedora_tenant_liq_idx;
-- drop table if exists pago_revendedora;
-- drop policy if exists restrict_revendedora_liquidacion_revendedora on liquidacion_revendedora;
-- drop policy if exists liquidacion_revendedora_all_own_tenant on liquidacion_revendedora;
-- drop trigger if exists liquidacion_revendedora_touch on liquidacion_revendedora;
-- drop index if exists liquidacion_revendedora_tenant_fecha_idx;
-- drop index if exists liquidacion_revendedora_tenant_estado_idx;
-- drop index if exists liquidacion_revendedora_tenant_revendedora_idx;
-- drop table if exists liquidacion_revendedora;
-- drop type if exists estado_liquidacion;
-- alter table cuenta_destino drop constraint if exists cuenta_destino_tenant_id_uk;

create type estado_liquidacion as enum ('pendiente', 'pagada');

-- Sostener FK compuesta anti-cruce de tenant hacia cuenta_destino
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cuenta_destino_tenant_id_uk'
  ) then
    alter table cuenta_destino
      add constraint cuenta_destino_tenant_id_uk unique (id_tenant, id_cuenta_destino);
  end if;
end $$;

-- ─── liquidacion_revendedora ─────────────────────────────────────────

create table if not exists liquidacion_revendedora (
  id_liquidacion      uuid primary key default gen_random_uuid(),
  id_tenant           uuid not null references tenant(id_tenant) on delete cascade,
  id_revendedora      uuid not null,
  periodo_desde       date not null,
  periodo_hasta       date not null,

  monto_vendido       numeric(14, 2) not null check (monto_vendido >= 0),
  monto_comision      numeric(14, 2) not null check (monto_comision >= 0),
  monto_a_cobrar      numeric(14, 2) not null check (monto_a_cobrar >= 0),
  cantidad_lineas     integer not null check (cantidad_lineas > 0),
  porcentaje_aplicado numeric(5, 2) not null check (porcentaje_aplicado >= 0 and porcentaje_aplicado <= 100),

  estado              estado_liquidacion not null default 'pendiente',
  fecha_liquidacion   date not null default current_date,
  fecha_pago          timestamptz,
  observaciones       text,
  id_usuario_alta     uuid references usuario(id_usuario) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint liquidacion_revendedora_periodo_check
    check (periodo_hasta >= periodo_desde),
  constraint liquidacion_revendedora_tenant_id_uk
    unique (id_tenant, id_liquidacion),
  constraint liquidacion_revendedora_revendedora_fk
    foreign key (id_tenant, id_revendedora)
    references revendedora(id_tenant, id_revendedora)
    on delete restrict
);

create index if not exists liquidacion_revendedora_tenant_revendedora_idx
  on liquidacion_revendedora(id_tenant, id_revendedora);

create index if not exists liquidacion_revendedora_tenant_estado_idx
  on liquidacion_revendedora(id_tenant, estado);

create index if not exists liquidacion_revendedora_tenant_fecha_idx
  on liquidacion_revendedora(id_tenant, fecha_liquidacion);

create trigger liquidacion_revendedora_touch
  before update on liquidacion_revendedora
  for each row execute function set_updated_at();

alter table liquidacion_revendedora enable row level security;

create policy liquidacion_revendedora_all_own_tenant
  on liquidacion_revendedora for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create policy restrict_revendedora_liquidacion_revendedora
  on liquidacion_revendedora as restrictive for all to authenticated
  using (auth_revendedora_id() is null);

-- ─── Cierre de FK circular en detalle_venta ──────────────────────────

alter table detalle_venta
  add constraint detalle_venta_liquidacion_fk
  foreign key (id_tenant, id_liquidacion)
  references liquidacion_revendedora(id_tenant, id_liquidacion)
  on delete set null;

-- ─── pago_revendedora (append-only) ──────────────────────────────────

create table if not exists pago_revendedora (
  id_pago_revendedora uuid primary key default gen_random_uuid(),
  id_tenant           uuid not null references tenant(id_tenant) on delete cascade,
  id_liquidacion      uuid not null,
  fecha               timestamptz not null default now(),
  monto               numeric(14, 2) not null check (monto > 0),
  metodo              text not null default 'transferencia',
  referencia          text,
  id_cuenta           uuid not null,
  id_usuario_alta     uuid references usuario(id_usuario) on delete set null,
  created_at          timestamptz not null default now(),

  constraint pago_revendedora_tenant_id_uk
    unique (id_tenant, id_pago_revendedora),
  constraint pago_revendedora_liquidacion_fk
    foreign key (id_tenant, id_liquidacion)
    references liquidacion_revendedora(id_tenant, id_liquidacion)
    on delete restrict,
  constraint pago_revendedora_cuenta_fk
    foreign key (id_tenant, id_cuenta)
    references cuenta_destino(id_tenant, id_cuenta_destino)
    on delete restrict
);

create index if not exists pago_revendedora_tenant_liq_idx
  on pago_revendedora(id_tenant, id_liquidacion);

create index if not exists pago_revendedora_tenant_cuenta_idx
  on pago_revendedora(id_tenant, id_cuenta);

create index if not exists pago_revendedora_tenant_fecha_idx
  on pago_revendedora(id_tenant, fecha);

-- Trigger append-only: rechaza UPDATE y DELETE
create or replace function fn_pago_revendedora_inmutable()
returns trigger language plpgsql as $$
begin
  raise exception 'pago-revendedora-inmutable' using errcode = '22023';
end;
$$;

create trigger pago_revendedora_inmutable_trg
  before update or delete on pago_revendedora
  for each row execute function fn_pago_revendedora_inmutable();

alter table pago_revendedora enable row level security;

create policy pago_revendedora_all_own_tenant
  on pago_revendedora for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create policy restrict_revendedora_pago_revendedora
  on pago_revendedora as restrictive for all to authenticated
  using (auth_revendedora_id() is null);
