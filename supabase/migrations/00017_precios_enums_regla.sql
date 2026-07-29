-- 00017_precios_enums_regla.sql
-- UP: enums de precios + tabla `regla_precio` (Planificacion.txt Etapa 4
--     §79, sección 3.3 y 4.2 del anexo). Entidad ÚNICA que resuelve
--     margen, descuento y recargo — no dispersar en varias tablas ni en
--     json de Tenant. RLS por tenant.
-- DOWN:
--   drop policy if exists regla_precio_all_own_tenant on regla_precio;
--   drop trigger if exists regla_precio_touch on regla_precio;
--   drop index if exists regla_precio_lookup_idx;
--   drop index if exists regla_precio_tenant_activa_idx;
--   drop table if exists regla_precio;
--   drop type if exists forma_pago;
--   drop type if exists alcance_regla;
--   drop type if exists tipo_valor_regla;
--   drop type if exists tipo_regla;

create type tipo_regla as enum ('margen', 'descuento', 'recargo');
create type tipo_valor_regla as enum ('porcentaje', 'monto_fijo');
create type alcance_regla as enum ('global', 'categoria', 'proveedor', 'producto');

-- Forma de pago (RF-09). Se resuelve en la venta, nunca fija en producto.
-- 'efectivo' = default (recargo 0). Cuotas: 2 y 3 confirmadas por el
-- instructivo (§33). Extender agregando valores nuevos al enum si más
-- adelante hay 6/12 cuotas — enums de PG permiten `ADD VALUE` sin
-- recrear la tabla.
create type forma_pago as enum ('efectivo', 'cuotas_2', 'cuotas_3');

create table if not exists regla_precio (
  id_regla       uuid primary key default gen_random_uuid(),
  id_tenant      uuid not null references tenant(id_tenant) on delete cascade,

  nombre         text not null,
  tipo_regla     tipo_regla not null,
  tipo_valor     tipo_valor_regla not null,
  valor          numeric(12, 4) not null,          -- % (0.15 = 15%) o monto fijo

  alcance        alcance_regla not null,
  -- Referencia opcional según alcance. Exactamente UNA debe estar
  -- presente cuando alcance != 'global'; check enforcea la coherencia.
  id_producto    uuid references producto(id_producto) on delete cascade,
  id_categoria   uuid references categoria(id_categoria) on delete cascade,
  id_proveedor   uuid references proveedor(id_proveedor) on delete cascade,

  forma_pago     forma_pago,                        -- SOLO aplica cuando tipo_regla='recargo'
  prioridad      integer not null default 0,        -- desempate entre reglas del mismo alcance
  fecha_inicio   timestamptz,                       -- null = vigente desde siempre
  fecha_hasta    timestamptz,                       -- null = vigente hasta baja
  fecha_baja     timestamptz,                       -- soft-delete (§58)

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Coherencia alcance ↔ referencia
  constraint regla_alcance_producto_ok check (
    (alcance = 'producto'  and id_producto  is not null and id_categoria is null and id_proveedor is null)
    or (alcance = 'categoria' and id_categoria is not null and id_producto is null and id_proveedor is null)
    or (alcance = 'proveedor' and id_proveedor is not null and id_producto is null and id_categoria is null)
    or (alcance = 'global'    and id_producto  is null and id_categoria is null and id_proveedor is null)
  ),
  -- forma_pago solo tiene sentido en recargo (§30 "solo aplica a recargo")
  constraint regla_forma_pago_ok check (
    (tipo_regla = 'recargo') or (forma_pago is null)
  ),
  -- Rango de vigencia coherente
  constraint regla_vigencia_ok check (
    fecha_inicio is null or fecha_hasta is null or fecha_inicio <= fecha_hasta
  )
);

create index if not exists regla_precio_tenant_activa_idx
  on regla_precio(id_tenant)
  where fecha_baja is null;

-- Índice orientado al lookup de cascada: (tenant, tipo, alcance, ref).
-- Sirve tanto para "traeme la mejor regla de margen para producto X"
-- como para "traeme el recargo global para cuotas_2".
create index if not exists regla_precio_lookup_idx
  on regla_precio(id_tenant, tipo_regla, alcance, id_producto, id_categoria, id_proveedor, forma_pago)
  where fecha_baja is null;

create trigger regla_precio_touch before update on regla_precio
  for each row execute function set_updated_at();

alter table regla_precio enable row level security;

create policy regla_precio_all_own_tenant on regla_precio for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
