-- 00111_seguridad_revendedoras.sql
-- Slice 10: Seguridad, RLS y funciones para revendedoras (DR-13, C.1, C.7).
--
-- UP:
--   1. rvp_mi_cuenta(): corrige referencia a columna ec.objetivo_desde (en vez de inexistente ec.monto_desde).
--   2. rf_finanzas_posicion(): rechaza con no-permission si auth_revendedora_id() is not null (C.1).
--
-- DOWN:
-- -- drop function if exists rvp_mi_cuenta();
-- -- Restaurar rvp_mi_cuenta a versión 00106:
-- -- create or replace function rvp_mi_cuenta()
-- -- returns table (
-- --   piezas_en_poder            bigint,
-- --   monto_en_poder             numeric,
-- --   total_vendido              numeric,
-- --   comision_liquidada         numeric,
-- --   comision_estimada          numeric,
-- --   total_liquidado            numeric,
-- --   total_pagado               numeric,
-- --   total_adeudado             numeric,
-- --   declaraciones_pendientes   bigint,
-- --   porcentaje_comision_actual numeric,
-- --   proximo_tramo_comision     jsonb
-- -- ) language plpgsql security definer set search_path = public, pg_temp as $$
-- -- declare
-- --   v_tenant         uuid := auth_tenant_id();
-- --   v_revendedora_id uuid := auth_revendedora_id();
-- --   v_piezas_poder   bigint := 0;
-- --   v_monto_poder    numeric := 0;
-- --   v_vendido        numeric := 0;
-- --   v_diferencias    numeric := 0;
-- --   v_comision_liq   numeric := 0;
-- --   v_comision_est   numeric := 0;
-- --   v_liquidado      numeric := 0;
-- --   v_pagado         numeric := 0;
-- --   v_adeudado       numeric := 0;
-- --   v_decs_pend      bigint := 0;
-- --   v_porc_actual    numeric := 0;
-- --   v_id_regla       uuid;
-- --   v_proximo_tramo  jsonb := null;
-- -- begin
-- --   if v_tenant is null then
-- --     raise exception 'no-tenant' using errcode = '42501';
-- --   end if;
-- --   if not exists (
-- --     select 1 from tenant_modulo tm
-- --     join modulo m on m.id_modulo = tm.id_modulo
-- --     where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
-- --   ) then
-- --     raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
-- --   end if;
-- --   if v_revendedora_id is null then
-- --     raise exception 'no-revendedora' using errcode = '42501';
-- --   end if;
-- --   select count(crd.id_item), coalesce(sum(p.precio_venta), 0)
-- --   into v_piezas_poder, v_monto_poder
-- --   from consignacion_revendedora_detalle crd
-- --   join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
-- --   join producto p on p.id_producto = crd.id_producto
-- --   where cr.id_tenant = v_tenant
-- --     and cr.id_revendedora = v_revendedora_id
-- --     and cr.confirmada = true
-- --     and cr.estado = 'abierta'
-- --     and crd.estado_detalle = 'en_poder';
-- --   select
-- --     coalesce(sum(dv.precio_venta), 0),
-- --     coalesce(sum(case when dv.id_liquidacion is null then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2) else 0 end), 0)
-- --   into v_vendido, v_comision_est
-- --   from detalle_venta dv
-- --   join venta v on v.id_venta = dv.id_venta
-- --   where v.id_tenant = v_tenant
-- --     and v.canal = 'revendedora'
-- --     and v.id_revendedora = v_revendedora_id
-- --     and v.estado_venta = 'registrada'
-- --     and not exists (
-- --       select 1 from cambio_venta cv
-- --       where cv.id_detalle_original = dv.id_detalle_venta
-- --         and cv.id_tenant = v.id_tenant
-- --     );
-- --   select coalesce(sum(cv.diferencia), 0) into v_diferencias
-- --   from cambio_venta cv
-- --   join venta v on v.id_venta = cv.id_venta_original
-- --   where cv.id_tenant = v_tenant
-- --     and cv.origen = 'revendedora'
-- --     and v.id_revendedora = v_revendedora_id;
-- --   v_vendido := v_vendido + v_diferencias;
-- --   select coalesce(sum(monto_comision), 0), coalesce(sum(monto_a_cobrar), 0)
-- --   into v_comision_liq, v_liquidado
-- --   from liquidacion_revendedora
-- --   where id_tenant = v_tenant and id_revendedora = v_revendedora_id;
-- --   select coalesce(sum(pr.monto), 0) into v_pagado
-- --   from pago_revendedora pr
-- --   join liquidacion_revendedora lr on lr.id_liquidacion = pr.id_liquidacion
-- --   where lr.id_tenant = v_tenant and lr.id_revendedora = v_revendedora_id;
-- --   v_adeudado := greatest(0, v_vendido - v_comision_liq - v_pagado);
-- --   select count(*) into v_decs_pend
-- --   from declaracion_venta_revendedora
-- --   where id_tenant = v_tenant and id_revendedora = v_revendedora_id and estado = 'pendiente';
-- --   select rc.porcentaje, rc.id_regla
-- --   into v_porc_actual, v_id_regla
-- --   from fn_resolver_comision(v_revendedora_id, current_date, v_vendido, 'revendedora') rc;
-- --   if v_id_regla is not null then
-- --     select jsonb_build_object(
-- --       'tramo_actual', v_porc_actual,
-- --       'proximo_porcentaje', ec.porcentaje,
-- --       'monto_desde', ec.monto_desde,
-- --       'monto_hasta', ec.monto_hasta,
-- --       'falta', greatest(0, ec.monto_desde - v_vendido)
-- --     ) into v_proximo_tramo
-- --     from escala_comision ec
-- --     where ec.id_regla = v_id_regla and ec.monto_desde > v_vendido
-- --     order by ec.monto_desde asc limit 1;
-- --   end if;
-- --   return query select
-- --     v_piezas_poder, v_monto_poder, v_vendido, v_comision_liq, v_comision_est,
-- --     v_liquidado, v_pagado, v_adeudado, v_decs_pend, coalesce(v_porc_actual, 0::numeric), v_proximo_tramo;
-- -- end;
-- -- $$;
-- --
-- -- Restaurar rf_finanzas_posicion a versión 00095:
-- -- create or replace function rf_finanzas_posicion()
-- -- returns table (
-- --   capital_propio numeric,
-- --   mercaderia_terceros numeric,
-- --   devueltos_clientes numeric,
-- --   valor_venta_potencial numeric,
-- --   productos_sin_precio bigint,
-- --   por_cobrar jsonb,
-- --   deuda_proveedores numeric
-- -- ) language plpgsql security invoker as $$
-- -- declare
-- --   v_tenant_id uuid;
-- --   v_capital_propio numeric := 0;
-- --   v_mercaderia_terceros numeric := 0;
-- --   v_devueltos_clientes numeric := 0;
-- --   v_valor_venta_potencial numeric := 0;
-- --   v_productos_sin_precio bigint := 0;
-- --   v_deuda_proveedores numeric := 0;
-- --   v_por_cobrar jsonb;
-- --   v_zona text;
-- -- begin
-- --   v_tenant_id := auth_tenant_id();
-- --   select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;
-- --   select coalesce(sum(costo_ingreso), 0) into v_capital_propio
-- --   from item_producto where id_tenant = v_tenant_id and tipo_ingreso = 'compra' and estado_item in ('disponible', 'reservado', 'en_revendedora');
-- --   select coalesce(sum(costo_ingreso), 0) into v_mercaderia_terceros
-- --   from item_producto where id_tenant = v_tenant_id and tipo_ingreso = 'consignacion' and estado_item in ('disponible', 'reservado', 'en_revendedora');
-- --   select coalesce(sum(costo_ingreso), 0) into v_devueltos_clientes
-- --   from item_producto where id_tenant = v_tenant_id and estado_item = 'devuelto_cliente';
-- --   select coalesce(sum(p.precio_venta), 0) into v_valor_venta_potencial
-- --   from item_producto ip join producto p on p.id_producto = ip.id_producto
-- --   where ip.id_tenant = v_tenant_id and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');
-- --   select count(*) into v_productos_sin_precio from producto where id_tenant = v_tenant_id and precio_venta = 0 and activo = true;
-- --   declare
-- --     v_a_cobrar numeric := 0;
-- --     v_vence_este_mes numeric := 0;
-- --     v_vencido numeric := 0;
-- --     v_cuotas_vencidas bigint := 0;
-- --     v_clientes_con_deuda bigint := 0;
-- --     v_hoy date;
-- --     v_vendido_rev numeric := 0;
-- --     v_comision_liq_rev numeric := 0;
-- --     v_pagado_rev numeric := 0;
-- --     v_deuda_rev numeric := 0;
-- --   begin
-- --     v_hoy := (now() at time zone v_zona)::date;
-- --     select coalesce(sum(monto - monto_pagado), 0) into v_a_cobrar from cuota_financiada where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial');
-- --     select coalesce(sum(monto - monto_pagado), 0) into v_vence_este_mes from cuota_financiada where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial') and date_trunc('month', (fecha_vencimiento at time zone v_zona)::timestamp)::date = date_trunc('month', v_hoy::timestamp)::date;
-- --     select coalesce(sum(monto - monto_pagado), 0) into v_vencido from cuota_financiada where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial') and (fecha_vencimiento at time zone v_zona)::date < v_hoy;
-- --     select count(*) into v_cuotas_vencidas from cuota_financiada where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial') and (fecha_vencimiento at time zone v_zona)::date < v_hoy;
-- --     select count(distinct v.id_cliente) into v_clientes_con_deuda from cuota_financiada cf join venta v on v.id_venta = cf.id_venta where cf.id_tenant = v_tenant_id and cf.estado in ('pendiente', 'parcial') and v.id_cliente is not null;
-- --     if exists (select 1 from tenant_modulo tm join modulo m on m.id_modulo = tm.id_modulo where tm.id_tenant = v_tenant_id and m.codigo = 'revendedoras' and tm.habilitado = true) then
-- --       select coalesce(sum(dv.precio_venta), 0) into v_vendido_rev from detalle_venta dv join venta v on v.id_venta = dv.id_venta where v.id_tenant = v_tenant_id and v.canal = 'revendedora' and v.estado_venta = 'registrada';
-- --       select coalesce(sum(monto_comision), 0) into v_comision_liq_rev from liquidacion_revendedora where id_tenant = v_tenant_id;
-- --       select coalesce(sum(monto), 0) into v_pagado_rev from pago_revendedora where id_tenant = v_tenant_id;
-- --       v_deuda_rev := greatest(0, v_vendido_rev - v_comision_liq_rev - v_pagado_rev);
-- --       v_a_cobrar := v_a_cobrar + v_deuda_rev;
-- --     end if;
-- --     v_por_cobrar := jsonb_build_object('a_cobrar', v_a_cobrar, 'vence_este_mes', v_vence_este_mes, 'vencido', v_vencido, 'cuotas_vencidas', v_cuotas_vencidas, 'clientes_con_deuda', v_clientes_con_deuda);
-- --   end;
-- --   select coalesce(sum(d.costo_unitario), 0) into v_deuda_proveedores from item_producto ip join ingreso_mercaderia_detalle d on d.id_ingreso = ip.id_ingreso and d.id_producto = ip.id_producto where ip.id_tenant = v_tenant_id and ip.tipo_ingreso = 'consignacion' and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');
-- --   return query select v_capital_propio, v_mercaderia_terceros, v_devueltos_clientes, v_valor_venta_potencial, v_productos_sin_precio, v_por_cobrar, v_deuda_proveedores;
-- -- end;
-- -- $$;

-- 1. rvp_mi_cuenta() con referencia correcta a ec.objetivo_desde
create or replace function rvp_mi_cuenta()
returns table (
  piezas_en_poder            bigint,
  monto_en_poder             numeric,
  total_vendido              numeric,
  comision_liquidada         numeric,
  comision_estimada          numeric,
  total_liquidado            numeric,
  total_pagado               numeric,
  total_adeudado             numeric,
  declaraciones_pendientes   bigint,
  porcentaje_comision_actual numeric,
  proximo_tramo_comision     jsonb
) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant         uuid := auth_tenant_id();
  v_revendedora_id uuid := auth_revendedora_id();

  v_piezas_poder   bigint := 0;
  v_monto_poder    numeric := 0;
  v_vendido        numeric := 0;
  v_diferencias    numeric := 0;
  v_comision_liq   numeric := 0;
  v_comision_est   numeric := 0;
  v_liquidado      numeric := 0;
  v_pagado         numeric := 0;
  v_adeudado       numeric := 0;
  v_decs_pend      bigint := 0;

  v_porc_actual    numeric := 0;
  v_id_regla       uuid;
  v_proximo_tramo  jsonb := null;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  if v_revendedora_id is null then
    raise exception 'no-revendedora' using errcode = '42501';
  end if;

  -- 1. Mercadería en poder (mismo cómputo que rf_cuenta_corriente_revendedora)
  select
    count(crd.id_item),
    coalesce(sum(p.precio_venta), 0)
  into v_piezas_poder, v_monto_poder
  from consignacion_revendedora_detalle crd
  join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
  join producto p on p.id_producto = crd.id_producto
  where cr.id_tenant = v_tenant
    and cr.id_revendedora = v_revendedora_id
    and cr.confirmada = true
    and cr.estado = 'abierta'
    and crd.estado_detalle = 'en_poder';

  -- 2. Vendido canal revendedora (registradas, no cambiadas)
  select
    coalesce(sum(dv.precio_venta), 0),
    coalesce(sum(case when dv.id_liquidacion is null then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2) else 0 end), 0)
  into v_vendido, v_comision_est
  from detalle_venta dv
  join venta v on v.id_venta = dv.id_venta
  where v.id_tenant = v_tenant
    and v.canal = 'revendedora'
    and v.id_revendedora = v_revendedora_id
    and v.estado_venta = 'registrada'
    and not exists (
      select 1 from cambio_venta cv
      where cv.id_detalle_original = dv.id_detalle_venta
        and cv.id_tenant = v.id_tenant
    );

  -- Sumar diferencias de precio de cambios (DR-5: entran al vendido de la revendedora)
  select coalesce(sum(cv.diferencia), 0) into v_diferencias
  from cambio_venta cv
  join venta v on v.id_venta = cv.id_venta_original
  where cv.id_tenant = v_tenant
    and cv.origen = 'revendedora'
    and v.id_revendedora = v_revendedora_id;

  v_vendido := v_vendido + v_diferencias;

  -- 3. Liquidaciones
  select
    coalesce(sum(monto_comision), 0),
    coalesce(sum(monto_a_cobrar), 0)
  into v_comision_liq, v_liquidado
  from liquidacion_revendedora
  where id_tenant = v_tenant
    and id_revendedora = v_revendedora_id;

  -- 4. Pagos
  select
    coalesce(sum(pr.monto), 0)
  into v_pagado
  from pago_revendedora pr
  join liquidacion_revendedora lr on lr.id_liquidacion = pr.id_liquidacion
  where lr.id_tenant = v_tenant
    and lr.id_revendedora = v_revendedora_id;

  -- 5. Adeudado
  v_adeudado := greatest(0, v_vendido - v_comision_liq - v_pagado);

  -- 6. Declaraciones pendientes
  select count(*) into v_decs_pend
  from declaracion_venta_revendedora
  where id_tenant = v_tenant
    and id_revendedora = v_revendedora_id
    and estado = 'pendiente';

  -- 7. Comisión actual y tramos (consulta exclusiva de la regla aplicable a esta revendedora)
  select rc.porcentaje, rc.id_regla
  into v_porc_actual, v_id_regla
  from fn_resolver_comision(v_revendedora_id, current_date, v_vendido, 'revendedora') rc;

  if v_id_regla is not null then
    select jsonb_build_object(
      'tramo_actual', v_porc_actual,
      'proximo_porcentaje', ec.porcentaje,
      'objetivo_desde', ec.objetivo_desde,
      'falta', greatest(0, ec.objetivo_desde - v_vendido)
    ) into v_proximo_tramo
    from escala_comision ec
    where ec.id_tenant = v_tenant
      and ec.id_regla = v_id_regla
      and ec.objetivo_desde > v_vendido
    order by ec.objetivo_desde asc
    limit 1;
  end if;

  return query select
    v_piezas_poder,
    v_monto_poder,
    v_vendido,
    v_comision_liq,
    v_comision_est,
    v_liquidado,
    v_pagado,
    v_adeudado,
    v_decs_pend,
    coalesce(v_porc_actual, 0::numeric),
    v_proximo_tramo;
end;
$$;

revoke all on function rvp_mi_cuenta() from public;
grant execute on function rvp_mi_cuenta() to authenticated;

-- 2. rf_finanzas_posicion() con validación de revendedora (C.1)
create or replace function rf_finanzas_posicion()
returns table (
  capital_propio numeric,
  mercaderia_terceros numeric,
  devueltos_clientes numeric,
  valor_venta_potencial numeric,
  productos_sin_precio bigint,
  por_cobrar jsonb,
  deuda_proveedores numeric
)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid;
  v_capital_propio numeric := 0;
  v_mercaderia_terceros numeric := 0;
  v_devueltos_clientes numeric := 0;
  v_valor_venta_potencial numeric := 0;
  v_productos_sin_precio bigint := 0;
  v_deuda_proveedores numeric := 0;
  v_por_cobrar jsonb;
  v_zona text;
begin
  v_tenant_id := auth_tenant_id();

  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;

  select
    coalesce(sum(costo_ingreso), 0) into v_capital_propio
  from item_producto
  where id_tenant = v_tenant_id and tipo_ingreso = 'compra' and estado_item in ('disponible', 'reservado', 'en_revendedora');

  select
    coalesce(sum(costo_ingreso), 0) into v_mercaderia_terceros
  from item_producto
  where id_tenant = v_tenant_id and tipo_ingreso = 'consignacion' and estado_item in ('disponible', 'reservado', 'en_revendedora');

  select
    coalesce(sum(costo_ingreso), 0) into v_devueltos_clientes
  from item_producto
  where id_tenant = v_tenant_id and estado_item = 'devuelto_cliente';

  select
    coalesce(sum(p.precio_venta), 0) into v_valor_venta_potencial
  from item_producto ip
  join producto p on p.id_producto = ip.id_producto
  where ip.id_tenant = v_tenant_id and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');

  select
    count(*) into v_productos_sin_precio
  from producto
  where id_tenant = v_tenant_id and precio_venta = 0 and activo = true;

  -- por_cobrar: (a cobrar, vence este mes, vencido, cuotas vencidas, clientes con deuda)
  declare
    v_a_cobrar numeric := 0;
    v_vence_este_mes numeric := 0;
    v_vencido numeric := 0;
    v_cuotas_vencidas bigint := 0;
    v_clientes_con_deuda bigint := 0;
    v_hoy date;
    v_vendido_rev numeric := 0;
    v_comision_liq_rev numeric := 0;
    v_pagado_rev numeric := 0;
    v_deuda_rev numeric := 0;
  begin
    v_hoy := (now() at time zone v_zona)::date;

    select
      coalesce(sum(monto - monto_pagado), 0) into v_a_cobrar
    from cuota_financiada
    where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial');

    select
      coalesce(sum(monto - monto_pagado), 0) into v_vence_este_mes
    from cuota_financiada
    where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
      and date_trunc('month', (fecha_vencimiento at time zone v_zona)::timestamp)::date = date_trunc('month', v_hoy::timestamp)::date;

    select
      coalesce(sum(monto - monto_pagado), 0) into v_vencido
    from cuota_financiada
    where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
      and (fecha_vencimiento at time zone v_zona)::date < v_hoy;

    select
      count(*) into v_cuotas_vencidas
    from cuota_financiada
    where id_tenant = v_tenant_id and estado in ('pendiente', 'parcial')
      and (fecha_vencimiento at time zone v_zona)::date < v_hoy;

    select
      count(distinct v.id_cliente) into v_clientes_con_deuda
    from cuota_financiada cf
    join venta v on v.id_venta = cf.id_venta
    where cf.id_tenant = v_tenant_id and cf.estado in ('pendiente', 'parcial') and v.id_cliente is not null;

    -- Deuda adeudada por revendedoras: total_vendido - comisiones_liquidadas - total_pagado
    if exists (
      select 1 from tenant_modulo tm
      join modulo m on m.id_modulo = tm.id_modulo
      where tm.id_tenant = v_tenant_id and m.codigo = 'revendedoras' and tm.habilitado = true
    ) then
      select coalesce(sum(dv.precio_venta), 0) into v_vendido_rev
      from detalle_venta dv
      join venta v on v.id_venta = dv.id_venta
      where v.id_tenant = v_tenant_id
        and v.canal = 'revendedora'
        and v.estado_venta = 'registrada';

      select coalesce(sum(monto_comision), 0) into v_comision_liq_rev
      from liquidacion_revendedora
      where id_tenant = v_tenant_id;

      select coalesce(sum(monto), 0) into v_pagado_rev
      from pago_revendedora
      where id_tenant = v_tenant_id;

      v_deuda_rev := greatest(0, v_vendido_rev - v_comision_liq_rev - v_pagado_rev);
      v_a_cobrar := v_a_cobrar + v_deuda_rev;
    end if;

    v_por_cobrar := jsonb_build_object(
      'a_cobrar', v_a_cobrar,
      'vence_este_mes', v_vence_este_mes,
      'vencido', v_vencido,
      'cuotas_vencidas', v_cuotas_vencidas,
      'clientes_con_deuda', v_clientes_con_deuda
    );
  end;

  select
    coalesce(sum(d.costo_unitario), 0) into v_deuda_proveedores
  from item_producto ip
  join ingreso_mercaderia_detalle d on d.id_ingreso = ip.id_ingreso and d.id_producto = ip.id_producto
  where ip.id_tenant = v_tenant_id and ip.tipo_ingreso = 'consignacion' and ip.estado_item in ('disponible', 'reservado', 'en_revendedora');

  return query select
    v_capital_propio,
    v_mercaderia_terceros,
    v_devueltos_clientes,
    v_valor_venta_potencial,
    v_productos_sin_precio,
    v_por_cobrar,
    v_deuda_proveedores;
end;
$$;

grant execute on function rf_finanzas_posicion() to authenticated;
