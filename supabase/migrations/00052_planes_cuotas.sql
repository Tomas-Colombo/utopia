-- 00052_planes_cuotas.sql
-- UP: los planes de cuotas dejan de estar hardcodeados en 2 y 3 (00017 §33) y
--     pasan a ser una decisión del tenant, configurable desde Precios.
--
--     Los valores de un enum de PG no se pueden borrar sin recrear el tipo y
--     todas las columnas/funciones que lo usan (00047 documenta lo mismo para
--     'transferencia'). Por eso `forma_pago` se extiende de una sola vez con
--     todo el rango soportado (2..24) y `plan_cuotas` decide cuáles se ofrecen
--     realmente en cada tenant. Ninguna función de precios cambia: siguen
--     recibiendo un `forma_pago` y `resolver_regla_recargo` lo matchea contra
--     `regla_precio.forma_pago` igual que antes.
--
--     El mapeo forma_pago → medio_pago de sp_registrar_venta (00047) ya cae en
--     `else → tarjeta_credito`, así que los valores nuevos entran sin tocarlo.
--
-- DOWN:
--   drop policy if exists plan_cuotas_all_own_tenant on plan_cuotas;
--   drop index if exists plan_cuotas_tenant_activo_idx;
--   drop table if exists plan_cuotas;
--   -- OJO: los valores agregados a `forma_pago` NO se pueden sacar sin
--   -- recrear el tipo y todo lo que lo referencia.

-- 2 y 3 ya existen desde 00017. `add value` no puede USAR el valor nuevo en la
-- misma transacción, pero acá sólo se declara — el backfill de abajo escribe
-- enteros en plan_cuotas, no literales del enum.
alter type forma_pago add value if not exists 'cuotas_4';
alter type forma_pago add value if not exists 'cuotas_5';
alter type forma_pago add value if not exists 'cuotas_6';
alter type forma_pago add value if not exists 'cuotas_7';
alter type forma_pago add value if not exists 'cuotas_8';
alter type forma_pago add value if not exists 'cuotas_9';
alter type forma_pago add value if not exists 'cuotas_10';
alter type forma_pago add value if not exists 'cuotas_11';
alter type forma_pago add value if not exists 'cuotas_12';
alter type forma_pago add value if not exists 'cuotas_13';
alter type forma_pago add value if not exists 'cuotas_14';
alter type forma_pago add value if not exists 'cuotas_15';
alter type forma_pago add value if not exists 'cuotas_16';
alter type forma_pago add value if not exists 'cuotas_17';
alter type forma_pago add value if not exists 'cuotas_18';
alter type forma_pago add value if not exists 'cuotas_19';
alter type forma_pago add value if not exists 'cuotas_20';
alter type forma_pago add value if not exists 'cuotas_21';
alter type forma_pago add value if not exists 'cuotas_22';
alter type forma_pago add value if not exists 'cuotas_23';
alter type forma_pago add value if not exists 'cuotas_24';

-- Qué planes ofrece este tenant. `activo = false` es baja lógica: la regla de
-- recargo histórica sigue apuntando a esa forma de pago y no hay que romperla.
create table if not exists plan_cuotas (
  id_tenant  uuid not null references tenant(id_tenant) on delete cascade,
  cuotas     smallint not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),

  primary key (id_tenant, cuotas),
  constraint plan_cuotas_rango_ok check (cuotas between 2 and 24)
);

create index if not exists plan_cuotas_tenant_activo_idx
  on plan_cuotas(id_tenant)
  where activo;

alter table plan_cuotas enable row level security;

create policy plan_cuotas_all_own_tenant on plan_cuotas for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- Backfill: 2 y 3 eran las únicas opciones ofrecidas, se mantienen para que el
-- desplegable de la venta no cambie al desplegar esta migración.
insert into plan_cuotas (id_tenant, cuotas)
select t.id_tenant, c.cuotas
  from tenant t
 cross join (values (2::smallint), (3::smallint)) as c(cuotas)
    on conflict do nothing;
