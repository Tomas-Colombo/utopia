-- 00097_panel_revendedoras.sql
-- Slice 4b: Panel de gestiÃ³n del local (REQ-RV-ADM)
-- Funciones de lectura INVOKER: rf_panel_revendedoras, rf_totales_panel_revendedoras, rf_quien_tiene_item.
-- ActualizaciÃ³n de sp_crear_revendedora para validar email-duplicado.

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

-- â”€â”€â”€ 1. rf_totales_panel_revendedoras (INVOKER) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

