-- 00102_reportes_revendedoras.sql
-- Slice 9: Reportes de Revendedoras (REQ-RV-DB-08)
-- Funciones INVOKER: rf_perfil_revendedora, rf_cumplimiento_objetivos, rf_resumen_canal.
--
-- DOWN:
-- drop function if exists rf_resumen_canal(date, date);
-- drop function if exists rf_cumplimiento_objetivos(date, date, uuid);
-- drop function if exists rf_perfil_revendedora(date, date, uuid, integer, integer);

-- ─── 1. rf_perfil_revendedora (INVOKER) ─────────────────────────────────

create or replace function rf_perfil_revendedora(
  p_desde          date default null,
  p_hasta          date default null,
  p_id_revendedora uuid default null,
  p_limit          integer default 50,
  p_offset         integer default 0
) returns table (
  id_revendedora uuid, nombre text, apellido text, total_vendido numeric,
  cantidad_ventas bigint, ticket_promedio numeric, comision_liquidada numeric,
  comision_estimada numeric, adeudado numeric, items_entregados bigint,
  items_vendidos bigint, rotacion numeric
) language plpgsql stable security invoker as $$
declare
  v_tenant       uuid := auth_tenant_id();
  v_desde        date;
  v_hasta        date;
  v_rango        tstzrange;
  v_limit        integer;
  v_offset       integer;
  v_hoy          date;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;
  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  v_hoy := fn_hoy_tenant();
  v_desde := coalesce(p_desde, date_trunc('month', v_hoy)::date);
  v_hasta := coalesce(p_hasta, (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date);
  v_rango := fn_rango_tenant(v_desde, v_hasta);
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with entregados as (
    select
      cr.id_revendedora,
      count(crd.id_item)::bigint as cant_entregados
    from consignacion_revendedora_detalle crd
    join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
    where cr.id_tenant = v_tenant
      and cr.confirmada = true
      and (p_id_revendedora is null or cr.id_revendedora = p_id_revendedora)
    group by cr.id_revendedora
  ),
  ventas_periodo as (
    select
      v.id_revendedora,
      coalesce(sum(dv.precio_venta), 0)::numeric + coalesce((
        select sum(cv.diferencia)
        from cambio_venta cv
        join venta vc on vc.id_venta = cv.id_venta_original
        where cv.id_tenant = v_tenant
          and cv.origen = 'revendedora'
          and vc.id_revendedora = v.id_revendedora
          and (cv.created_at <@ v_rango)
      ), 0)::numeric as vendido,
      count(distinct v.id_venta)::bigint as cant_ventas,
      count(dv.id_detalle_venta)::bigint as cant_items_vendidos,
      coalesce(sum(case when dv.id_liquidacion is not null then dv.monto_comision else 0 end), 0)::numeric as com_liq,
      coalesce(sum(case when dv.id_liquidacion is null and dv.excluida_liquidacion = false
        then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2)
        else 0 end), 0)::numeric as com_est
    from detalle_venta dv
    join venta v on v.id_venta = dv.id_venta
    left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
    where v.id_tenant = v_tenant
      and v.canal = 'revendedora'
      and v.estado_venta = 'registrada'
      and dev.id_devolucion is null
      and not exists (
        select 1 from cambio_venta cv
        where cv.id_detalle_original = dv.id_detalle_venta
          and cv.id_tenant = v_tenant
      )
      and v.fecha <@ v_rango
      and (p_id_revendedora is null or v.id_revendedora = p_id_revendedora)
    group by v.id_revendedora
  ),
  historico_ventas as (
    select
      v.id_revendedora,
      coalesce(sum(dv.precio_venta), 0)::numeric + coalesce((
        select sum(cv.diferencia)
        from cambio_venta cv
        join venta vc on vc.id_venta = cv.id_venta_original
        where cv.id_tenant = v_tenant
          and cv.origen = 'revendedora'
          and vc.id_revendedora = v.id_revendedora
      ), 0)::numeric as vendido_hist
    from detalle_venta dv
    join venta v on v.id_venta = dv.id_venta
    where v.id_tenant = v_tenant
      and v.canal = 'revendedora'
      and v.estado_venta = 'registrada'
      and not exists (
        select 1 from cambio_venta cv
        where cv.id_detalle_original = dv.id_detalle_venta
          and cv.id_tenant = v_tenant
      )
      and (p_id_revendedora is null or v.id_revendedora = p_id_revendedora)
    group by v.id_revendedora
  ),
  historico_comisiones as (
    select
      lr.id_revendedora,
      coalesce(sum(lr.monto_comision), 0)::numeric as com_hist
    from liquidacion_revendedora lr
    where lr.id_tenant = v_tenant
      and (p_id_revendedora is null or lr.id_revendedora = p_id_revendedora)
    group by lr.id_revendedora
  ),
  historico_pagos as (
    select
      lr.id_revendedora,
      coalesce(sum(pr.monto), 0)::numeric as pagos_hist
    from pago_revendedora pr
    join liquidacion_revendedora lr on lr.id_liquidacion = pr.id_liquidacion
    where lr.id_tenant = v_tenant
      and (p_id_revendedora is null or lr.id_revendedora = p_id_revendedora)
    group by lr.id_revendedora
  )
  select
    r.id_revendedora,
    r.nombre,
    r.apellido,
    coalesce(vp.vendido, 0)::numeric as total_vendido,
    coalesce(vp.cant_ventas, 0)::bigint as cantidad_ventas,
    case
      when coalesce(vp.cant_ventas, 0) > 0 then round((coalesce(vp.vendido, 0) / vp.cant_ventas), 2)
      else 0::numeric
    end as ticket_promedio,
    coalesce(vp.com_liq, 0)::numeric as comision_liquidada,
    coalesce(vp.com_est, 0)::numeric as comision_estimada,
    greatest(0, coalesce(hv.vendido_hist, 0) - coalesce(hc.com_hist, 0) - coalesce(hp.pagos_hist, 0))::numeric as adeudado,
    coalesce(e.cant_entregados, 0)::bigint as items_entregados,
    coalesce(vp.cant_items_vendidos, 0)::bigint as items_vendidos,
    case
      when coalesce(e.cant_entregados, 0) > 0
        then round((coalesce(vp.cant_items_vendidos, 0) * 100.0 / e.cant_entregados), 2)
      else 0::numeric
    end as rotacion
  from revendedora r
  left join entregados e on e.id_revendedora = r.id_revendedora
  left join ventas_periodo vp on vp.id_revendedora = r.id_revendedora
  left join historico_ventas hv on hv.id_revendedora = r.id_revendedora
  left join historico_comisiones hc on hc.id_revendedora = r.id_revendedora
  left join historico_pagos hp on hp.id_revendedora = r.id_revendedora
  where r.id_tenant = v_tenant
    and (p_id_revendedora is null or r.id_revendedora = p_id_revendedora)
  order by r.apellido asc, r.nombre asc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function rf_perfil_revendedora(date, date, uuid, integer, integer) to authenticated;

-- ─── 2. rf_cumplimiento_objetivos (INVOKER) ─────────────────────────────

create or replace function rf_cumplimiento_objetivos(
  p_desde          date default null,
  p_hasta          date default null,
  p_id_revendedora uuid default null
) returns table (
  id_revendedora uuid, nombre text, apellido text, vendido_periodo numeric,
  id_regla uuid, tramo_actual_desde numeric, porcentaje_actual numeric,
  proximo_tramo_desde numeric, proximo_porcentaje numeric, falta_para_proximo numeric
) language plpgsql stable security invoker as $$
declare
  v_tenant       uuid := auth_tenant_id();
  v_desde        date;
  v_hasta        date;
  v_rango        tstzrange;
  v_hoy          date;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;
  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  v_hoy := fn_hoy_tenant();
  v_desde := coalesce(p_desde, date_trunc('month', v_hoy)::date);
  v_hasta := coalesce(p_hasta, (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date);
  v_rango := fn_rango_tenant(v_desde, v_hasta);

  return query
  with ventas_base as (
    select
      r.id_revendedora,
      r.nombre,
      r.apellido,
      coalesce((
        select coalesce(sum(dv.precio_venta), 0)::numeric + coalesce((
          select sum(cv.diferencia)
          from cambio_venta cv
          join venta vc on vc.id_venta = cv.id_venta_original
          where cv.id_tenant = v_tenant
            and cv.origen = 'revendedora'
            and vc.id_revendedora = r.id_revendedora
            and (cv.created_at <@ v_rango)
        ), 0)::numeric
        from detalle_venta dv
        join venta v on v.id_venta = dv.id_venta
        left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
        where v.id_tenant = v_tenant
          and v.canal = 'revendedora'
          and v.id_revendedora = r.id_revendedora
          and v.estado_venta = 'registrada'
          and dev.id_devolucion is null
          and not exists (
            select 1 from cambio_venta cv
            where cv.id_detalle_original = dv.id_detalle_venta
              and cv.id_tenant = v_tenant
          )
          and v.fecha <@ v_rango
      ), 0)::numeric as vendido
    from revendedora r
    where r.id_tenant = v_tenant
      and (p_id_revendedora is null or r.id_revendedora = p_id_revendedora)
  ),
  reglas_activas as (
    select
      vb.*,
      reg.id_regla
    from ventas_base vb
    left join lateral (
      select rc.id_regla
      from regla_comision rc
      where rc.id_tenant = v_tenant
        and rc.activo = true
        and rc.ambito = 'revendedora'
        and rc.vigente_desde <= v_hasta
        and (rc.vigente_hasta is null or rc.vigente_hasta >= v_desde)
        and (rc.id_revendedora = vb.id_revendedora or rc.id_revendedora is null)
      order by (rc.id_revendedora is not null) desc, rc.vigente_desde desc
      limit 1
    ) reg on true
  )
  select
    ra.id_revendedora,
    ra.nombre,
    ra.apellido,
    ra.vendido as vendido_periodo,
    ra.id_regla,
    coalesce(tact.objetivo_desde, 0)::numeric as tramo_actual_desde,
    coalesce(tact.porcentaje, 0)::numeric as porcentaje_actual,
    tprox.objetivo_desde::numeric as proximo_tramo_desde,
    tprox.porcentaje::numeric as proximo_porcentaje,
    case
      when tprox.objetivo_desde is not null
        then greatest(0, tprox.objetivo_desde - ra.vendido)::numeric
      else null::numeric
    end as falta_para_proximo
  from reglas_activas ra
  left join lateral (
    select ec.objetivo_desde, ec.porcentaje
    from escala_comision ec
    where ec.id_regla = ra.id_regla
      and ec.id_tenant = v_tenant
      and ec.objetivo_desde <= ra.vendido
    order by ec.objetivo_desde desc
    limit 1
  ) tact on true
  left join lateral (
    select ec.objetivo_desde, ec.porcentaje
    from escala_comision ec
    where ec.id_regla = ra.id_regla
      and ec.id_tenant = v_tenant
      and ec.objetivo_desde > ra.vendido
    order by ec.objetivo_desde asc
    limit 1
  ) tprox on true
  order by ra.apellido asc, ra.nombre asc;
end;
$$;

grant execute on function rf_cumplimiento_objetivos(date, date, uuid) to authenticated;

-- ─── 3. rf_resumen_canal (INVOKER) ──────────────────────────────────────

create or replace function rf_resumen_canal(
  p_desde date default null,
  p_hasta date default null
) returns table (
  ventas_local_monto numeric, ventas_local_cant bigint,
  ventas_revendedora_monto numeric, ventas_revendedora_cant bigint,
  comision_revendedora_monto numeric, stock_central_cant bigint,
  stock_central_valor numeric, stock_revendedoras_cant bigint,
  stock_revendedoras_valor numeric
) language plpgsql stable security invoker as $$
declare
  v_tenant       uuid := auth_tenant_id();
  v_desde        date;
  v_hasta        date;
  v_rango        tstzrange;
  v_hoy          date;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;
  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
  end if;

  v_hoy := fn_hoy_tenant();
  v_desde := coalesce(p_desde, date_trunc('month', v_hoy)::date);
  v_hasta := coalesce(p_hasta, (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date);
  v_rango := fn_rango_tenant(v_desde, v_hasta);

  return query
  with v_local as (
    select
      coalesce(sum(dv.precio_venta), 0)::numeric + coalesce((
        select sum(cv.diferencia)
        from cambio_venta cv
        where cv.id_tenant = v_tenant
          and cv.origen = 'local'
          and (cv.created_at <@ v_rango)
      ), 0)::numeric as monto,
      count(distinct v.id_venta)::bigint as cant
    from detalle_venta dv
    join venta v on v.id_venta = dv.id_venta
    left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
    where v.id_tenant = v_tenant
      and v.canal = 'local'
      and v.estado_venta = 'registrada'
      and dev.id_devolucion is null
      and not exists (
        select 1 from cambio_venta cv
        where cv.id_detalle_original = dv.id_detalle_venta
          and cv.id_tenant = v_tenant
      )
      and v.fecha <@ v_rango
  ),
  v_rev as (
    select
      coalesce(sum(dv.precio_venta), 0)::numeric + coalesce((
        select sum(cv.diferencia)
        from cambio_venta cv
        where cv.id_tenant = v_tenant
          and cv.origen = 'revendedora'
          and (cv.created_at <@ v_rango)
      ), 0)::numeric as monto,
      count(distinct v.id_venta)::bigint as cant,
      coalesce(sum(case
        when dv.id_liquidacion is not null then dv.monto_comision
        when dv.excluida_liquidacion = false
          then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2)
        else 0
      end), 0)::numeric as comision_total
    from detalle_venta dv
    join venta v on v.id_venta = dv.id_venta
    left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
    where v.id_tenant = v_tenant
      and v.canal = 'revendedora'
      and v.estado_venta = 'registrada'
      and dev.id_devolucion is null
      and not exists (
        select 1 from cambio_venta cv
        where cv.id_detalle_original = dv.id_detalle_venta
          and cv.id_tenant = v_tenant
      )
      and v.fecha <@ v_rango
  ),
  stock as (
    select
      coalesce(count(*) filter (where ip.estado_item = 'disponible'), 0)::bigint as stock_cent_cant,
      coalesce(sum(p.precio_venta) filter (where ip.estado_item = 'disponible'), 0)::numeric as stock_cent_val,
      coalesce(count(*) filter (where ip.estado_item = 'en_revendedora'), 0)::bigint as stock_rev_cant,
      coalesce(sum(p.precio_venta) filter (where ip.estado_item = 'en_revendedora'), 0)::numeric as stock_rev_val
    from item_producto ip
    join producto p on p.id_producto = ip.id_producto
    where ip.id_tenant = v_tenant
  )
  select
    vl.monto as ventas_local_monto,
    vl.cant as ventas_local_cant,
    vr.monto as ventas_revendedora_monto,
    vr.cant as ventas_revendedora_cant,
    vr.comision_total as comision_revendedora_monto,
    s.stock_cent_cant as stock_central_cant,
    s.stock_cent_val as stock_central_valor,
    s.stock_rev_cant as stock_revendedoras_cant,
    s.stock_rev_val as stock_revendedoras_valor
  from v_local vl
  cross join v_rev vr
  cross join stock s;
end;
$$;

grant execute on function rf_resumen_canal(date, date) to authenticated;
