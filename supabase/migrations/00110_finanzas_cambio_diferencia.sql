-- 00110_finanzas_cambio_diferencia.sql
-- Slice 8 / Cierre: Reconocimiento de diferencia de cambio en rf_finanzas_resultados,
-- fecha de línea de reemplazo en v_linea_venta, bloqueo de devolución sobre líneas cambiadas
-- y suma de diferencias en anulaciones (REQ-RV-DB-07, DR-5, DR-7, DR-14).
--
-- Documentación de invariante:
-- tg_venta_cuadre_pagos valida que los pagos de la venta coincidan con venta.total al momento
-- de la creación de la venta. Los cobros posteriores por diferencias de cambio se registran
-- en pago_venta asociados a la venta y en cambio_venta(diferencia), sin alterar venta.total,
-- manteniéndose la inmutabilidad de la cabecera original.
--
-- DOWN:
-- -- 1. Restaurar sp_anular_venta a la versión de 00093_venta_revendedora_pago.sql:
-- -- (Ver definición previa en 00093_venta_revendedora_pago.sql L520-L656)
-- -- 2. Restaurar sp_registrar_devolucion_cliente a la versión de 00090_anular_venta_revendedora.sql:
-- -- (Ver definición previa en 00090_anular_venta_revendedora.sql L373-L498)
-- -- 3. Restaurar rf_finanzas_resultados a la versión de 00095_liquidacion_functions.sql:
-- -- (Ver definición previa en 00095_liquidacion_functions.sql L805-L951)
-- -- 4. Restaurar v_linea_venta a la versión de 00100_finanzas_cambio.sql:
-- -- (Ver definición previa en 00100_finanzas_cambio.sql L20-L59)

-- 1. Actualizar v_linea_venta para imputar la fecha del cambio a la línea de reemplazo
create or replace view v_linea_venta with (security_invoker = true) as
select
  v.id_tenant,
  v.id_venta,
  dv.id_producto,
  case
    when cv_nuevo.id_cambio is not null then cv_nuevo.created_at
    else v.fecha
  end as fecha_venta,
  v.estado_venta,
  v.fecha_anulacion,
  p.precio_venta as precio_venta,
  dv.costo_snapshot as costo,
  dv.monto_ganancia as margen,
  dv.tipo_ingreso_snapshot,
  dv.id_proveedor,
  dv.monto_proveedor,
  dv.id_rendicion,
  dv.excluida_rendicion,
  (dev.id_devolucion is not null or cv_orig.id_cambio is not null) as devuelta,
  coalesce(dev.fecha, cv_orig.created_at) as fecha_devolucion,
  coalesce(dev.costo_recuperado, case when cv_orig.id_cambio is not null then dv.costo_snapshot else null end)::numeric(14,2) as costo_recuperado,
  case
    when v.estado_venta = 'registrada' and dev.id_devolucion is null and cv_orig.id_cambio is null and dv.id_liquidacion is not null
      then dv.monto_comision
    else 0::numeric(14, 2)
  end as comision,
  case
    when v.estado_venta = 'registrada'
     and dev.id_devolucion is null
     and cv_orig.id_cambio is null
     and dv.id_liquidacion is null
     and v.canal = 'revendedora'
      then round((dv.porcentaje_comision_preview * dv.precio_venta / 100.0), 2)
    else 0::numeric(14, 2)
  end as comision_estimada,
  liq.fecha_liquidacion
from detalle_venta dv
join venta v on v.id_venta = dv.id_venta
join producto p on p.id_producto = dv.id_producto
left join devolucion_venta dev on dev.id_detalle_venta = dv.id_detalle_venta
left join cambio_venta cv_orig on cv_orig.id_detalle_original = dv.id_detalle_venta and cv_orig.id_tenant = dv.id_tenant
left join cambio_venta cv_nuevo on cv_nuevo.id_item_entregado = dv.id_item and cv_nuevo.id_venta_original = dv.id_venta and cv_nuevo.id_tenant = dv.id_tenant
left join liquidacion_revendedora liq on liq.id_liquidacion = dv.id_liquidacion and liq.id_tenant = dv.id_tenant;

-- 2. rf_finanzas_resultados partiendo de 00095_liquidacion_functions.sql con diferencias de cambio
create or replace function rf_finanzas_resultados(p_desde date, p_hasta date)
returns table (
  ventas_brutas numeric,
  anulaciones numeric,
  devoluciones numeric,
  ventas_netas numeric,
  costo_mercaderia numeric,
  ganancia_sobre_ventas numeric,
  costo_cobro numeric,
  incobrables numeric,
  bajas_inventario numeric,
  ganancia_despues_de_costos numeric,
  gastos numeric,
  comision_liquidada numeric,
  comision_pendiente_estimada numeric,
  ganancia_final numeric,
  cantidad_ventas bigint,
  ticket_promedio numeric
)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid;
  v_ventas_brutas numeric := 0;
  v_anulaciones numeric := 0;
  v_devoluciones numeric := 0;
  v_costo_mercaderia numeric := 0;
  v_costo_cobro numeric := 0;
  v_incobrables numeric := 0;
  v_bajas_inventario numeric := 0;
  v_gastos numeric := 0;
  v_comision_liquidada numeric := 0;
  v_comision_pendiente_estimada numeric := 0;
  v_cantidad_ventas bigint := 0;
  v_zona text;
  v_diferencias_cambio numeric := 0;
begin
  v_tenant_id := auth_tenant_id();
  select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;

  -- Ventas brutas: ventas registradas del período + diferencias cobradas en cambios del período
  select
    coalesce(sum(v.total), 0) into v_ventas_brutas
  from venta v
  where v.id_tenant = v_tenant_id
    and (v.fecha at time zone v_zona)::date >= p_desde
    and (v.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(cv.diferencia), 0) into v_diferencias_cambio
  from cambio_venta cv
  where cv.id_tenant = v_tenant_id
    and (cv.created_at at time zone v_zona)::date >= p_desde
    and (cv.created_at at time zone v_zona)::date <= p_hasta;

  v_ventas_brutas := v_ventas_brutas + v_diferencias_cambio;

  -- Anulaciones: suma total de ventas anuladas en el período + diferencias de cambios de esas ventas
  select
    coalesce(sum(v.total), 0) + coalesce((
      select sum(cv.diferencia)
      from cambio_venta cv
      join venta va on va.id_venta = cv.id_venta_original
      where va.id_tenant = v_tenant_id
        and (va.fecha_anulacion at time zone v_zona)::date >= p_desde
        and (va.fecha_anulacion at time zone v_zona)::date <= p_hasta
    ), 0) into v_anulaciones
  from venta v
  where v.id_tenant = v_tenant_id
    and (v.fecha_anulacion at time zone v_zona)::date >= p_desde
    and (v.fecha_anulacion at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(dv.monto), 0) into v_devoluciones
  from devolucion_venta dv
  where dv.id_tenant = v_tenant_id
    and (dv.fecha at time zone v_zona)::date >= p_desde
    and (dv.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(vl.costo), 0) into v_costo_mercaderia
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id
    and (vl.fecha_venta at time zone v_zona)::date >= p_desde
    and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;

  declare
    v_costo_anuladas numeric := 0;
    v_costo_devueltas numeric := 0;
  begin
    select coalesce(sum(vl.costo), 0) into v_costo_anuladas
    from v_linea_venta vl
    where vl.id_tenant = v_tenant_id
      and (vl.fecha_anulacion at time zone v_zona)::date >= p_desde
      and (vl.fecha_anulacion at time zone v_zona)::date <= p_hasta;

    select coalesce(sum(vl.costo_recuperado), 0) into v_costo_devueltas
    from v_linea_venta vl
    where vl.id_tenant = v_tenant_id
      and (vl.fecha_devolucion at time zone v_zona)::date >= p_desde
      and (vl.fecha_devolucion at time zone v_zona)::date <= p_hasta;

    v_costo_mercaderia := v_costo_mercaderia - v_costo_anuladas - v_costo_devueltas;
  end;

  select
    coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro
  from pago_venta pv
  where pv.id_tenant = v_tenant_id 
    and pv.medio <> 'cuenta_revendedora'
    and (pv.created_at at time zone v_zona)::date >= p_desde
    and (pv.created_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(cf.monto - cf.monto_pagado), 0) into v_incobrables
  from cuota_financiada cf
  where cf.id_tenant = v_tenant_id
    and cf.estado = 'incobrable'
    and (cf.fecha_incobrable at time zone v_zona)::date >= p_desde
    and (cf.fecha_incobrable at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(ip.costo_ingreso), 0) into v_bajas_inventario
  from item_producto ip
  where ip.id_tenant = v_tenant_id
    and ip.estado_item = 'baja'
    and (ip.updated_at at time zone v_zona)::date >= p_desde
    and (ip.updated_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(gn.monto), 0) into v_gastos
  from gasto_negocio gn
  where gn.id_tenant = v_tenant_id
    and (gn.fecha at time zone v_zona)::date >= p_desde
    and (gn.fecha at time zone v_zona)::date <= p_hasta;

  -- DR-2: comision_liquidada se devenga por fecha de liquidación, uniendo con liquidacion_revendedora
  select
    coalesce(sum(vl.comision), 0) into v_comision_liquidada
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id
    and vl.comision > 0
    and vl.fecha_liquidacion is not null
    and vl.fecha_liquidacion >= p_desde
    and vl.fecha_liquidacion <= p_hasta;

  select
    coalesce(sum(vl.comision_estimada), 0) into v_comision_pendiente_estimada
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id
    and (vl.fecha_venta at time zone v_zona)::date >= p_desde
    and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;

  -- Si el módulo revendedoras está apagado, las comisiones no aplican
  if not exists (
    select 1 from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = v_tenant_id and m.codigo = 'revendedoras' and tm.habilitado = true
  ) then
    v_comision_liquidada := 0;
    v_comision_pendiente_estimada := 0;
  end if;

  select count(*) into v_cantidad_ventas
  from venta v
  where v.id_tenant = v_tenant_id
    and v.estado_venta = 'registrada'
    and (v.fecha at time zone v_zona)::date >= p_desde
    and (v.fecha at time zone v_zona)::date <= p_hasta;

  return query select
    v_ventas_brutas,
    v_anulaciones,
    v_devoluciones,
    v_ventas_brutas - v_anulaciones - v_devoluciones as ventas_netas,
    v_costo_mercaderia,
    (v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia as ganancia_sobre_ventas,
    v_costo_cobro,
    v_incobrables,
    v_bajas_inventario,
    ((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario as ganancia_despues_de_costos,
    v_gastos,
    v_comision_liquidada,
    v_comision_pendiente_estimada,
    (((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario) - v_gastos - v_comision_liquidada as ganancia_final,
    v_cantidad_ventas,
    case when v_cantidad_ventas > 0 then (v_ventas_brutas - v_anulaciones - v_devoluciones) / v_cantidad_ventas else null::numeric end as ticket_promedio;
end;
$$;

grant execute on function rf_finanzas_resultados(date, date) to authenticated;

-- 3. sp_registrar_devolucion_cliente partiendo de 00090 con bloqueo de línea cambiada y liquidada
create or replace function sp_registrar_devolucion_cliente(
  p_id_detalle_venta    uuid,
  p_motivo              text default null,
  p_id_cuenta_reintegro uuid default null,
  p_medio_reintegro     medio_pago default null,
  p_ip                  inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant            uuid := auth_tenant_id();
  v_actor             uuid := auth.uid();
  v_id_item           uuid;
  v_id_venta          uuid;
  v_id_devolucion     uuid;
  v_canal             canal_venta;
  v_estado_item       estado_item;
  v_estado_venta      estado_venta;
  v_total_venta       numeric(14,2);
  v_precio_venta      numeric(14,2);
  v_costo_snapshot    numeric(14,2);
  v_sum_pagos         numeric(14,2);
  v_sum_dev_previas   numeric(14,2);
  v_sum_reint_previos numeric(14,2);
  v_reintegro         numeric(14,2) := 0;
  v_cuotas_abiertas   boolean;
  v_ya_devuelta       boolean;
  v_ya_rendida        boolean;
  v_id_liquidacion    uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Lock del item_producto y lectura de detalle_venta
  select dv.id_item, ip.estado_item, dv.id_venta, dv.precio_venta, dv.costo_snapshot,
         dv.id_rendicion is not null, dv.id_liquidacion
    into v_id_item, v_estado_item, v_id_venta, v_precio_venta, v_costo_snapshot,
         v_ya_rendida, v_id_liquidacion
    from detalle_venta dv
    join item_producto ip on ip.id_item = dv.id_item
   where dv.id_detalle_venta = p_id_detalle_venta
     and dv.id_tenant = v_tenant
   for update of ip;

  if v_id_item is null then
    raise exception 'detalle-venta-not-found' using errcode = '42704';
  end if;

  if v_id_liquidacion is not null then
    raise exception 'venta-liquidada' using errcode = '22023';
  end if;

  if exists (
    select 1 from cambio_venta
    where id_detalle_original = p_id_detalle_venta
      and id_tenant = v_tenant
  ) then
    raise exception 'detalle-ya-cambiado' using errcode = '22023';
  end if;

  if v_estado_item <> 'vendido' then
    raise exception 'item-no-esta-vendido: estado=%', v_estado_item using errcode = '22023';
  end if;

  if v_ya_rendida then
    raise exception 'detalle-ya-rendido' using errcode = '22023';
  end if;

  select exists(
    select 1 from devolucion_venta
     where id_detalle_venta = p_id_detalle_venta
  ) into v_ya_devuelta;

  if v_ya_devuelta then
    raise exception 'detalle-ya-devuelto' using errcode = '22023';
  end if;

  select estado_venta, total, canal into v_estado_venta, v_total_venta, v_canal
    from venta
   where id_venta = v_id_venta for update;

  if v_canal = 'revendedora' then
    raise exception 'devolucion-venta-revendedora' using errcode = '22023';
  end if;

  if v_estado_venta = 'anulada' then
    raise exception 'venta-anulada' using errcode = '22023';
  end if;

  select exists(
    select 1 from cuota_financiada
     where id_venta = v_id_venta and estado in ('pendiente', 'parcial')
  ) into v_cuotas_abiertas;

  if v_cuotas_abiertas then
    raise exception 'devolucion-venta-con-cuotas-abiertas' using errcode = '22023';
  end if;

  -- Calcular reintegro (excluye pagos cuenta_revendedora)
  select coalesce(sum(monto), 0) into v_sum_pagos
    from pago_venta
   where id_venta = v_id_venta
     and medio <> 'cuenta_revendedora';

  select coalesce(sum(dv.precio_venta), 0) into v_sum_dev_previas
    from devolucion_venta dev
    join detalle_venta dv on dv.id_detalle_venta = dev.id_detalle_venta
   where dev.id_venta = v_id_venta;

  select coalesce(sum(monto), 0) into v_sum_reint_previos
    from reintegro_cliente
   where id_venta = v_id_venta;

  v_reintegro := greatest(0::numeric, v_sum_pagos - (v_total_venta - v_sum_dev_previas - v_precio_venta) - v_sum_reint_previos);

  if v_reintegro > 0 and (p_id_cuenta_reintegro is null or p_medio_reintegro is null) then
    raise exception 'reintegro-requiere-cuenta-y-medio' using errcode = '22023';
  end if;

  -- Insertar devolucion_venta
  insert into devolucion_venta (
    id_tenant, id_venta, id_detalle_venta, id_item,
    monto, costo_recuperado, motivo, id_usuario
  ) values (
    v_tenant, v_id_venta, p_id_detalle_venta, v_id_item,
    v_precio_venta, v_costo_snapshot, p_motivo, v_actor
  ) returning id_devolucion into v_id_devolucion;

  -- Insertar reintegro_cliente si corresponde
  if v_reintegro > 0 then
    insert into reintegro_cliente (
      id_tenant, id_venta, id_devolucion, id_cuenta_destino,
      medio, monto, origen, motivo, id_usuario
    ) values (
      v_tenant, v_id_venta, v_id_devolucion, p_id_cuenta_reintegro,
      p_medio_reintegro, v_reintegro, 'devolucion', p_motivo, v_actor
    );
  end if;

  -- Transicionar item
  perform sp_transicion_item_producto(
    v_id_item, 'devuelto_cliente', 'ajuste',
    p_id_detalle_venta, 'devolucion_cliente', p_ip
  );

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'detalle_venta', p_id_detalle_venta::text, 'devolucion_cliente',
          jsonb_build_object('motivo', p_motivo, 'reintegro', v_reintegro), p_ip);

  return jsonb_build_object('reintegro', v_reintegro);
end;
$$;

grant execute on function sp_registrar_devolucion_cliente(uuid, text, uuid, medio_pago, inet) to authenticated;

-- 4. sp_anular_venta con filtro id_tenant en consignacion_revendedora_detalle
create or replace function sp_anular_venta(
  p_id_venta uuid,
  p_motivo   text default null,
  p_ip       inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant            uuid := auth_tenant_id();
  v_actor             uuid := auth.uid();
  v_estado            estado_venta;
  v_canal             canal_venta;
  v_rendida           boolean;
  v_liquidada         boolean;
  v_anuladas          integer := 0;
  r_det               record;
  r_pago              record;
  v_total_reintegrado numeric(14,2) := 0;
  v_reintegro_pago    numeric(14,2);
  v_restante          numeric(14,2);
  v_tiene_incobrables boolean;
begin
  select estado_venta, canal into v_estado, v_canal from venta
    where id_venta = p_id_venta and id_tenant = v_tenant for update;
  
  if v_estado is null then
    raise exception 'venta-not-found' using errcode = '42704';
  end if;
  
  if v_estado = 'anulada' then
    return jsonb_build_object('total_reintegrado', 0); -- idempotente
  end if;

  select exists(
    select 1 from cuota_financiada
     where id_venta = p_id_venta and estado = 'incobrable'
  ) into v_tiene_incobrables;
  
  if v_tiene_incobrables then
    raise exception 'venta-con-incobrables' using errcode = '22023';
  end if;

  select exists(
    select 1 from detalle_venta
     where id_venta = p_id_venta and id_rendicion is not null
  ) into v_rendida;
  
  if v_rendida then
    raise exception 'venta-ya-rendida' using errcode = '22023';
  end if;

  select exists(
    select 1 from detalle_venta
     where id_venta = p_id_venta and id_liquidacion is not null
  ) into v_liquidada;
  
  if v_liquidada then
    raise exception 'venta-liquidada' using errcode = '22023';
  end if;

  for r_det in
    select dv.id_item, ip.estado_item
      from detalle_venta dv
      join item_producto ip on ip.id_item = dv.id_item
     where dv.id_venta = p_id_venta
     for update of ip
  loop
    if r_det.estado_item = 'vendido' then
      if v_canal = 'revendedora' then
        perform sp_transicion_item_producto(
          r_det.id_item, 'en_revendedora', 'ajuste', p_id_venta, 'anulacion_venta', p_ip
        );
        update consignacion_revendedora_detalle
           set estado_detalle = 'en_poder'
         where id_item = r_det.id_item
           and estado_detalle = 'vendido'
           and id_tenant = v_tenant;
      else
        perform sp_transicion_item_producto(
          r_det.id_item, 'disponible', 'ajuste', p_id_venta, 'anulacion_venta', p_ip
        );
      end if;
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

  -- Lo que queda por devolver es lo cobrado menos TODO lo ya reintegrado de la
  -- venta. Excluir pagos de cuenta_revendedora (no mueven fondos de caja).
  v_restante := greatest(0::numeric,
    (select coalesce(sum(monto), 0) from pago_venta where id_venta = p_id_venta and medio <> 'cuenta_revendedora')
    - (select coalesce(sum(monto), 0) from reintegro_cliente where id_venta = p_id_venta)
  );

  for r_pago in
    select id_pago_venta, id_cuenta_destino, medio, monto
      from pago_venta
     where id_venta = p_id_venta
       and medio <> 'cuenta_revendedora'
     order by created_at, id_pago_venta
  loop
    v_reintegro_pago := least(v_restante, r_pago.monto - coalesce((
      select sum(monto) from reintegro_cliente
       where id_pago_venta = r_pago.id_pago_venta
    ), 0));
    
    if v_reintegro_pago > 0 then
      insert into reintegro_cliente (
        id_tenant, id_venta, id_pago_venta, id_cuenta_destino,
        medio, monto, origen, motivo, id_usuario
      ) values (
        v_tenant, p_id_venta, r_pago.id_pago_venta, r_pago.id_cuenta_destino,
        r_pago.medio, v_reintegro_pago, 'anulacion', p_motivo, v_actor
      );
      v_total_reintegrado := v_total_reintegrado + v_reintegro_pago;
      v_restante := v_restante - v_reintegro_pago;
    end if;
  end loop;

  update venta
     set estado_venta     = 'anulada',
         fecha_anulacion  = now(),
         motivo_anulacion = p_motivo
   where id_venta = p_id_venta;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'venta', p_id_venta::text, 'anular',
          jsonb_build_object('motivo', p_motivo, 'cuotas_anuladas', v_anuladas, 'total_reintegrado', v_total_reintegrado),
          p_ip);

  return jsonb_build_object('total_reintegrado', v_total_reintegrado);
end $$;

grant execute on function sp_anular_venta(uuid, text, inet) to authenticated;
