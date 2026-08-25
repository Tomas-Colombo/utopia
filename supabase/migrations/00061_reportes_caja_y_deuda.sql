-- 00061_reportes_caja_y_deuda.sql
-- UP: los reportes que faltaban una vez que existen el costo de cobro (00057)
--     y la financiación propia (00059).
--
--     El panel financiero de 00028 mide DEVENGADO: cuánto se vendió, sobre
--     `venta.fecha`. Está bien y no se toca. Pero desde que una venta puede
--     cobrarse en seis meses, "vendí $100.000" y "entraron $100.000" dejaron
--     de ser la misma frase, y el panel sólo sabía decir la primera.
--
--     Se agregan tres lecturas que el devengado NO puede dar:
--
--       rf_reporte_caja        — PERCIBIDO: qué entró en el período, neto de
--                                lo que se lleva el procesador.
--       rf_cuentas_por_cobrar  — STOCK de deuda al día de hoy. No lleva
--                                período: lo que se debe no es un flujo.
--       rf_incobrables_periodo — FLUJO de pérdidas del período, con el costo
--                                que quedó sin cubrir.
--
--     Ninguna reemplaza al devengado. Si sólo mirás caja no sabés si vendés
--     bien; si sólo mirás devengado no sabés si tenés plata.
--
--     DECISIÓN DE NEGOCIO REGISTRADA: al proveedor se le paga SIEMPRE, cobre
--     o no cobre el cliente. Por eso `costo_no_cubierto` es plata que sale del
--     bolsillo sin vuelta, no una estimación — y `excluida_rendicion` no se
--     usa para tapar incobrables.
-- DOWN: al final, comentado.

-- ─── Caja del período (percibido) ────────────────────────────────────
-- Se mide sobre `pago_venta.created_at`: el día que ENTRÓ la plata, no el de
-- la venta. Una cuota cobrada en noviembre es caja de noviembre aunque la
-- venta sea de agosto — ése es el punto de todo esto.
--
-- Se excluyen los pagos de ventas anuladas, igual que `rf_reporte_financiero`.
-- Es una decisión con filo: esa plata SÍ entró, y la devolución al cliente es
-- un movimiento manual que el sistema no modela. Excluirlos asume que la
-- devolución ocurrió. Se elige así para que caja y devengado hablen del mismo
-- conjunto de ventas y sus totales sean comparables.

create or replace function rf_reporte_caja(
  p_desde timestamptz,
  p_hasta timestamptz
) returns table (
  cobrado_total    numeric,
  cobrado_contado  numeric,
  cobrado_cuotas   numeric,
  costo_cobro      numeric,
  neto_acreditado  numeric,
  a_acreditar      numeric,
  cantidad_pagos   bigint
) language sql stable as $$
  select
    coalesce(sum(pv.monto), 0),
    -- Sin cuota asociada = cobro del día de la venta (contado o anticipo).
    coalesce(sum(pv.monto) filter (where pv.id_cuota_financiada is null), 0),
    coalesce(sum(pv.monto) filter (where pv.id_cuota_financiada is not null), 0),
    coalesce(sum(pv.costo_cobro), 0),
    coalesce(sum(pv.monto - pv.costo_cobro), 0),
    -- Lo cobrado que TODAVÍA no está en la cuenta: tarjeta con plazo.
    coalesce(sum(pv.monto - pv.costo_cobro)
             filter (where pv.fecha_acreditacion > current_date), 0),
    count(*)
  from pago_venta pv
  join venta v on v.id_venta = pv.id_venta
 where pv.id_tenant = auth_tenant_id()
   and v.estado_venta = 'registrada'
   and pv.created_at >= p_desde and pv.created_at <= p_hasta;
$$;

grant execute on function rf_reporte_caja(timestamptz, timestamptz) to authenticated;

-- ─── Cuentas por cobrar (stock) ──────────────────────────────────────
-- SIN período a propósito. La deuda es un saldo, no un flujo: preguntar
-- "cuánto me deben en septiembre" no tiene sentido — te deben, y punto. El
-- recorte temporal que sí importa (vencido / vence este mes) sale de
-- `fecha_vencimiento` contra `p_hoy`.
--
-- `p_hoy` entra por parámetro y no se usa `current_date`: el server calcula la
-- fecha una vez por request y la reparte, para que el KPI y el listado no
-- puedan discrepar a caballo de la medianoche.

create or replace function rf_cuentas_por_cobrar(
  p_hoy date
) returns table (
  a_cobrar           numeric,
  vence_este_mes     numeric,
  vencido            numeric,
  cuotas_pendientes  bigint,
  cuotas_vencidas    bigint,
  clientes_con_deuda bigint,
  planes_activos     bigint
) language sql stable as $$
  with abiertas as (
    select cf.id_cliente,
           cf.id_venta,
           cf.fecha_vencimiento,
           cf.monto - cf.monto_pagado as saldo
      from cuota_financiada cf
     where cf.id_tenant = auth_tenant_id()
       and cf.estado in ('pendiente', 'parcial')
  )
  select
    coalesce(sum(saldo), 0),
    coalesce(sum(saldo) filter (
      where fecha_vencimiento >= date_trunc('month', p_hoy)::date
        and fecha_vencimiento <  (date_trunc('month', p_hoy) + interval '1 month')::date
        and fecha_vencimiento >= p_hoy
    ), 0),
    coalesce(sum(saldo) filter (where fecha_vencimiento < p_hoy), 0),
    count(*),
    count(*) filter (where fecha_vencimiento < p_hoy),
    count(distinct id_cliente),
    count(distinct id_venta)
  from abiertas;
$$;

grant execute on function rf_cuentas_por_cobrar(date) to authenticated;

-- ─── Incobrables del período (flujo) ─────────────────────────────────
-- Dos números que NO son el mismo:
--
--   monto_incobrable  — lo que no se cobró. Ya tiene su asiento de gasto
--                       (lo registra `sp_marcar_cuota_incobrable`), así que
--                       cierra contra el ingreso devengado.
--   costo_no_cubierto — cuánta plata hay que poner del bolsillo. NO tiene
--                       asiento y no debe tenerlo: el costo ya está contado
--                       en `costo_mercaderia` del devengado, y registrarlo de
--                       nuevo lo restaría dos veces. Es un KPI de alerta.
--
-- El segundo existe porque al proveedor se le paga siempre. Se calcula por
-- VENTA COMPLETA, no por cuota: las primeras cuotas van cubriendo el costo, y
-- quien pagó 5 de 6 ya cubrió la mercadería y sólo perdió margen.

create or replace function rf_incobrables_periodo(
  p_desde timestamptz,
  p_hasta timestamptz
) returns table (
  monto_incobrable    numeric,
  costo_no_cubierto   numeric,
  cuotas_incobrables  bigint,
  ventas_afectadas    bigint,
  clientes_afectados  bigint
) language sql stable as $$
  with cuotas_periodo as (
    select cf.id_venta,
           cf.id_cliente,
           cf.monto - cf.monto_pagado as saldo
      from cuota_financiada cf
     where cf.id_tenant = auth_tenant_id()
       and cf.estado = 'incobrable'
       and cf.fecha_incobrable >= p_desde
       and cf.fecha_incobrable <= p_hasta
  ),
  ventas as (
    select distinct id_venta from cuotas_periodo
  ),
  -- Costo real de cada venta: lo que se le debe al proveedor si vino en
  -- consignación, lo que salió del bolsillo al comprarla si fue compra.
  costos as (
    select dv.id_venta,
           sum(case when dv.tipo_ingreso_snapshot = 'compra'
                    then dv.costo_snapshot
                    else dv.monto_proveedor end) as costo
      from detalle_venta dv
      join ventas x on x.id_venta = dv.id_venta
     group by dv.id_venta
  ),
  cobros as (
    select pv.id_venta, sum(pv.monto) as cobrado
      from pago_venta pv
      join ventas x on x.id_venta = pv.id_venta
     group by pv.id_venta
  )
  select
    (select coalesce(sum(saldo), 0) from cuotas_periodo),
    (select coalesce(sum(greatest(0, c.costo - coalesce(co.cobrado, 0))), 0)
       from costos c left join cobros co on co.id_venta = c.id_venta),
    (select count(*) from cuotas_periodo),
    (select count(*) from ventas),
    (select count(distinct id_cliente) from cuotas_periodo);
$$;

grant execute on function rf_incobrables_periodo(timestamptz, timestamptz) to authenticated;

-- ─── Alerta: cuotas vencidas ─────────────────────────────────────────
-- Sigue el patrón de `rf_alertas_*` de 00028: devuelve la LISTA, no un
-- contador. El dashboard necesita los nombres y los teléfonos para que la
-- alerta sea accionable — un "3 cuotas vencidas" sin decir de quién obliga a
-- ir a otra pantalla para hacer algo al respecto.
--
-- Una fila por CLIENTE, no por cuota: a la persona se la llama una vez por
-- todo lo que debe, no una vez por cuota.

create or replace function rf_alertas_cuotas_vencidas(
  p_hoy date,
  p_limite integer default 20
) returns table (
  id_cliente        uuid,
  cliente_nombre    text,
  cliente_telefono  text,
  cuotas_vencidas   bigint,
  monto_vencido     numeric,
  vencimiento_mas_viejo date,
  dias_vencido      integer
) language sql stable as $$
  select
    cf.id_cliente,
    c.nombre_completo,
    c.telefono,
    count(*),
    sum(cf.monto - cf.monto_pagado),
    min(cf.fecha_vencimiento),
    (p_hoy - min(cf.fecha_vencimiento))::integer
  from cuota_financiada cf
  join cliente c on c.id_cliente = cf.id_cliente
 where cf.id_tenant = auth_tenant_id()
   and cf.estado in ('pendiente', 'parcial')
   and cf.fecha_vencimiento < p_hoy
 group by cf.id_cliente, c.nombre_completo, c.telefono
 -- El que más debe primero: es el orden en el que conviene llamar.
 order by sum(cf.monto - cf.monto_pagado) desc
 limit greatest(1, p_limite);
$$;

grant execute on function rf_alertas_cuotas_vencidas(date, integer) to authenticated;

-- ─── DOWN ────────────────────────────────────────────────────────────
--   drop function if exists rf_alertas_cuotas_vencidas(date, integer);
--   drop function if exists rf_incobrables_periodo(timestamptz, timestamptz);
--   drop function if exists rf_cuentas_por_cobrar(date);
--   drop function if exists rf_reporte_caja(timestamptz, timestamptz);
