-- 00047_pagos_venta.sql
-- UP: cobranza de la venta — N pagos por venta, cada uno contra una cuenta
--     destino. Responde "dónde está la plata", que hasta ahora no se
--     registraba en ningún lado.
--
--     Separación deliberada de dos conceptos que hoy están fusionados en
--     `venta.forma_pago`:
--       - forma_pago (enum existente) = cómo se PRECIÓ la venta. Es input de
--         `sp_calcular_precio_venta_snapshot` (00046) y define el recargo por
--         regla. NO se toca acá más que para sumarle 'transferencia', porque
--         sin ese valor no se puede crear una regla de recargo por
--         transferencia desde la sección Precios.
--       - medio_pago (enum nuevo) = por dónde ENTRÓ la plata. No afecta el
--         precio. Una venta puede tener varios: efectivo + transferencia.
--
--     `pago_venta` es la fuente de verdad de la cobranza: la suma de sus
--     montos tiene que dar `venta.total`. Se valida en sp_registrar_venta y
--     no con un check de DB, por el mismo motivo que `venta.total` vs sus
--     líneas (00021): el check sería circular con el orden de INSERTs.
--
--     Compatibilidad: `p_pagos` es opcional. Si no viene, el SP genera UN
--     pago por el total contra la cuenta predeterminada del tenant. El flujo
--     actual de la app sigue funcionando sin cambios hasta que se conecte la
--     UI de pago mixto.
-- DOWN: al final, comentado.

-- ─── Enums ───────────────────────────────────────────────────────────

-- OJO: `alter type ... add value` no puede USARSE en la misma transacción en
-- que se agrega. Por eso ningún statement de esta migración referencia el
-- literal 'transferencia' de forma_pago (el backfill mapea sólo los valores
-- que ya existían, y el SP compara vía ::text).
alter type forma_pago add value if not exists 'transferencia';

create type tipo_cuenta_destino as enum ('efectivo', 'banco', 'billetera_virtual');

-- Card: `cuotas_2`/`cuotas_3` ya existen como forma de precio, así que la
-- tarjeta necesita su medio para poder registrar por dónde entró.
create type medio_pago as enum (
  'efectivo',
  'transferencia',
  'tarjeta_debito',
  'tarjeta_credito'
);

-- ─── CuentaDestino ───────────────────────────────────────────────────
-- Los "lugares donde se recibe la plata": la caja del local, una cuenta
-- bancaria, una billetera virtual. Se administran desde la app (RLS abierta
-- al tenant), no requieren migración para crecer.

create table if not exists cuenta_destino (
  id_cuenta_destino uuid primary key default gen_random_uuid(),
  id_tenant         uuid not null references tenant(id_tenant) on delete cascade,

  nombre            text not null check (length(trim(nombre)) > 0),
  tipo              tipo_cuenta_destino not null,
  -- Datos para conciliar contra el resumen/extracto: titular, CBU, alias,
  -- últimos 4 dígitos. Opcionales — la caja física no tiene ninguno.
  titular           text,
  identificador     text,

  activo            boolean not null default true,
  -- Cuenta usada cuando la venta no especifica dónde entró la plata.
  es_predeterminada boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists cuenta_destino_nombre_uk
  on cuenta_destino(id_tenant, lower(trim(nombre)));

-- Una sola predeterminada por tenant.
create unique index if not exists cuenta_destino_predeterminada_uk
  on cuenta_destino(id_tenant) where es_predeterminada;

create index if not exists cuenta_destino_tenant_activo_idx
  on cuenta_destino(id_tenant, activo);

create trigger cuenta_destino_touch before update on cuenta_destino
  for each row execute function set_updated_at();

alter table cuenta_destino enable row level security;

create policy cuenta_destino_all_own_tenant on cuenta_destino for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── PagoVenta ───────────────────────────────────────────────────────

create table if not exists pago_venta (
  id_pago_venta     uuid primary key default gen_random_uuid(),
  id_tenant         uuid not null references tenant(id_tenant) on delete cascade,
  id_venta          uuid not null references venta(id_venta) on delete cascade,
  -- `restrict`: una cuenta con movimientos no se borra, se da de baja
  -- (activo = false). Perder el destino de un cobro es perder la trazabilidad.
  id_cuenta_destino uuid not null references cuenta_destino(id_cuenta_destino)
                      on delete restrict,

  medio             medio_pago not null,
  monto             numeric(14, 2) not null check (monto > 0),

  -- Vuelto: sólo tiene sentido en efectivo. `monto_recibido` es lo que el
  -- cliente puso en la mano; `vuelto` sale solo y queda NULL si no se cargó
  -- cuánto entregó (caso transferencia, o efectivo justo).
  monto_recibido    numeric(14, 2) check (monto_recibido >= monto),
  vuelto            numeric(14, 2) generated always as (monto_recibido - monto) stored,

  -- Nro de operación / comprobante de la transferencia, últimos dígitos del
  -- cupón de tarjeta, etc.
  referencia        text,

  created_at        timestamptz not null default now(),

  constraint pago_venta_recibido_solo_efectivo check (
    monto_recibido is null or medio = 'efectivo'
  )
);

create index if not exists pago_venta_venta_idx on pago_venta(id_venta);
-- "cuánto entró en cada cuenta": el índice que va a usar el reporte de caja.
create index if not exists pago_venta_tenant_cuenta_idx
  on pago_venta(id_tenant, id_cuenta_destino, created_at desc);

alter table pago_venta enable row level security;

create policy pago_venta_all_own_tenant on pago_venta for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── Seed + backfill ─────────────────────────────────────────────────
-- Cada tenant arranca con su caja física como cuenta predeterminada, y las
-- ventas ya registradas quedan con su pago para que la suma cierre desde el
-- día uno (si no, todo reporte de cobranza empieza con un agujero histórico).

insert into cuenta_destino (id_tenant, nombre, tipo, es_predeterminada)
select t.id_tenant, 'Caja', 'efectivo', true
  from tenant t
 where not exists (
   select 1 from cuenta_destino c where c.id_tenant = t.id_tenant
 );

insert into pago_venta (id_tenant, id_venta, id_cuenta_destino, medio, monto)
select v.id_tenant,
       v.id_venta,
       c.id_cuenta_destino,
       -- Histórico: sólo existían 'efectivo' y cuotas (tarjeta de crédito).
       case v.forma_pago::text
         when 'efectivo' then 'efectivo'::medio_pago
         else 'tarjeta_credito'::medio_pago
       end,
       v.total
  from venta v
  join cuenta_destino c
    on c.id_tenant = v.id_tenant and c.es_predeterminada
 where v.total > 0
   and not exists (select 1 from pago_venta p where p.id_venta = v.id_venta);

-- ─── sp_registrar_venta (+ pagos) ────────────────────────────────────
-- Idéntica a la de 00046 salvo el bloque de cobranza al final. Se dropea la
-- firma vieja: agregar un parámetro con default crearía un overload ambiguo.

drop function if exists sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet);

create or replace function sp_registrar_venta(
  p_lineas       jsonb,
  p_forma_pago   forma_pago default 'efectivo',
  p_id_cliente   uuid default null,
  p_id_reserva   uuid default null,
  p_observaciones text default null,
  p_ip           inet default null,
  -- [{ medio, id_cuenta_destino, monto, monto_recibido?, referencia? }, ...]
  -- NULL o vacío = un solo pago por el total contra la cuenta predeterminada.
  p_pagos        jsonb default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_id_venta   uuid;
  v_total      numeric(14, 2) := 0;
  v_linea      jsonb;
  v_id_item    uuid;
  v_ids_desc   uuid[];
  v_item       item_producto;
  v_producto   producto;
  v_snap       jsonb;
  v_precio     numeric(14, 2);
  v_costo      numeric(14, 2);
  v_id_prov    uuid;
  v_monto_prov numeric(14, 2);
  v_monto_gan  numeric(14, 2);
  v_reserva_estado estado_reserva;
  v_dr_activa  uuid;
  v_pago       jsonb;
  v_id_cuenta  uuid;
  v_monto_pago numeric(14, 2);
  v_pagado     numeric(14, 2) := 0;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'lineas-vacias' using errcode = '22023';
  end if;

  if p_id_reserva is not null then
    select estado_reserva into v_reserva_estado
      from reserva
     where id_reserva = p_id_reserva and id_tenant = v_tenant
     for update;
    if v_reserva_estado is null then
      raise exception 'reserva-not-found' using errcode = '42704';
    end if;
    if v_reserva_estado <> 'activa' then
      raise exception 'reserva-no-activa: %', v_reserva_estado using errcode = '22023';
    end if;
  end if;

  insert into venta(id_tenant, id_cliente, id_usuario_alta, forma_pago,
                    total, observaciones)
  values (v_tenant, p_id_cliente, v_actor, p_forma_pago, 0, p_observaciones)
  returning id_venta into v_id_venta;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_id_item := (v_linea->>'id_item')::uuid;
    if v_id_item is null then
      raise exception 'linea-sin-id-item' using errcode = '22023';
    end if;

    v_ids_desc := coalesce(
      (select array_agg(e::uuid)
         from jsonb_array_elements_text(coalesce(v_linea->'descuentos', '[]'::jsonb)) e),
      '{}'::uuid[]
    );

    select * into v_item
      from item_producto
     where id_item = v_id_item and id_tenant = v_tenant
     for update;
    if v_item.id_item is null then
      raise exception 'item-not-found: %', v_id_item using errcode = '42704';
    end if;
    if v_item.estado_item <> 'disponible' then
      raise exception 'item-no-disponible: % (estado=%)',
        v_id_item, v_item.estado_item using errcode = '22023';
    end if;

    select id_detalle_reserva into v_dr_activa
      from detalle_reserva
     where id_item = v_id_item and estado = 'activa';
    if v_dr_activa is not null then
      if p_id_reserva is null then
        raise exception 'item-en-reserva: % (usa la reserva o cancelala primero)',
          v_id_item using errcode = '22023';
      end if;
      if not exists (
        select 1 from detalle_reserva
         where id_detalle_reserva = v_dr_activa
           and id_reserva = p_id_reserva
      ) then
        raise exception 'item-en-otra-reserva: %', v_id_item using errcode = '22023';
      end if;
      update detalle_reserva set estado = 'convertida_venta'
       where id_detalle_reserva = v_dr_activa;
    end if;

    select * into v_producto from producto
     where id_producto = v_item.id_producto and id_tenant = v_tenant;

    v_snap := sp_calcular_precio_venta_snapshot(v_item.id_producto, p_forma_pago, v_ids_desc);
    if not (v_snap->>'ok')::boolean then
      raise exception 'precio-no-resoluble: producto % (%)',
        v_item.id_producto, v_snap->>'reason' using errcode = '22023';
    end if;
    v_precio := (v_snap->>'precio_final')::numeric;
    v_costo  := v_item.costo_ingreso;

    if v_item.tipo_ingreso = 'compra' then
      v_monto_prov := 0;
      v_id_prov := null;
    else
      v_monto_prov := v_costo;
      select id_proveedor into v_id_prov
        from ingreso_mercaderia
       where id_ingreso = v_item.id_ingreso;
    end if;
    v_monto_gan := v_precio - v_monto_prov;

    insert into detalle_venta(
      id_tenant, id_venta, id_item, id_producto, id_proveedor,
      precio_venta, costo_snapshot, monto_proveedor, monto_gasto, monto_ganancia,
      tipo_ingreso_snapshot, desglose_reglas
    ) values (
      v_tenant, v_id_venta, v_id_item, v_item.id_producto, v_id_prov,
      v_precio, v_costo, v_monto_prov, 0, v_monto_gan,
      v_item.tipo_ingreso, coalesce(v_snap->'desglose', '{}'::jsonb)
    );

    v_total := v_total + v_precio;

    perform sp_transicion_item_producto(
      v_id_item, 'vendido', 'venta', v_id_venta, 'venta', p_ip
    );
  end loop;

  if p_id_reserva is not null then
    update reserva
       set estado_reserva = 'convertida_venta',
           fecha_cierre = now()
     where id_reserva = p_id_reserva;
  end if;

  update venta set total = v_total where id_venta = v_id_venta;

  -- ─── Cobranza ──────────────────────────────────────────────────────
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    -- Sin detalle de cobranza: un pago por el total contra la predeterminada.
    if v_total > 0 then
      select id_cuenta_destino into v_id_cuenta
        from cuenta_destino
       where id_tenant = v_tenant and es_predeterminada and activo;
      if v_id_cuenta is null then
        raise exception 'sin-cuenta-predeterminada' using errcode = '22023';
      end if;
      insert into pago_venta(id_tenant, id_venta, id_cuenta_destino, medio, monto)
      values (v_tenant, v_id_venta, v_id_cuenta,
              case p_forma_pago::text
                when 'efectivo' then 'efectivo'::medio_pago
                when 'transferencia' then 'transferencia'::medio_pago
                else 'tarjeta_credito'::medio_pago
              end,
              v_total);
      v_pagado := v_total;
    end if;
  else
    for v_pago in select * from jsonb_array_elements(p_pagos) loop
      v_id_cuenta  := (v_pago->>'id_cuenta_destino')::uuid;
      v_monto_pago := (v_pago->>'monto')::numeric;

      if v_id_cuenta is null then
        raise exception 'pago-sin-cuenta' using errcode = '22023';
      end if;
      if v_monto_pago is null or v_monto_pago <= 0 then
        raise exception 'pago-monto-invalido: %', v_monto_pago using errcode = '22023';
      end if;
      if not exists (
        select 1 from cuenta_destino
         where id_cuenta_destino = v_id_cuenta
           and id_tenant = v_tenant
           and activo
      ) then
        raise exception 'cuenta-destino-invalida: %', v_id_cuenta using errcode = '22023';
      end if;

      insert into pago_venta(
        id_tenant, id_venta, id_cuenta_destino, medio, monto,
        monto_recibido, referencia
      ) values (
        v_tenant, v_id_venta, v_id_cuenta,
        (v_pago->>'medio')::medio_pago,
        v_monto_pago,
        nullif(v_pago->>'monto_recibido', '')::numeric,
        nullif(v_pago->>'referencia', '')
      );

      v_pagado := v_pagado + v_monto_pago;
    end loop;

    -- La cobranza tiene que cerrar contra el total. Un pago mixto que no
    -- suma el total es plata que no sabés dónde está.
    if v_pagado <> v_total then
      raise exception 'pagos-no-cuadran: pagado % contra total %',
        v_pagado, v_total using errcode = '22023';
    end if;
  end if;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'venta', v_id_venta::text, 'crear',
          jsonb_build_object('total', v_total,
                             'lineas', jsonb_array_length(p_lineas),
                             'forma_pago', p_forma_pago,
                             'id_cliente', p_id_cliente,
                             'id_reserva', p_id_reserva,
                             'pagado', v_pagado,
                             'pagos', coalesce(jsonb_array_length(p_pagos), 1)),
          p_ip);
  return v_id_venta;
end $$;

grant execute on function sp_registrar_venta(
  jsonb, forma_pago, uuid, uuid, text, inet, jsonb
) to authenticated;

-- ─── DOWN ────────────────────────────────────────────────────────────
--   drop function if exists sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet, jsonb);
--   -- (recrear la versión de 00046 antes de seguir)
--   drop table if exists pago_venta;
--   drop table if exists cuenta_destino;
--   drop type if exists medio_pago;
--   drop type if exists tipo_cuenta_destino;
--   -- OJO: 'transferencia' NO se puede sacar de forma_pago sin recrear el
--   -- enum entero y reescribir toda columna que lo use.
