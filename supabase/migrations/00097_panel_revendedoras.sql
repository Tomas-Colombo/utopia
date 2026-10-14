-- 00097_panel_revendedoras.sql
-- Slice 4b: Panel de gestión del local (REQ-RV-ADM)
-- Funciones de lectura INVOKER: rf_panel_revendedoras, rf_totales_panel_revendedoras, rf_quien_tiene_item.
-- Actualización de sp_crear_revendedora para validar email-duplicado.

-- DOWN:
-- drop function if exists rf_quien_tiene_item(text);
-- drop function if exists rf_totales_panel_revendedoras();
-- drop function if exists rf_panel_revendedoras(date, date, boolean, text, text, text, integer, integer, integer);
-- create or replace function sp_crear_revendedora(
--   p_nombre text,
--   p_apellido text,
--   p_telefono text default null,
--   p_email text default null,
--   p_notas text default null,
--   p_ip inet default null
-- ) returns uuid language plpgsql as $$
-- declare
--   v_tenant uuid := auth_tenant_id();
--   v_actor  uuid := auth.uid();
--   v_id     uuid;
-- begin
--   if v_tenant is null then
--     raise exception 'no-tenant' using errcode = '42501';
--   end if;
--   if not exists (
--     select 1 from tenant_modulo tm
--     join modulo m on m.id_modulo = tm.id_modulo
--     where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
--   ) then
--     raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
--   end if;
--   insert into revendedora (id_tenant, nombre, apellido, telefono, email, notas, activo, fecha_alta)
--   values (v_tenant, p_nombre, p_apellido, p_telefono, p_email, p_notas, true, current_date)
--   returning id_revendedora into v_id;
--   insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
--   values (v_tenant, v_actor, 'revendedora', v_id::text, 'crear',
--           jsonb_build_object('nombre', p_nombre, 'apellido', p_apellido, 'email', p_email, 'telefono', p_telefono), p_ip);
--   return v_id;
-- end $$;

-- ─── 1. rf_totales_panel_revendedoras (INVOKER) ─────────────────────────

create or replace function rf_totales_panel_revendedoras()
returns table (
  kpi_en_poder                       bigint,
  kpi_en_local                       bigint,
  kpi_adeudado_total                 numeric,
  kpi_liquidaciones_pendientes_monto numeric,
  kpi_liquidaciones_pendientes_cant  bigint
)
language plpgsql
stable
security invoker
as $$
declare
  v_tenant uuid := auth_tenant_id();
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

  return query
  with kpi_items as (
    select
      coalesce(count(*) filter (where ip.estado_item = 'en_revendedora'), 0)::bigint as total_en_poder,
      coalesce(count(*) filter (where ip.estado_item = 'disponible'), 0)::bigint as total_en_local
    from item_producto ip
    where ip.id_tenant = v_tenant
  ),
  kpi_liq as (
    select
      coalesce(sum(lr.monto_a_cobrar), 0)::numeric as liq_pend_monto,
      coalesce(count(*), 0)::bigint as liq_pend_cant
    from liquidacion_revendedora lr
    where lr.id_tenant = v_tenant
      and lr.estado = 'pendiente'
  ),
  ventas_rev as (
    select
      v.id_revendedora,
      coalesce(sum(dv.precio_venta), 0) as total_vendido
    from detalle_venta dv
    join venta v on v.id_venta = dv.id_venta
    where v.id_tenant = v_tenant
      and v.canal = 'revendedora'
      and v.estado_venta = 'registrada'
    group by v.id_revendedora
  ),
  comisiones_rev as (
    select
      lr.id_revendedora,
      coalesce(sum(lr.monto_comision), 0) as total_comision
    from liquidacion_revendedora lr
    where lr.id_tenant = v_tenant
    group by lr.id_revendedora
  ),
  pagos_rev as (
    select
      lr.id_revendedora,
      coalesce(sum(pr.monto), 0) as total_pagado
    from pago_revendedora pr
    join liquidacion_revendedora lr on lr.id_liquidacion = pr.id_liquidacion
    where lr.id_tenant = v_tenant
    group by lr.id_revendedora
  ),
  deudas as (
    select
      r.id_revendedora,
      greatest(0, coalesce(vr.total_vendido, 0) - coalesce(cr.total_comision, 0) - coalesce(pr.total_pagado, 0)) as adeudado
    from revendedora r
    left join ventas_rev vr on vr.id_revendedora = r.id_revendedora
    left join comisiones_rev cr on cr.id_revendedora = r.id_revendedora
    left join pagos_rev pr on pr.id_revendedora = r.id_revendedora
    where r.id_tenant = v_tenant
  )
  select
    ki.total_en_poder,
    ki.total_en_local,
    coalesce(sum(d.adeudado), 0)::numeric as kpi_adeudado_total,
    kl.liq_pend_monto,
    kl.liq_pend_cant
  from kpi_items ki
  cross join kpi_liq kl
  left join deudas d on true
  group by ki.total_en_poder, ki.total_en_local, kl.liq_pend_monto, kl.liq_pend_cant;
end;
$$;

grant execute on function rf_totales_panel_revendedoras() to authenticated;

-- ─── 2. rf_panel_revendedoras (INVOKER) ──────────────────────────────────

create or replace function rf_panel_revendedoras(
  p_desde          date default null,
  p_hasta          date default null,
  p_estado         boolean default null,
  p_filtro_cuenta  text default null,
  p_busqueda       text default null,
  p_orden          text default 'apellido_asc',
  p_limit          integer default 50,
  p_offset         integer default 0,
  p_dias_atraso    integer default 30
) returns table (
  id_revendedora                     uuid,
  nombre                             text,
  apellido                           text,
  email                              text,
  telefono                           text,
  activo                             boolean,
  items_en_poder                     bigint,
  monto_en_poder                     numeric,
  vendido_periodo                    numeric,
  comision_liquidada                 numeric,
  comision_estimada                  numeric,
  adeudado                           numeric,
  fecha_ultima_venta                 timestamptz,
  declaraciones_pendientes           bigint,
  estado_cuenta                      text,
  total_filas                        bigint,
  kpi_en_poder                       bigint,
  kpi_en_local                       bigint,
  kpi_adeudado_total                 numeric,
  kpi_liquidaciones_pendientes_monto numeric,
  kpi_liquidaciones_pendientes_cant  bigint
)
language plpgsql
stable
security invoker
as $$
declare
  v_tenant       uuid := auth_tenant_id();
  v_desde        date;
  v_hasta        date;
  v_rango        tstzrange;
  v_limit        integer;
  v_offset       integer;
  v_orden        text;
  v_dias_atraso  integer;
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
  v_dias_atraso := greatest(coalesce(p_dias_atraso, 30), 1);

  -- Lista blanca para ordenamiento seguro (nunca interpolar texto en ORDER BY)
  v_orden := case
    when p_orden in (
      'apellido_asc', 'apellido_desc',
      'nombre_asc', 'nombre_desc',
      'adeudado_asc', 'adeudado_desc',
      'vendido_asc', 'vendido_desc',
      'items_poder_asc', 'items_poder_desc',
      'ultima_venta_asc', 'ultima_venta_desc'
    ) then p_orden
    else 'apellido_asc'
  end;

  return query
  with kpi_items as (
    select
      coalesce(count(*) filter (where ip.estado_item = 'en_revendedora'), 0)::bigint as tot_en_poder,
      coalesce(count(*) filter (where ip.estado_item = 'disponible'), 0)::bigint as tot_en_local
    from item_producto ip
    where ip.id_tenant = v_tenant
  ),
  kpi_liq as (
    select
      coalesce(sum(lr.monto_a_cobrar), 0)::numeric as tot_liq_pend_monto,
      coalesce(count(*), 0)::bigint as tot_liq_pend_cant
    from liquidacion_revendedora lr
    where lr.id_tenant = v_tenant
      and lr.estado = 'pendiente'
  ),
  poder_rev as (
    select
      cr.id_revendedora,
      count(crd.id_item)::bigint as cant_poder,
      coalesce(sum(p.precio_venta), 0)::numeric as val_poder
    from consignacion_revendedora_detalle crd
    join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
    join producto p on p.id_producto = crd.id_producto
    where cr.id_tenant = v_tenant
      and cr.confirmada = true
      and cr.estado = 'abierta'
      and crd.estado_detalle = 'en_poder'
    group by cr.id_revendedora
  ),
  ventas_periodo as (
    select
      v.id_revendedora,
      coalesce(sum(dv.precio_venta), 0)::numeric as vendido,
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
      and v.fecha <@ v_rango
    group by v.id_revendedora
  ),
  historico_ventas as (
    select
      v.id_revendedora,
      coalesce(sum(dv.precio_venta), 0)::numeric as vendido_hist,
      max(v.fecha) as ultima_fecha
    from detalle_venta dv
    join venta v on v.id_venta = dv.id_venta
    where v.id_tenant = v_tenant
      and v.canal = 'revendedora'
      and v.estado_venta = 'registrada'
    group by v.id_revendedora
  ),
  historico_comisiones as (
    select
      lr.id_revendedora,
      coalesce(sum(lr.monto_comision), 0)::numeric as com_hist
    from liquidacion_revendedora lr
    where lr.id_tenant = v_tenant
    group by lr.id_revendedora
  ),
  historico_pagos as (
    select
      lr.id_revendedora,
      coalesce(sum(pr.monto), 0)::numeric as pagos_hist
    from pago_revendedora pr
    join liquidacion_revendedora lr on lr.id_liquidacion = pr.id_liquidacion
    where lr.id_tenant = v_tenant
    group by lr.id_revendedora
  ),
  atrasos as (
    select distinct lr.id_revendedora
    from liquidacion_revendedora lr
    where lr.id_tenant = v_tenant
      and lr.estado = 'pendiente'
      and lr.fecha_liquidacion <= (v_hoy - v_dias_atraso)
  ),
  metricas_base as (
    select
      r.id_revendedora,
      r.nombre,
      r.apellido,
      r.email,
      r.telefono,
      r.activo,
      coalesce(p.cant_poder, 0)::bigint as items_en_poder,
      coalesce(p.val_poder, 0)::numeric as monto_en_poder,
      coalesce(vp.vendido, 0)::numeric as vendido_periodo,
      coalesce(vp.com_liq, 0)::numeric as comision_liquidada,
      coalesce(vp.com_est, 0)::numeric as comision_estimada,
      greatest(0, coalesce(hv.vendido_hist, 0) - coalesce(hc.com_hist, 0) - coalesce(hp.pagos_hist, 0))::numeric as adeudado,
      hv.ultima_fecha as fecha_ultima_venta,
      0::bigint as declaraciones_pendientes, -- Slice 9b agregará la tabla declaracion_revendedora
      case
        when a.id_revendedora is not null then 'atrasada'
        when greatest(0, coalesce(hv.vendido_hist, 0) - coalesce(hc.com_hist, 0) - coalesce(hp.pagos_hist, 0)) > 0 then 'con_saldo'
        else 'al_dia'
      end as estado_cuenta
    from revendedora r
    left join poder_rev p on p.id_revendedora = r.id_revendedora
    left join ventas_periodo vp on vp.id_revendedora = r.id_revendedora
    left join historico_ventas hv on hv.id_revendedora = r.id_revendedora
    left join historico_comisiones hc on hc.id_revendedora = r.id_revendedora
    left join historico_pagos hp on hp.id_revendedora = r.id_revendedora
    left join atrasos a on a.id_revendedora = r.id_revendedora
    where r.id_tenant = v_tenant
  ),
  adeudado_tot as (
    select coalesce(sum(mb.adeudado), 0)::numeric as tot_adeudado
    from metricas_base mb
  ),
  filtradas as (
    select
      mb.*,
      count(*) over()::bigint as total_filas
    from metricas_base mb
    where (p_estado is null or mb.activo = p_estado)
      and (
        p_filtro_cuenta is null or p_filtro_cuenta = 'todos'
        or (p_filtro_cuenta = 'con_saldo' and mb.estado_cuenta = 'con_saldo')
        or (p_filtro_cuenta = 'atrasada' and mb.estado_cuenta = 'atrasada')
        or (p_filtro_cuenta = 'declaraciones_pendientes' and mb.declaraciones_pendientes > 0)
      )
      and (
        p_busqueda is null or trim(p_busqueda) = ''
        or mb.nombre ilike '%' || trim(p_busqueda) || '%'
        or mb.apellido ilike '%' || trim(p_busqueda) || '%'
        or coalesce(mb.email, '') ilike '%' || trim(p_busqueda) || '%'
      )
  )
  select
    f.id_revendedora,
    f.nombre,
    f.apellido,
    f.email,
    f.telefono,
    f.activo,
    f.items_en_poder,
    f.monto_en_poder,
    f.vendido_periodo,
    f.comision_liquidada,
    f.comision_estimada,
    f.adeudado,
    f.fecha_ultima_venta,
    f.declaraciones_pendientes,
    f.estado_cuenta,
    f.total_filas,
    ki.tot_en_poder as kpi_en_poder,
    ki.tot_en_local as kpi_en_local,
    ad.tot_adeudado as kpi_adeudado_total,
    kl.tot_liq_pend_monto as kpi_liquidaciones_pendientes_monto,
    kl.tot_liq_pend_cant as kpi_liquidaciones_pendientes_cant
  from filtradas f
  cross join kpi_items ki
  cross join kpi_liq kl
  cross join adeudado_tot ad
  order by
    case when v_orden = 'apellido_asc' then f.apellido end asc,
    case when v_orden = 'apellido_desc' then f.apellido end desc,
    case when v_orden = 'nombre_asc' then f.nombre end asc,
    case when v_orden = 'nombre_desc' then f.nombre end desc,
    case when v_orden = 'adeudado_asc' then f.adeudado end asc,
    case when v_orden = 'adeudado_desc' then f.adeudado end desc,
    case when v_orden = 'vendido_asc' then f.vendido_periodo end asc,
    case when v_orden = 'vendido_desc' then f.vendido_periodo end desc,
    case when v_orden = 'items_poder_asc' then f.items_en_poder end asc,
    case when v_orden = 'items_poder_desc' then f.items_en_poder end desc,
    case when v_orden = 'ultima_venta_asc' then f.fecha_ultima_venta end asc,
    case when v_orden = 'ultima_venta_desc' then f.fecha_ultima_venta end desc,
    f.apellido asc, f.nombre asc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function rf_panel_revendedoras(date, date, boolean, text, text, text, integer, integer, integer) to authenticated;

-- ─── 3. rf_quien_tiene_item (ADM-12, INVOKER) ───────────────────────────

create or replace function rf_quien_tiene_item(
  p_identificador text
) returns table (
  id_revendedora    uuid,
  nombre            text,
  apellido          text,
  telefono          text,
  email             text,
  id_consignacion   uuid,
  fecha_entrega     timestamptz,
  estado_detalle    text
)
language plpgsql
stable
security invoker
as $$
declare
  v_tenant  uuid := auth_tenant_id();
  v_is_uuid boolean;
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

  v_is_uuid := p_identificador ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  return query
  select
    r.id_revendedora,
    r.nombre,
    r.apellido,
    r.telefono,
    r.email,
    cr.id_consignacion_revendedora as id_consignacion,
    coalesce(cr.fecha_confirmacion, crd.created_at) as fecha_entrega,
    crd.estado_detalle::text
  from item_producto ip
  join consignacion_revendedora_detalle crd
    on crd.id_item = ip.id_item and crd.id_tenant = ip.id_tenant
  join consignacion_revendedora cr
    on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora and cr.id_tenant = crd.id_tenant
  join revendedora r
    on r.id_revendedora = cr.id_revendedora and r.id_tenant = cr.id_tenant
  where ip.id_tenant = v_tenant
    and (
      (v_is_uuid and ip.id_item = p_identificador::uuid)
      or ip.qr_code = p_identificador
    )
    and crd.estado_detalle = 'en_poder'
  order by crd.created_at desc
  limit 1;
end;
$$;

grant execute on function rf_quien_tiene_item(text) to authenticated;

-- ─── 4. sp_crear_revendedora con validación email-duplicado ────────────

create or replace function sp_crear_revendedora(
  p_nombre   text,
  p_apellido text,
  p_telefono text default null,
  p_email    text default null,
  p_notas    text default null,
  p_ip       inet default null
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
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

  if p_email is not null and trim(p_email) <> '' then
    if exists (
      select 1 from revendedora
      where id_tenant = v_tenant and email = trim(p_email) and activo = true
    ) then
      raise exception 'email-duplicado' using errcode = '23505';
    end if;
  end if;

  insert into revendedora (id_tenant, nombre, apellido, telefono, email, notas, activo, fecha_alta)
  values (v_tenant, trim(p_nombre), trim(p_apellido), nullif(trim(p_telefono), ''), nullif(trim(p_email), ''), p_notas, true, current_date)
  returning id_revendedora into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'revendedora', v_id::text, 'crear',
          jsonb_build_object('nombre', p_nombre, 'apellido', p_apellido, 'email', p_email, 'telefono', p_telefono), p_ip);

  return v_id;
end;
$$;
