-- 00059_financiacion_propia.sql
-- UP: cuotas financiadas por el comercio — la deuda que el cliente queda
--     debiendo cuando la tienda le fía, en vez de financiarlo el banco.
--
--     ─── El problema que resuelve la tabla nueva ──────────────────────
--     00047 estableció, y `sp_registrar_venta` VALIDA, que la suma de
--     `pago_venta.monto` tiene que dar `venta.total`. Una venta financiada en
--     la que el cliente hoy paga $0 rompe esa invariante: el SP la rechaza y
--     la venta no se puede registrar.
--
--     La salida fácil — meter las cuotas como `pago_venta` en estado
--     "pendiente" — destruye lo que esa tabla significa. Su propio comentario
--     dice que responde "dónde está la plata", y una cuota que todavía no se
--     cobró no es plata que esté en ningún lado: es una promesa.
--
--     Por eso `cuota_financiada` es una tabla aparte. `pago_venta` sigue
--     siendo CAJA (plata que entró); `cuota_financiada` es CUENTAS POR COBRAR
--     (plata que van a deber). La invariante pasa a ser, al registrar:
--
--         sum(pago_venta del día) + sum(cuota_financiada.monto) = venta.total
--
--     Cuando se cobra una cuota nace un `pago_venta` apuntando a ella, y ese
--     pago calcula su costo de cobro (00057) como cualquier otro: si el
--     cliente paga la cuota por transferencia, esa transferencia tiene su
--     arancel.
--
--     ─── Qué NO se toca ───────────────────────────────────────────────
--     El interés de la financiación YA existe: es la regla de `recargo` por
--     forma de pago (00017). Sube el precio en cuotas y queda dentro de
--     `venta.total`. Agregar un segundo mecanismo de interés acá lo cobraría
--     dos veces.
-- DOWN: al final, comentado.

-- ─── Quién financia ──────────────────────────────────────────────────
-- Dato explícito, NO inferido. Tentaba deducirlo de `medio_pago in
-- (efectivo, transferencia) + cuotas`, pero el medio es cómo va a pagar CADA
-- CUOTA, no quién asume el riesgo de crédito: un cliente puede pagar 6 cuotas
-- en efectivo (financia la tienda) o con tarjeta en 6 (financia el banco).
-- Una inferencia así se rompe en silencio el día que se financie y se cobre
-- por débito automático.

create type tipo_financiacion as enum ('ninguna', 'externa', 'propia');

alter table venta add column if not exists financiacion tipo_financiacion
  not null default 'ninguna';

-- Backfill: históricamente TODA venta en cuotas era tarjeta (mismo supuesto
-- que el backfill de `medio_pago` en 00047).
update venta
   set financiacion = 'externa'
 where forma_pago::text ~ '^cuotas_\d+$'
   and financiacion = 'ninguna';

comment on column venta.financiacion is
  'externa = la financia el banco/procesador. propia = la financia el comercio '
  'y genera filas en cuota_financiada.';

-- ─── Cuotas ──────────────────────────────────────────────────────────

create type estado_cuota as enum
  ('pendiente', 'parcial', 'pagada', 'incobrable', 'anulada');

create table if not exists cuota_financiada (
  id_cuota_financiada uuid primary key default gen_random_uuid(),
  id_tenant           uuid not null references tenant(id_tenant) on delete cascade,
  id_venta            uuid not null references venta(id_venta) on delete cascade,

  -- NOT NULL a propósito: una deuda sin cliente es una deuda perdida. El SP
  -- rechaza financiar una venta de mostrador por este mismo motivo.
  -- `restrict`: un cliente con cuotas no se borra.
  id_cliente          uuid not null references cliente(id_cliente) on delete restrict,

  numero              smallint not null check (numero > 0),
  monto               numeric(14, 2) not null check (monto > 0),
  monto_pagado        numeric(14, 2) not null default 0 check (monto_pagado >= 0),
  fecha_vencimiento   date not null,
  estado              estado_cuota not null default 'pendiente',

  fecha_cobro           timestamptz,
  fecha_incobrable      timestamptz,
  id_usuario_incobrable uuid references usuario(id_usuario),
  motivo_incobrable     text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cuota_pagado_no_excede check (monto_pagado <= monto),

  -- El estado no puede contradecir al monto pagado. Sin esto, una cuota
  -- marcada 'pagada' con monto_pagado = 0 desaparece del panel de deuda sin
  -- que haya entrado un peso, y no queda rastro de por qué.
  constraint cuota_estado_coherente check (
    (estado = 'pendiente' and monto_pagado = 0) or
    (estado = 'parcial'   and monto_pagado > 0 and monto_pagado < monto) or
    (estado = 'pagada'    and monto_pagado = monto) or
    estado in ('incobrable', 'anulada')
  )
);

create unique index if not exists cuota_venta_numero_uk
  on cuota_financiada(id_venta, numero);

-- El índice del panel de control: "qué vence este mes", "qué está vencido".
create index if not exists cuota_vencimiento_idx
  on cuota_financiada(id_tenant, estado, fecha_vencimiento);

-- El estado de cuenta de un cliente.
create index if not exists cuota_cliente_idx
  on cuota_financiada(id_tenant, id_cliente, estado);

create trigger cuota_financiada_touch before update on cuota_financiada
  for each row execute function set_updated_at();

alter table cuota_financiada enable row level security;

create policy cuota_financiada_all_own_tenant on cuota_financiada for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── Vincular el cobro de una cuota con la caja ──────────────────────
-- NULL  → cobro del día de la venta (contado o anticipo).
-- Valor → cobro de una cuota, con su propio arancel si entró por tarjeta o
--         transferencia.

alter table pago_venta add column if not exists id_cuota_financiada uuid
  references cuota_financiada(id_cuota_financiada) on delete restrict;

create index if not exists pago_venta_cuota_idx
  on pago_venta(id_cuota_financiada) where id_cuota_financiada is not null;

-- ─── Categoría de gasto para los incobrables ─────────────────────────
-- Marcar una cuota incobrable registra un gasto, y necesita dónde imputarlo.

insert into categoria_gasto (id_tenant, nombre, descripcion)
select t.id_tenant, 'Incobrables',
       'Cuotas financiadas que el cliente no pagó y se dieron por perdidas.'
  from tenant t
 where not exists (
   select 1 from categoria_gasto c
    where c.id_tenant = t.id_tenant and lower(c.nombre) = 'incobrables'
 );

-- ─── Plan de cuotas ──────────────────────────────────────────────────
-- Genera N vencimientos mensuales desde una fecha base.
--
-- Se suma SIEMPRE desde la base (`base + (i-1) meses`), nunca mes a mes: si
-- se acumulara, un plan que arranca el 31/01 daría 28/02, 28/03, 28/04… El
-- ajuste de fin de mes de Postgres es correcto pero no es reversible, así que
-- aplicarlo una sola vez por cuota es lo que mantiene el "día 31" cada vez que
-- el mes lo tiene.

create or replace function fn_vencimientos_cuotas(
  p_primer_vencimiento date,
  p_cuotas             smallint
) returns setof date
language sql
immutable
as $$
  select (p_primer_vencimiento + make_interval(months => i - 1))::date
    from generate_series(1, p_cuotas) as i;
$$;

-- ─── sp_registrar_venta (+ financiación propia) ──────────────────────
-- La firma CAMBIA (entra `p_financiacion`), así que hay que dropear la de
-- 00057: agregar un parámetro con default dejaría dos overloads y PostgREST
-- no sabría cuál llamar.

drop function if exists sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet, jsonb);

create or replace function sp_registrar_venta(
  p_lineas       jsonb,
  p_forma_pago   forma_pago default 'efectivo',
  p_id_cliente   uuid default null,
  p_id_reserva   uuid default null,
  p_observaciones text default null,
  p_ip           inet default null,
  -- [{ medio, id_cuenta_destino, monto, cuotas?, monto_recibido?, referencia? }, ...]
  -- NULL o vacío = un solo pago por el total contra la cuenta predeterminada.
  p_pagos        jsonb default null,
  -- { cuotas: 6, primer_vencimiento: '2026-09-10' }
  -- NULL = venta sin financiación propia. Si viene, lo que no cubran los
  -- pagos del día queda como deuda del cliente.
  p_financiacion jsonb default null
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
  -- Cobro (00057)
  v_medio      medio_pago;
  v_cuotas     smallint;
  v_cobro      jsonb;
  v_costo_cobro numeric(14, 2);
  -- Financiación propia (00059)
  v_fin_cuotas smallint;
  v_fin_desde  date;
  v_a_financiar numeric(14, 2) := 0;
  v_cuota_base numeric(14, 2);
  v_acumulado  numeric(14, 2) := 0;
  v_monto_cuota numeric(14, 2);
  v_i          smallint;
  v_venc       date;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'lineas-vacias' using errcode = '22023';
  end if;

  -- Se valida ANTES de tocar stock: si falta el cliente, la venta no puede
  -- existir, y descubrirlo después de marcar los ítems como vendidos obliga a
  -- deshacer media transacción.
  if p_financiacion is not null then
    v_fin_cuotas := (p_financiacion->>'cuotas')::smallint;
    v_fin_desde  := (p_financiacion->>'primer_vencimiento')::date;

    if p_id_cliente is null then
      raise exception 'financiacion-sin-cliente' using errcode = '22023';
    end if;
    if v_fin_cuotas is null or v_fin_cuotas < 1 or v_fin_cuotas > 24 then
      raise exception 'financiacion-cuotas-invalidas: %', v_fin_cuotas
        using errcode = '22023';
    end if;
    if v_fin_desde is null then
      raise exception 'financiacion-sin-vencimiento' using errcode = '22023';
    end if;
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
                    total, observaciones, financiacion)
  values (v_tenant, p_id_cliente, v_actor, p_forma_pago, 0, p_observaciones,
          case
            when p_financiacion is not null then 'propia'::tipo_financiacion
            when p_forma_pago::text ~ '^cuotas_\d+$' then 'externa'::tipo_financiacion
            else 'ninguna'::tipo_financiacion
          end)
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
    -- Con financiación propia NO se genera: lo que no se pagó hoy es deuda.
    if v_total > 0 and p_financiacion is null then
      select id_cuenta_destino into v_id_cuenta
        from cuenta_destino
       where id_tenant = v_tenant and es_predeterminada and activo;
      if v_id_cuenta is null then
        raise exception 'sin-cuenta-predeterminada' using errcode = '22023';
      end if;

      v_medio := case p_forma_pago::text
                   when 'efectivo' then 'efectivo'::medio_pago
                   when 'transferencia' then 'transferencia'::medio_pago
                   else 'tarjeta_credito'::medio_pago
                 end;
      v_cuotas := nullif(substring(p_forma_pago::text from '^cuotas_(\d+)$'), '')::smallint;

      v_cobro := sp_calcular_costo_cobro(v_id_cuenta, v_medio, v_cuotas, v_total);
      v_costo_cobro := (v_cobro->>'costo_total')::numeric;

      insert into pago_venta(
        id_tenant, id_venta, id_cuenta_destino, medio, monto, cuotas,
        costo_cobro, neto_acreditado, fecha_acreditacion, desglose_costo
      ) values (
        v_tenant, v_id_venta, v_id_cuenta, v_medio, v_total, v_cuotas,
        v_costo_cobro, v_total - v_costo_cobro,
        current_date + (v_cobro->>'dias_acreditacion')::int,
        v_cobro
      );
      v_pagado := v_total;
    end if;
  else
    for v_pago in select * from jsonb_array_elements(p_pagos) loop
      v_id_cuenta  := (v_pago->>'id_cuenta_destino')::uuid;
      v_monto_pago := (v_pago->>'monto')::numeric;
      v_medio      := (v_pago->>'medio')::medio_pago;
      v_cuotas     := nullif(v_pago->>'cuotas', '')::smallint;

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
      if v_medio = 'tarjeta_credito' and v_cuotas is null then
        raise exception 'pago-credito-sin-cuotas' using errcode = '22023';
      end if;
      if v_medio <> 'tarjeta_credito' and v_cuotas is not null then
        raise exception 'pago-cuotas-medio-invalido: %', v_medio using errcode = '22023';
      end if;

      v_cobro := sp_calcular_costo_cobro(v_id_cuenta, v_medio, v_cuotas, v_monto_pago);
      v_costo_cobro := (v_cobro->>'costo_total')::numeric;

      insert into pago_venta(
        id_tenant, id_venta, id_cuenta_destino, medio, monto, cuotas,
        monto_recibido, referencia,
        costo_cobro, neto_acreditado, fecha_acreditacion, desglose_costo
      ) values (
        v_tenant, v_id_venta, v_id_cuenta, v_medio, v_monto_pago, v_cuotas,
        nullif(v_pago->>'monto_recibido', '')::numeric,
        nullif(v_pago->>'referencia', ''),
        v_costo_cobro, v_monto_pago - v_costo_cobro,
        current_date + (v_cobro->>'dias_acreditacion')::int,
        v_cobro
      );

      v_pagado := v_pagado + v_monto_pago;
    end loop;
  end if;

  -- ─── Financiación propia ───────────────────────────────────────────
  if p_financiacion is not null then
    v_a_financiar := v_total - v_pagado;
    if v_a_financiar <= 0 then
      raise exception 'financiacion-sin-saldo: pagado % contra total %',
        v_pagado, v_total using errcode = '22023';
    end if;

    -- El residuo del redondeo va TODO a la última cuota. Repartirlo o
    -- ignorarlo deja la suma de cuotas distinta del saldo, y a partir de ahí
    -- todo reporte de deuda arrastra centavos que nadie puede explicar.
    v_cuota_base := round(v_a_financiar / v_fin_cuotas, 2);

    v_i := 0;
    for v_venc in select * from fn_vencimientos_cuotas(v_fin_desde, v_fin_cuotas) loop
      v_i := v_i + 1;
      if v_i = v_fin_cuotas then
        v_monto_cuota := v_a_financiar - v_acumulado;
      else
        v_monto_cuota := v_cuota_base;
      end if;
      v_acumulado := v_acumulado + v_monto_cuota;

      insert into cuota_financiada(
        id_tenant, id_venta, id_cliente, numero, monto, fecha_vencimiento
      ) values (
        v_tenant, v_id_venta, p_id_cliente, v_i, v_monto_cuota, v_venc
      );
    end loop;

    -- Cinturón y tiradores: la suma de cuotas más lo cobrado hoy TIENE que
    -- dar el total. Si no, hay un bug de redondeo y es mejor abortar que
    -- persistir una deuda que no cierra.
    if v_pagado + v_acumulado <> v_total then
      raise exception 'financiacion-no-cuadra: % + % contra %',
        v_pagado, v_acumulado, v_total using errcode = '22023';
    end if;

  elsif p_pagos is not null and jsonb_array_length(p_pagos) > 0 then
    -- Sin financiación, la cobranza tiene que cerrar contra el total. Un pago
    -- mixto que no suma el total es plata que no sabés dónde está.
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
                             'pagos', coalesce(jsonb_array_length(p_pagos), 1),
                             'financiado', v_acumulado,
                             'cuotas_financiadas', coalesce(v_fin_cuotas, 0)),
          p_ip);
  return v_id_venta;
end $$;

grant execute on function sp_registrar_venta(
  jsonb, forma_pago, uuid, uuid, text, inet, jsonb, jsonb
) to authenticated;

-- ─── sp_cobrar_cuota ─────────────────────────────────────────────────
-- Registra un cobro (total o parcial) contra una cuota. Nace un `pago_venta`,
-- que es lo que hace que la plata aparezca en el reporte de caja del día en
-- que ENTRÓ, no del día de la venta.

create or replace function sp_cobrar_cuota(
  p_id_cuota          uuid,
  p_monto             numeric,
  p_medio             medio_pago,
  p_id_cuenta_destino uuid,
  p_referencia        text default null,
  p_ip                inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_cuota      cuota_financiada;
  v_saldo      numeric(14, 2);
  v_pagado     numeric(14, 2);
  v_estado     estado_cuota;
  v_cobro      jsonb;
  v_costo      numeric(14, 2);
  v_id_pago    uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select * into v_cuota from cuota_financiada
   where id_cuota_financiada = p_id_cuota and id_tenant = v_tenant
   for update;
  if v_cuota.id_cuota_financiada is null then
    raise exception 'cuota-not-found' using errcode = '42704';
  end if;
  if v_cuota.estado not in ('pendiente', 'parcial') then
    raise exception 'cuota-no-cobrable: %', v_cuota.estado using errcode = '22023';
  end if;

  v_saldo := v_cuota.monto - v_cuota.monto_pagado;
  if p_monto is null or p_monto <= 0 then
    raise exception 'monto-invalido: %', p_monto using errcode = '22023';
  end if;
  if p_monto > v_saldo then
    raise exception 'monto-excede-saldo: % contra %', p_monto, v_saldo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from cuenta_destino
     where id_cuenta_destino = p_id_cuenta_destino
       and id_tenant = v_tenant and activo
  ) then
    raise exception 'cuenta-destino-invalida: %', p_id_cuenta_destino
      using errcode = '22023';
  end if;

  -- La cuota cobrada por transferencia paga su arancel como cualquier cobro.
  -- `cuotas` va NULL: el plan de la financiación propia no es un plan de
  -- tarjeta, y el tarifario de crédito no le aplica.
  v_cobro := sp_calcular_costo_cobro(p_id_cuenta_destino, p_medio, null, p_monto);
  v_costo := (v_cobro->>'costo_total')::numeric;

  insert into pago_venta(
    id_tenant, id_venta, id_cuenta_destino, id_cuota_financiada,
    medio, monto, referencia,
    costo_cobro, neto_acreditado, fecha_acreditacion, desglose_costo
  ) values (
    v_tenant, v_cuota.id_venta, p_id_cuenta_destino, p_id_cuota,
    p_medio, p_monto, nullif(trim(coalesce(p_referencia, '')), ''),
    v_costo, p_monto - v_costo,
    current_date + (v_cobro->>'dias_acreditacion')::int,
    v_cobro
  )
  returning id_pago_venta into v_id_pago;

  v_pagado := v_cuota.monto_pagado + p_monto;
  v_estado := case when v_pagado >= v_cuota.monto then 'pagada' else 'parcial' end;

  update cuota_financiada
     set monto_pagado = v_pagado,
         estado       = v_estado,
         fecha_cobro  = case when v_estado = 'pagada' then now() else fecha_cobro end
   where id_cuota_financiada = p_id_cuota;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'cuota_financiada', p_id_cuota::text, 'editar',
          jsonb_build_object('cobrado', p_monto, 'medio', p_medio,
                             'acumulado', v_pagado, 'estado', v_estado),
          p_ip);
  return v_id_pago;
end $$;

grant execute on function sp_cobrar_cuota(uuid, numeric, medio_pago, uuid, text, inet)
  to authenticated;

-- ─── sp_marcar_cuota_incobrable ──────────────────────────────────────
-- Da la cuota por perdida y registra el gasto por el SALDO IMPAGO.
--
-- Se registra el saldo, no el costo de la mercadería: el ingreso ya se
-- devengó cuando se hizo la venta, así que el gasto por lo que no se cobró es
-- lo que cierra el resultado. El costo YA está contado en `costo_mercaderia`
-- del reporte financiero — registrarlo de nuevo acá lo restaría dos veces.
-- Cuánta plata hay que poner del bolsillo lo responde
-- `sp_perdida_incobrable_venta`, que es un KPI, no un asiento.

create or replace function sp_marcar_cuota_incobrable(
  p_id_cuota uuid,
  p_motivo   text,
  p_ip       inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_cuota      cuota_financiada;
  v_saldo      numeric(14, 2);
  v_id_cat     uuid;
  v_id_gasto   uuid;
  v_cliente    text;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'motivo-requerido' using errcode = '22023';
  end if;

  select * into v_cuota from cuota_financiada
   where id_cuota_financiada = p_id_cuota and id_tenant = v_tenant
   for update;
  if v_cuota.id_cuota_financiada is null then
    raise exception 'cuota-not-found' using errcode = '42704';
  end if;
  if v_cuota.estado not in ('pendiente', 'parcial') then
    raise exception 'cuota-no-incobrable: %', v_cuota.estado using errcode = '22023';
  end if;

  v_saldo := v_cuota.monto - v_cuota.monto_pagado;

  update cuota_financiada
     set estado                = 'incobrable',
         fecha_incobrable      = now(),
         id_usuario_incobrable = v_actor,
         motivo_incobrable     = trim(p_motivo)
   where id_cuota_financiada = p_id_cuota;

  select id_categoria_gasto into v_id_cat
    from categoria_gasto
   where id_tenant = v_tenant and lower(nombre) = 'incobrables'
   limit 1;
  if v_id_cat is null then
    insert into categoria_gasto(id_tenant, nombre, descripcion)
    values (v_tenant, 'Incobrables',
            'Cuotas financiadas que el cliente no pagó y se dieron por perdidas.')
    returning id_categoria_gasto into v_id_cat;
  end if;

  select nombre_completo into v_cliente
    from cliente where id_cliente = v_cuota.id_cliente;

  v_id_gasto := sp_registrar_gasto(
    v_id_cat,
    v_saldo,
    format('Cuota %s incobrable — %s. %s', v_cuota.numero, coalesce(v_cliente, 'cliente'), trim(p_motivo)),
    null,
    null,
    p_ip
  );

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'cuota_financiada', p_id_cuota::text, 'editar',
          jsonb_build_object('estado', 'incobrable', 'saldo_perdido', v_saldo,
                             'motivo', trim(p_motivo), 'id_gasto', v_id_gasto),
          p_ip);
  return v_id_gasto;
end $$;

grant execute on function sp_marcar_cuota_incobrable(uuid, text, inet) to authenticated;

-- ─── sp_anular_venta (+ cuotas) ──────────────────────────────────────
-- Las cuotas no cobradas pasan a 'anulada', NO a 'incobrable': una venta
-- anulada no es una pérdida, es una venta que no existió. Marcarlas
-- incobrables generaría un gasto por plata que nunca se devengó.
--
-- Los `pago_venta` ya registrados quedan: la devolución de esa plata es un
-- movimiento real y se hace a mano.

create or replace function sp_anular_venta(
  p_id_venta uuid,
  p_motivo   text default null,
  p_ip       inet default null
) returns void language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_estado   estado_venta;
  v_rendida  boolean;
  v_anuladas integer := 0;
  r_det      record;
begin
  select estado_venta into v_estado from venta
    where id_venta = p_id_venta and id_tenant = v_tenant for update;
  if v_estado is null then
    raise exception 'venta-not-found' using errcode = '42704';
  end if;
  if v_estado = 'anulada' then
    return; -- idempotente
  end if;

  select exists(
    select 1 from detalle_venta
     where id_venta = p_id_venta and id_rendicion is not null
  ) into v_rendida;
  if v_rendida then
    raise exception 'venta-ya-rendida' using errcode = '22023';
  end if;

  for r_det in
    select dv.id_item, ip.estado_item
      from detalle_venta dv
      join item_producto ip on ip.id_item = dv.id_item
     where dv.id_venta = p_id_venta
     for update of ip
  loop
    if r_det.estado_item = 'vendido' then
      perform sp_transicion_item_producto(
        r_det.id_item, 'disponible', 'ajuste', p_id_venta, 'anulacion_venta', p_ip
      );
    end if;
  end loop;

  with anuladas as (
    update cuota_financiada
       set estado = 'anulada'
     where id_venta = p_id_venta
       and estado in ('pendiente', 'parcial')
    returning 1
  )
  select count(*) into v_anuladas from anuladas;

  update venta
     set estado_venta     = 'anulada',
         fecha_anulacion  = now(),
         motivo_anulacion = p_motivo
   where id_venta = p_id_venta;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'venta', p_id_venta::text, 'anular',
          jsonb_build_object('motivo', p_motivo, 'cuotas_anuladas', v_anuladas),
          p_ip);
end $$;

grant execute on function sp_anular_venta(uuid, text, inet) to authenticated;

-- ─── sp_perdida_incobrable_venta ─────────────────────────────────────
-- Los DOS números que el negocio necesita cuando un cliente no paga:
--
--   monto_adeudado    — lo que no se cobró. Ganancia que nunca entró.
--   costo_no_cubierto — cuánta plata hay que poner del bolsillo.
--
-- El segundo existe porque la tienda vende en consignación: si el cliente no
-- paga, igual le debe al proveedor. Se calcula sobre la VENTA COMPLETA y no
-- cuota por cuota, porque las primeras cuotas van cubriendo el costo: quien
-- pagó 5 de 6 ya cubrió la mercadería y sólo perdió margen.
--
-- El costo por línea es `monto_proveedor` cuando el ítem entró en
-- consignación (es lo que se le debe al proveedor) y `costo_snapshot` cuando
-- fue compra propia (es lo que salió del bolsillo al comprarla). Coincide con
-- cómo `sp_registrar_venta` los completa: en 'compra', monto_proveedor = 0.
--
-- ─── Sobre el detalle por línea ───────────────────────────────────────
-- `detalle` reparte el faltante entre los productos EN PROPORCIÓN al costo de
-- cada uno. Es una ATRIBUCIÓN, no un hecho: la plata es fungible y no existe
-- tal cosa como "esta cuota pagó la remera y no el pantalón". Se reparte así
-- porque es lo único defendible y porque responde la pregunta que importa:
-- a QUÉ PROVEEDOR le voy a tener que pagar algo que nunca cobré.
--
-- El residuo del redondeo va a la última línea, igual que en el plan de
-- cuotas: sin eso, la suma del detalle no da el total y el número de arriba
-- deja de poder explicarse con el de abajo.

create or replace function sp_perdida_incobrable_venta(p_id_venta uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_adeudado   numeric(14, 2);
  v_cobrado    numeric(14, 2);
  v_costo      numeric(14, 2);
  v_no_cub     numeric(14, 2);
  v_ratio      numeric;
  v_detalle    jsonb := '[]'::jsonb;
  v_acum       numeric(14, 2) := 0;
  v_linea_no_cub numeric(14, 2);
  v_lineas     integer;
  v_i          integer := 0;
  r            record;
begin
  select coalesce(sum(monto - monto_pagado), 0) into v_adeudado
    from cuota_financiada
   where id_venta = p_id_venta and id_tenant = v_tenant
     and estado = 'incobrable';

  select coalesce(sum(monto), 0) into v_cobrado
    from pago_venta
   where id_venta = p_id_venta and id_tenant = v_tenant;

  select coalesce(sum(
           case when tipo_ingreso_snapshot = 'compra'
                then costo_snapshot
                else monto_proveedor
           end), 0),
         count(*)
    into v_costo, v_lineas
    from detalle_venta
   where id_venta = p_id_venta and id_tenant = v_tenant;

  v_no_cub := greatest(0, v_costo - v_cobrado);

  -- Proporción del costo que quedó SIN cubrir. Con costo 0 (todo compra
  -- propia ya amortizada, o una venta sin costo) no hay nada que repartir.
  v_ratio := case when v_costo > 0 then v_no_cub / v_costo else 0 end;

  if v_no_cub > 0 then
    for r in
      select dv.id_detalle_venta,
             dv.tipo_ingreso_snapshot,
             dv.excluida_rendicion,
             dv.id_rendicion,
             p.nombre as producto_nombre,
             p.sku    as producto_sku,
             pr.id_proveedor,
             pr.nombre as proveedor_nombre,
             case when dv.tipo_ingreso_snapshot = 'compra'
                  then dv.costo_snapshot
                  else dv.monto_proveedor
             end as costo_linea
        from detalle_venta dv
        left join producto  p  on p.id_producto  = dv.id_producto
        left join proveedor pr on pr.id_proveedor = dv.id_proveedor
       where dv.id_venta = p_id_venta and dv.id_tenant = v_tenant
       order by dv.created_at, dv.id_detalle_venta
    loop
      v_i := v_i + 1;
      if v_i = v_lineas then
        v_linea_no_cub := v_no_cub - v_acum;
      else
        v_linea_no_cub := round(r.costo_linea * v_ratio, 2);
      end if;
      v_acum := v_acum + v_linea_no_cub;

      v_detalle := v_detalle || jsonb_build_object(
        'id_detalle_venta',      r.id_detalle_venta,
        'producto_nombre',       r.producto_nombre,
        'producto_sku',          r.producto_sku,
        'tipo_ingreso_snapshot', r.tipo_ingreso_snapshot,
        'id_proveedor',          r.id_proveedor,
        'proveedor_nombre',      r.proveedor_nombre,
        'costo_linea',           r.costo_linea,
        'costo_cubierto',        r.costo_linea - v_linea_no_cub,
        'costo_no_cubierto',     v_linea_no_cub,
        -- DECISIÓN DE NEGOCIO (confirmada): al proveedor se le paga SIEMPRE,
        -- cobre o no cobre el cliente. Así que `costo_no_cubierto` es plata que
        -- sale del bolsillo sin vuelta, y `excluida_rendicion` NO se usa para
        -- tapar incobrables. Se informa igual porque una línea excluida a mano
        -- por otro motivo cambiaría la lectura, y la UI tiene que poder verlo.
        'excluida_rendicion',    r.excluida_rendicion,
        'rendida',               r.id_rendicion is not null
      );
    end loop;
  end if;

  return jsonb_build_object(
    'monto_adeudado',    v_adeudado,
    'total_cobrado',     v_cobrado,
    'costo_total',       v_costo,
    'costo_no_cubierto', v_no_cub,
    'detalle',           v_detalle
  );
end $$;

grant execute on function sp_perdida_incobrable_venta(uuid) to authenticated;

-- ─── DOWN ────────────────────────────────────────────────────────────
--   -- (recrear sp_registrar_venta y sp_anular_venta de 00057/00023 antes de seguir)
--   drop function if exists sp_perdida_incobrable_venta(uuid);
--   drop function if exists sp_marcar_cuota_incobrable(uuid, text, inet);
--   drop function if exists sp_cobrar_cuota(uuid, numeric, medio_pago, uuid, text, inet);
--   drop function if exists sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet, jsonb, jsonb);
--   drop function if exists fn_vencimientos_cuotas(date, smallint);
--   drop index if exists pago_venta_cuota_idx;
--   alter table pago_venta drop column if exists id_cuota_financiada;
--   drop table if exists cuota_financiada;
--   drop type if exists estado_cuota;
--   alter table venta drop column if exists financiacion;
--   drop type if exists tipo_financiacion;
