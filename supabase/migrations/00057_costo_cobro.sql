-- 00057_costo_cobro.sql
-- UP: costo de cobro — cuánto se lleva el procesador (Mercado Pago, banco) de
--     cada pago, y cuándo acredita.
--
--     Hasta ahora `pago_venta` registraba el monto BRUTO: lo que el cliente
--     entregó. Pero cuando ese pago entra por tarjeta el comercio no cobra
--     eso. Cobra menos, y días después. Un reporte que dice "facturaste
--     $50.000" cuando vas a recibir $42.792 el mes que viene no está
--     redondeando: está mintiendo sobre dos cosas distintas a la vez (cuánto
--     y cuándo).
--
--     Separación deliberada, en la misma línea que 00047:
--       - `regla_precio` (00017) modela lo que paga el CLIENTE. Un `recargo`
--         por forma de pago SUBE el precio. NO se toca acá.
--       - `arancel_cobro` (esta migración) modela lo que retiene el
--         PROCESADOR. BAJA lo que cobra el comercio.
--       Son flechas opuestas sobre entidades distintas. El arancel además no
--       depende del producto (no cascadea por producto/categoría/proveedor
--       como las reglas), depende de por dónde entró la plata: por eso cuelga
--       de `cuenta_destino` y `medio_pago`, no de `regla_precio`.
--
--     El costo se guarda como SNAPSHOT en `pago_venta`, no se recalcula al
--     leer. Los aranceles cambian; recalcular una venta de marzo con la tasa
--     de hoy hace que el historial mienta. Mismo criterio que
--     `detalle_venta.desglose_reglas` (00046).
-- DOWN: al final, comentado.

-- ─── Cuotas en el pago ───────────────────────────────────────────────
-- `venta.forma_pago` ya dice `cuotas_6`, pero es POR VENTA. El arancel se
-- cobra por PAGO: en una venta mixta (mitad efectivo, mitad tarjeta en 6
-- cuotas) sólo la porción de tarjeta paga arancel de 6 cuotas. Sin este
-- campo no hay forma de saber sobre qué monto aplicarlo.

alter table pago_venta add column if not exists cuotas smallint
  check (cuotas is null or cuotas between 1 and 24);

comment on column pago_venta.cuotas is
  'Cuotas de ESTE pago. NULL = no aplica (efectivo, transferencia, débito). '
  'Requerido con tarjeta_credito — se valida en sp_registrar_venta, no con un '
  'check, por el mismo motivo que el resto de las validaciones de cobranza.';

-- Backfill: histórico, las cuotas siempre fueron tarjeta de crédito (ver el
-- backfill de medio_pago en 00047, que asume lo mismo).
update pago_venta p
   set cuotas = nullif(substring(v.forma_pago::text from '^cuotas_(\d+)$'), '')::smallint
  from venta v
 where v.id_venta = p.id_venta
   and p.medio = 'tarjeta_credito'
   and p.cuotas is null;

-- ─── Retenciones, a nivel cuenta ─────────────────────────────────────
-- Las retenciones (IVA, Ganancias, IIBB) dependen de la situación fiscal del
-- COMERCIO, no del plan de cuotas: son las mismas para 3 o para 12. Por eso
-- viven en la cuenta y no en el tarifario, que sí varía por plan.

alter table cuenta_destino
  add column if not exists ret_iva_pct       numeric(6,3) not null default 0
    check (ret_iva_pct >= 0 and ret_iva_pct <= 100),
  add column if not exists ret_ganancias_pct numeric(6,3) not null default 0
    check (ret_ganancias_pct >= 0 and ret_ganancias_pct <= 100),
  add column if not exists ret_iibb_pct      numeric(6,3) not null default 0
    check (ret_iibb_pct >= 0 and ret_iibb_pct <= 100),
  add column if not exists imp_deb_cred_pct  numeric(6,3) not null default 0
    check (imp_deb_cred_pct >= 0 and imp_deb_cred_pct <= 100);

comment on column cuenta_destino.imp_deb_cred_pct is
  'Impuesto a los débitos y créditos (ley 25.413). Sólo aplica si la plata '
  'toca una cuenta bancaria: si queda en la billetera virtual, no se devenga. '
  'Default 0 — lo activa el operador si corresponde a su caso.';

-- ─── Tarifario ───────────────────────────────────────────────────────
-- Una fila por combinación (cuenta, medio, plan de cuotas). Los aranceles no
-- se borran: se cierra la vigencia. Saber qué se cobraba cuándo es auditoría,
-- y es lo que permite explicar un neto viejo.

create table if not exists arancel_cobro (
  id_arancel_cobro  uuid primary key default gen_random_uuid(),
  id_tenant         uuid not null references tenant(id_tenant) on delete cascade,
  id_cuenta_destino uuid not null references cuenta_destino(id_cuenta_destino)
                      on delete cascade,

  medio             medio_pago not null,
  -- NULL = comodín: aplica a cualquier plan de ese medio. Una fila con el
  -- plan exacto le gana al comodín (ver sp_calcular_costo_cobro).
  cuotas            smallint check (cuotas is null or cuotas between 1 and 24),

  -- Lo que retiene el procesador.
  arancel_pct       numeric(6,3) not null default 0
                      check (arancel_pct >= 0 and arancel_pct <= 100),
  -- IVA SOBRE EL ARANCEL, no sobre la venta. Es el error más común de esta
  -- feature: 21% de la comisión, no 21% de los $50.000.
  iva_arancel_pct   numeric(6,3) not null default 21
                      check (iva_arancel_pct >= 0 and iva_arancel_pct <= 100),

  -- Vendiste hoy, cobrás en 18 días. Sin esto el neto es un número sin fecha.
  dias_acreditacion smallint not null default 0 check (dias_acreditacion >= 0),

  vigente_desde     date not null default current_date,
  vigente_hasta     date,
  notas             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint arancel_vigencia_coherente check (
    vigente_hasta is null or vigente_hasta >= vigente_desde
  )
);

-- Un solo tarifario VIGENTE por combinación. `coalesce(cuotas, 0)` porque
-- NULL no colisiona consigo mismo en un unique index, y el comodín tiene que
-- ser único igual que los específicos.
create unique index if not exists arancel_cobro_vigente_uk
  on arancel_cobro(id_tenant, id_cuenta_destino, medio, coalesce(cuotas, 0))
  where vigente_hasta is null;

create index if not exists arancel_cobro_lookup_idx
  on arancel_cobro(id_tenant, id_cuenta_destino, medio, vigente_hasta);

create trigger arancel_cobro_touch before update on arancel_cobro
  for each row execute function set_updated_at();

alter table arancel_cobro enable row level security;

create policy arancel_cobro_all_own_tenant on arancel_cobro for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─── Snapshot en el pago ─────────────────────────────────────────────

alter table pago_venta
  add column if not exists costo_cobro        numeric(14,2) not null default 0
    check (costo_cobro >= 0),
  add column if not exists neto_acreditado    numeric(14,2),
  add column if not exists fecha_acreditacion date,
  add column if not exists desglose_costo     jsonb not null default '{}'::jsonb;

comment on column pago_venta.desglose_costo is
  'Snapshot del arancel aplicado. NO recalcular al leer: el tarifario cambia y '
  'un neto histórico recalculado con la tasa de hoy miente. Forma: '
  '{ id_arancel_cobro, arancel_pct, arancel_monto, iva_arancel_pct, '
  'iva_arancel_monto, retenciones: [{concepto, pct, monto}], dias_acreditacion }';

-- Histórico: los pagos ya registrados no tienen tarifario que aplicarles, así
-- que su neto es su bruto. Es lo honesto — inventarles un arancel retroactivo
-- sería peor que dejarlos en cero.
update pago_venta
   set neto_acreditado = monto
 where neto_acreditado is null;

-- "Cuánto me falta acreditar": el índice que va a usar el panel de caja.
create index if not exists pago_venta_acreditacion_idx
  on pago_venta(id_tenant, fecha_acreditacion)
  where fecha_acreditacion is not null;

-- ─── sp_calcular_costo_cobro ─────────────────────────────────────────
-- Devuelve el desglose del costo de UN pago. Si no hay tarifario NO falla:
-- devuelve costo 0 con la marca `sin_tarifario`. Una venta jamás se cae
-- porque falta configurar un arancel — el vendedor no puede hacer nada al
-- respecto en el mostrador, y bloquearlo pierde la venta de verdad para
-- ganar una precisión contable que se puede corregir después.
--
-- Las retenciones se aplican SÓLO si hay tarifario. Si no, cualquier cobro en
-- efectivo contra una caja con retenciones cargadas se llevaría un descuento
-- que no existe. Para retener sobre un medio hay que cargarle su fila, aunque
-- sea con arancel 0.

create or replace function sp_calcular_costo_cobro(
  p_id_cuenta_destino uuid,
  p_medio             medio_pago,
  p_cuotas            smallint,
  p_monto             numeric
) returns jsonb
language plpgsql
stable
as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_ar         arancel_cobro;
  v_cta        cuenta_destino;
  v_arancel    numeric(14,2);
  v_iva        numeric(14,2);
  v_rets       jsonb := '[]'::jsonb;
  v_ret_total  numeric(14,2) := 0;
  v_costo      numeric(14,2);
begin
  if p_monto is null or p_monto <= 0 then
    return jsonb_build_object('sin_tarifario', true, 'costo_total', 0,
                              'neto', coalesce(p_monto, 0), 'dias_acreditacion', 0);
  end if;

  select * into v_ar
    from arancel_cobro
   where id_tenant = v_tenant
     and id_cuenta_destino = p_id_cuenta_destino
     and medio = p_medio
     and vigente_hasta is null
     and vigente_desde <= current_date
     -- `cuotas = p_cuotas` da NULL (no true) cuando p_cuotas es NULL, así que
     -- un pago sin cuotas sólo matchea el comodín. Es lo que se quiere.
     and (cuotas = p_cuotas or cuotas is null)
   order by cuotas nulls last  -- el plan exacto le gana al comodín
   limit 1;

  if v_ar.id_arancel_cobro is null then
    return jsonb_build_object('sin_tarifario', true, 'costo_total', 0,
                              'neto', p_monto, 'dias_acreditacion', 0);
  end if;

  select * into v_cta from cuenta_destino
   where id_cuenta_destino = p_id_cuenta_destino and id_tenant = v_tenant;

  v_arancel := round(p_monto * v_ar.arancel_pct / 100, 2);
  v_iva     := round(v_arancel * v_ar.iva_arancel_pct / 100, 2);

  -- Sólo entran las retenciones con alícuota > 0: una lista con cuatro ceros
  -- es ruido en el detalle de la venta.
  if coalesce(v_cta.ret_iva_pct, 0) > 0 then
    v_rets := v_rets || jsonb_build_object(
      'concepto', 'iva', 'pct', v_cta.ret_iva_pct,
      'monto', round(p_monto * v_cta.ret_iva_pct / 100, 2));
  end if;
  if coalesce(v_cta.ret_ganancias_pct, 0) > 0 then
    v_rets := v_rets || jsonb_build_object(
      'concepto', 'ganancias', 'pct', v_cta.ret_ganancias_pct,
      'monto', round(p_monto * v_cta.ret_ganancias_pct / 100, 2));
  end if;
  if coalesce(v_cta.ret_iibb_pct, 0) > 0 then
    v_rets := v_rets || jsonb_build_object(
      'concepto', 'iibb', 'pct', v_cta.ret_iibb_pct,
      'monto', round(p_monto * v_cta.ret_iibb_pct / 100, 2));
  end if;
  if coalesce(v_cta.imp_deb_cred_pct, 0) > 0 then
    v_rets := v_rets || jsonb_build_object(
      'concepto', 'imp_deb_cred', 'pct', v_cta.imp_deb_cred_pct,
      'monto', round(p_monto * v_cta.imp_deb_cred_pct / 100, 2));
  end if;

  select coalesce(sum((e->>'monto')::numeric), 0) into v_ret_total
    from jsonb_array_elements(v_rets) e;

  v_costo := v_arancel + v_iva + v_ret_total;

  return jsonb_build_object(
    'sin_tarifario',     false,
    'id_arancel_cobro',  v_ar.id_arancel_cobro,
    'arancel_pct',       v_ar.arancel_pct,
    'arancel_monto',     v_arancel,
    'iva_arancel_pct',   v_ar.iva_arancel_pct,
    'iva_arancel_monto', v_iva,
    'retenciones',       v_rets,
    'costo_total',       v_costo,
    'neto',              p_monto - v_costo,
    'dias_acreditacion', v_ar.dias_acreditacion
  );
end $$;

grant execute on function sp_calcular_costo_cobro(uuid, medio_pago, smallint, numeric)
  to authenticated;

-- ─── sp_registrar_venta (+ costo de cobro) ───────────────────────────
-- Idéntica a la de 00047 salvo el bloque de cobranza, que ahora calcula y
-- persiste el snapshot de costo por pago. La FIRMA NO CAMBIA (`cuotas` viaja
-- dentro de cada elemento de `p_pagos`), así que alcanza con `or replace`:
-- agregar un parámetro obligaría a dropear la vieja para no dejar un overload
-- ambiguo, y no hace falta pagar ese precio.

create or replace function sp_registrar_venta(
  p_lineas       jsonb,
  p_forma_pago   forma_pago default 'efectivo',
  p_id_cliente   uuid default null,
  p_id_reserva   uuid default null,
  p_observaciones text default null,
  p_ip           inet default null,
  -- [{ medio, id_cuenta_destino, monto, cuotas?, monto_recibido?, referencia? }, ...]
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
  -- Cobro (00057)
  v_medio      medio_pago;
  v_cuotas     smallint;
  v_cobro      jsonb;
  v_costo_cobro numeric(14, 2);
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

      v_medio := case p_forma_pago::text
                   when 'efectivo' then 'efectivo'::medio_pago
                   when 'transferencia' then 'transferencia'::medio_pago
                   else 'tarjeta_credito'::medio_pago
                 end;
      -- Las cuotas salen de la forma de pago: es el único dato disponible
      -- cuando la UI no detalló la cobranza.
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
      -- Sin cuotas no hay tarifario que resolver, y el pago quedaría con
      -- costo 0 en silencio. Mejor fallar acá que descubrirlo en el reporte.
      if v_medio = 'tarjeta_credito' and v_cuotas is null then
        raise exception 'pago-credito-sin-cuotas' using errcode = '22023';
      end if;
      -- El resto de los medios no tiene plan: un `cuotas` colgado ahí haría
      -- que el lookup del tarifario no matchee nunca.
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

-- ─── Seed del tarifario ──────────────────────────────────────────────
-- Filas en CERO para las cuentas de billetera virtual (el caso Mercado Pago),
-- para que el panel de configuración no arranque vacío y se vea qué hay que
-- cargar.
--
-- Deliberadamente 0%: los aranceles reales dependen del plazo de acreditación
-- elegido, del plan de cuotas y de lo que cada comercio haya negociado.
-- Sembrar un 6,29% "de ejemplo" haría que el neto mostrado parezca calculado
-- cuando en realidad es inventado, y nadie lo revisaría.

insert into arancel_cobro (id_tenant, id_cuenta_destino, medio, cuotas,
                           arancel_pct, iva_arancel_pct, dias_acreditacion, notas)
select c.id_tenant, c.id_cuenta_destino, m.medio, null::smallint,
       0, 21, 0,
       'Cargar con los valores de tu liquidación real. 0% = sin costo aplicado.'
  from cuenta_destino c
 cross join (values ('tarjeta_debito'::medio_pago), ('tarjeta_credito'::medio_pago)) as m(medio)
 where c.tipo = 'billetera_virtual'
   and not exists (
     select 1 from arancel_cobro a
      where a.id_cuenta_destino = c.id_cuenta_destino
        and a.medio = m.medio
        and a.cuotas is null
        and a.vigente_hasta is null
   );

-- ─── DOWN ────────────────────────────────────────────────────────────
--   -- (recrear sp_registrar_venta de 00047 antes de seguir)
--   drop function if exists sp_calcular_costo_cobro(uuid, medio_pago, smallint, numeric);
--   drop index if exists pago_venta_acreditacion_idx;
--   alter table pago_venta
--     drop column if exists desglose_costo,
--     drop column if exists fecha_acreditacion,
--     drop column if exists neto_acreditado,
--     drop column if exists costo_cobro,
--     drop column if exists cuotas;
--   drop table if exists arancel_cobro;
--   alter table cuenta_destino
--     drop column if exists imp_deb_cred_pct,
--     drop column if exists ret_iibb_pct,
--     drop column if exists ret_ganancias_pct,
--     drop column if exists ret_iva_pct;
