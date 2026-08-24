-- 00063_recargo_cuotas.sql
-- UP: el recargo por cuotas sale de `regla_precio` y pasa a ser el espejo del
--     arancel de cobro.
--
--     ─── El problema ──────────────────────────────────────────────────
--     `resolver_regla_recargo` (00019) termina en `limit 1`: devuelve UN
--     recargo. Con la cascada por alcance, un recargo de categoría le gana a
--     uno global y el global SE PIERDE en silencio. Además el filtro es
--     `r.forma_pago = p_forma_pago`, así que un recargo sin forma de pago no
--     matchea nunca, y `sp_calcular_precio_venta_snapshot` descarta el
--     recargo entero cuando la forma de pago es `efectivo`.
--
--     El resultado práctico: hoy el recargo por cuotas es global de hecho
--     (cualquier otro alcance rompe el global), y no se puede diferenciar por
--     dónde entra la plata. Mercado Pago en 3 y el posnet del banco en 3
--     comparten recargo, aunque sus aranceles no se parezcan.
--
--     ─── Por qué una tabla y no una dimensión más de regla_precio ─────
--     Porque el recargo por cuotas NO depende del producto. Depende de quién
--     financia. Es la contracara exacta de `arancel_cobro` (00057):
--
--       arancel_cobro   (cuenta, medio, cuotas) → lo que TE COBRAN
--       recargo_cuotas  (cuenta, medio, cuotas) → lo que COBRÁS
--
--     Misma llave, comodines simétricos. Que compartan llave es el punto:
--     el recargo existe para cubrir el arancel, y con llaves distintas nunca
--     se los puede comparar ni verificar que uno cubra al otro.
--
--     `regla_precio` conserva margen y descuento, que sí cascadean por
--     producto. NO se le borra nada: `tipo_regla` mantiene el valor
--     'recargo' (Postgres no tiene DROP VALUE en enums) y la columna
--     `forma_pago` queda donde está. Lo único que cambia es que a partir de
--     00064 nadie los lee.
--
--     ─── Unidades ─────────────────────────────────────────────────────
--     ATENCIÓN: `regla_precio.valor` guarda 0.1000 para "10%" (el SP hace
--     `precio * (1 + valor)`), mientras que `arancel_cobro.arancel_pct`
--     guarda 6.500 para "6,5%". Esta tabla usa la convención del ARANCEL —
--     10.000 = 10% — para que los dos números se puedan mostrar y restar
--     enfrentados sin conversiones al vuelo. La migración de datos de abajo
--     multiplica por 100.
-- DOWN: al final, comentado.

-- ─── Guarda: recargos que este modelo no puede representar ───────────
-- El modelo nuevo es global por definición: el recargo por cuotas no varía
-- por producto ni por categoría. Si existe un recargo VIGENTE con otro
-- alcance, la migración PARA. Aplanarlo a global le cambiaría el precio a
-- todos los demás productos, y descartarlo sería perder una decisión de
-- negocio sin avisar. Las dos cosas en silencio son inaceptables sobre una
-- base con datos reales.
--
-- Para destrabar: dar de baja esas reglas (fecha_baja) y volver a correr.
do $$
declare
  v_ofensores text;
begin
  select string_agg(format('  · %s (tenant %s, alcance %s, %s)',
                           r.nombre, t.subdominio, r.alcance, r.forma_pago), e'\n')
    into v_ofensores
    from regla_precio r
    join tenant t on t.id_tenant = r.id_tenant
   where r.tipo_regla = 'recargo'
     and r.alcance <> 'global'
     and r.fecha_baja is null;

  if v_ofensores is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'Hay recargos vigentes con alcance distinto de global; 00063 no los puede migrar',
      detail  = e'\n' || v_ofensores,
      hint    = 'El recargo por cuotas pasa a ser global. Dá de baja estas reglas '
                '(update regla_precio set fecha_baja = now() where id_regla = ...) '
                'y volvé a correr la migración. Si el recargo por producto era '
                'intencional, se modela con un margen diferenciado en ese producto.';
  end if;
end $$;

-- ─── Tabla ───────────────────────────────────────────────────────────
-- Una fila por combinación (financiador, plan de cuotas). Los recargos no se
-- borran: se cierra la vigencia, igual que el arancel. Saber qué se cobraba
-- cuándo es lo que permite explicar el precio de una venta vieja.

create table if not exists recargo_cuotas (
  id_recargo_cuotas uuid primary key default gen_random_uuid(),
  id_tenant         uuid not null references tenant(id_tenant) on delete cascade,

  -- Arranca en 2 por el mismo motivo que `plan_cuotas` (00052): "1 cuota" no
  -- es un plan, es una venta normal. Una venta sin plan no tiene recargo, y
  -- la deuda propia sin plan se cobra en un pago al vencimiento.
  cuotas            smallint not null check (cuotas between 2 and 24),

  -- ─── Quién financia ───
  -- NULL en los dos = comodín: el recargo general de ese plan, para cualquier
  -- destino que no tenga fila propia. Simétrico al `cuotas = null` del
  -- arancel.
  id_cuenta_destino uuid references cuenta_destino(id_cuenta_destino)
                      on delete cascade,
  medio             medio_pago,

  -- Financiación propia: la tienda le fía al cliente. No hay procesador, así
  -- que no hay cuenta ni medio — la plata todavía no entró por ningún lado.
  -- Y NO cae al comodín: heredar el recargo de una tarjeta significaría
  -- cobrarle al cliente un arancel que en este caso no existe.
  propia            boolean not null default false,

  -- Mismo par (tipo, valor) que `regla_precio`, para no perder los recargos
  -- de monto fijo que ya existen. En 'porcentaje' el valor es 10.000 = +10%
  -- (convención del arancel, ver cabecera); en 'monto_fijo' es un importe.
  tipo_valor        tipo_valor_regla not null default 'porcentaje',
  valor             numeric(14,3) not null default 0 check (valor >= 0),

  vigente_desde     date not null default current_date,
  vigente_hasta     date,
  notas             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint recargo_cuotas_vigencia_coherente check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  ),
  -- La financiación propia no pasa por ningún procesador. Dejar que una fila
  -- diga `propia = true` Y nombre una cuenta abriría dos lecturas posibles de
  -- la misma fila, y el resolver tendría que adivinar cuál.
  constraint recargo_cuotas_propia_sin_procesador check (
    not propia or (id_cuenta_destino is null and medio is null)
  ),
  -- Un porcentaje no puede pasar de 100: sería más que duplicar el precio, y
  -- en la práctica siempre es un cero de más al tipear. El monto fijo no
  -- tiene tope.
  constraint recargo_cuotas_pct_razonable check (
    tipo_valor <> 'porcentaje' or valor <= 100
  )
);

comment on table recargo_cuotas is
  'Lo que se le cobra de más al cliente por pagar en cuotas. Espejo de '
  'arancel_cobro (00057): misma llave (cuenta, medio, cuotas), flechas '
  'opuestas — el arancel BAJA lo que cobra el comercio, el recargo SUBE lo '
  'que paga el cliente. Que compartan llave es lo que permite verificar que '
  'el recargo cubra el arancel.';

comment on column recargo_cuotas.valor is
  'En porcentaje: 10.000 = +10%, MISMA unidad que arancel_cobro.arancel_pct '
  '(y distinta de regla_precio.valor, que usa 0.1000). En monto_fijo: importe '
  'que se suma al precio ya descontado.';

comment on column recargo_cuotas.propia is
  'true = lo financia el comercio. No lleva cuenta ni medio, y NO hereda el '
  'recargo del comodín: sin fila propia, financiar sale sin recargo.';

-- Un solo recargo VIGENTE por combinación.
--
-- El problema: por defecto un unique index considera que dos NULL son
-- distintos, así que los comodines (cuenta y/o medio en NULL) podrían
-- duplicarse — y el comodín tiene que ser tan único como los específicos.
--
-- `arancel_cobro_vigente_uk` (00057) lo resuelve con `coalesce(cuotas, 0)`,
-- pero acá ese truco NO sirve: `medio` es un enum, y el cast `medio::text` es
-- STABLE y no IMMUTABLE (una etiqueta de enum se puede renombrar con ALTER
-- TYPE ... RENAME VALUE), así que Postgres rechaza la expresión en un índice.
-- Tampoco sirve un centinela del propio enum: cualquier valor que se elija es
-- un valor legítimo y colisionaría con una fila real.
--
-- `NULLS NOT DISTINCT` (PG 15+, y acá corre 17) hace justo lo que se quiere y
-- además lo dice: dos NULL son el MISMO comodín. Sin expresiones, sin
-- centinelas y sin nada que se pueda romper al renombrar un enum.
create unique index if not exists recargo_cuotas_vigente_uk
  on recargo_cuotas(id_tenant, cuotas, propia, id_cuenta_destino, medio)
  nulls not distinct
  where vigente_hasta is null;

create index if not exists recargo_cuotas_lookup_idx
  on recargo_cuotas(id_tenant, cuotas, vigente_hasta);

drop trigger if exists recargo_cuotas_touch on recargo_cuotas;
create trigger recargo_cuotas_touch before update on recargo_cuotas
  for each row execute function set_updated_at();

alter table recargo_cuotas enable row level security;

drop policy if exists recargo_cuotas_all_own_tenant on recargo_cuotas;
create policy recargo_cuotas_all_own_tenant on recargo_cuotas for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── resolver_recargo_cuotas ─────────────────────────────────────────
-- Devuelve UNA fila (la más específica) o NULL. Especificidad, de mayor a
-- menor:
--
--   3 · cuenta + medio  → "Mercado Pago con crédito en 3"
--   2 · cuenta          → "Mercado Pago en 3, por cualquier medio"
--   1 · medio           → "cualquier crédito en 3"
--   0 · comodín         → "en 3, pase por donde pase"
--
-- Gana el destino sobre el medio porque el arancel que el recargo pretende
-- cubrir es una propiedad de la cuenta: dos procesadores distintos con el
-- mismo medio tienen aranceles distintos.
--
-- Sin fila NO es un error: devuelve NULL y el precio queda sin recargo. Mismo
-- criterio que `sp_calcular_costo_cobro` — una venta no se cae porque falte
-- configurar un porcentaje, y quedarse corto es preferible a cobrarle de más
-- a un cliente por una fila que nadie cargó.
create or replace function resolver_recargo_cuotas(
  p_cuotas            smallint,
  p_id_cuenta_destino uuid    default null,
  p_medio             medio_pago default null,
  p_propia            boolean default false
) returns recargo_cuotas
language sql
stable
as $$
  select r.*
    from recargo_cuotas r
   where r.id_tenant = auth_tenant_id()
     and r.cuotas = p_cuotas
     and r.vigente_hasta is null
     and r.vigente_desde <= current_date
     and r.propia = coalesce(p_propia, false)
     -- Con financiación propia no hay procesador que filtrar: el check de la
     -- tabla garantiza que esas filas tienen cuenta y medio en NULL.
     and (
       coalesce(p_propia, false)
       or (
         (r.id_cuenta_destino is null or r.id_cuenta_destino = p_id_cuenta_destino)
         and (r.medio is null or r.medio = p_medio)
       )
     )
   order by
     (r.id_cuenta_destino is not null)::int * 2 + (r.medio is not null)::int desc,
     r.vigente_desde desc,
     r.updated_at desc
   limit 1;
$$;

-- ─── Migración de los recargos existentes ────────────────────────────
-- Se COPIAN, no se mueven: las reglas viejas quedan intactas en
-- `regla_precio`. Si 00064 sale mal, el dato original sigue ahí.
--
-- Todas entran como comodín (sin cuenta ni medio), que es exactamente lo que
-- significaban: hasta hoy el recargo no podía distinguir por dónde entraba la
-- plata. Afinarlas por destino es trabajo de configuración, no de migración —
-- inventar acá a qué cuenta pertenecía cada una sería adivinar.
--
-- Los recargos de `efectivo` y `transferencia` NO se migran: esta tabla
-- modela el costo de financiar, y `sp_calcular_precio_venta_snapshot` los
-- venía descartando igual (00046:133 corta con `p_forma_pago = 'efectivo'`).
-- Migrarlos ACTIVARÍA un recargo que hoy no se cobra, subiéndole el precio a
-- ventas que hasta ayer salían al precio de lista.
insert into recargo_cuotas (
  id_tenant, cuotas, id_cuenta_destino, medio, propia,
  tipo_valor, valor, vigente_desde, notas
)
select r.id_tenant,
       substring(r.forma_pago::text from '^cuotas_(\d+)$')::smallint,
       null, null, false,
       r.tipo_valor,
       -- Porcentaje: 0.1000 → 10.000 (ver "Unidades" en la cabecera).
       -- Monto fijo: el importe va tal cual.
       case when r.tipo_valor = 'porcentaje' then r.valor * 100 else r.valor end,
       coalesce(r.fecha_inicio::date, current_date),
       'Migrado de regla_precio ' || r.id_regla::text || ' (' || r.nombre || ')'
  from regla_precio r
 where r.tipo_regla = 'recargo'
   and r.fecha_baja is null
   and r.alcance = 'global'
   and r.forma_pago::text ~ '^cuotas_\d+$'
on conflict do nothing;

-- Censo en voz alta: qué se migró y qué quedó afuera a propósito. Aparece en
-- la salida de psql, así que el que corre la migración lo ve pasar.
do $$
declare
  v_migrados integer;
  v_omitidos integer;
begin
  select count(*) into v_migrados from recargo_cuotas;
  select count(*) into v_omitidos
    from regla_precio
   where tipo_regla = 'recargo'
     and fecha_baja is null
     and forma_pago::text !~ '^cuotas_\d+$';

  raise notice '00063 · recargos migrados a recargo_cuotas: %', v_migrados;
  if v_omitidos > 0 then
    raise notice '00063 · recargos de efectivo/transferencia NO migrados (nunca se '
                 'aplicaron, ver 00046:133): %', v_omitidos;
  end if;
end $$;

grant execute on function resolver_recargo_cuotas(smallint, uuid, medio_pago, boolean)
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- DOWN
-- ─────────────────────────────────────────────────────────────────────
--   drop function if exists resolver_recargo_cuotas(smallint, uuid, medio_pago, boolean);
--   drop policy if exists recargo_cuotas_all_own_tenant on recargo_cuotas;
--   drop index if exists recargo_cuotas_lookup_idx;
--   drop index if exists recargo_cuotas_vigente_uk;
--   drop table if exists recargo_cuotas;
--
-- Los recargos originales siguen en regla_precio: el DOWN no tiene que
-- restaurar nada.
