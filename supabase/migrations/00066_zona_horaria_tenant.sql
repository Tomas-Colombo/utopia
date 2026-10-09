-- 00066_zona_horaria_tenant.sql
-- UP: Slice 1 - Zona horaria por tenant

alter table tenant
  add column if not exists zona_horaria text not null
    default 'America/Argentina/Buenos_Aires';

create or replace function tr_tenant_zona_horaria()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.zona_horaria) then
    raise exception 'zona-horaria-invalida' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists tenant_zona_horaria_trigger on tenant;
create trigger tenant_zona_horaria_trigger
  before insert or update of zona_horaria on tenant
  for each row execute function tr_tenant_zona_horaria();

create or replace function fn_hoy_tenant()
returns date language sql stable as $$
  select (now() at time zone (
    select zona_horaria from tenant where id_tenant = auth_tenant_id()
  ))::date;
$$;
grant execute on function fn_hoy_tenant() to authenticated;

create or replace function fn_rango_tenant(p_desde date, p_hasta date)
returns tstzrange language plpgsql stable as $$
declare
  v_zona text;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  if p_hasta < p_desde or p_hasta - p_desde > 800 then
    raise exception 'periodo-invalido: desde % hasta %', p_desde, p_hasta using errcode = '22023';
  end if;

  select zona_horaria into v_zona from tenant where id_tenant = auth_tenant_id();
  
  v_inicio := (p_desde::timestamp at time zone v_zona);
  v_fin := ((p_hasta + 1)::timestamp at time zone v_zona);
  
  return tstzrange(v_inicio, v_fin, '[)');
end $$;
grant execute on function fn_rango_tenant(date, date) to authenticated;

-- Reemplazar current_date -> fn_hoy_tenant() en sp_calcular_costo_cobro (viene de 00057)
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
     and vigente_desde <= fn_hoy_tenant()
     and (cuotas = p_cuotas or cuotas is null)
   order by cuotas nulls last
   limit 1;

  if v_ar.id_arancel_cobro is null then
    return jsonb_build_object('sin_tarifario', true, 'costo_total', 0,
                              'neto', p_monto, 'dias_acreditacion', 0);
  end if;

  select * into v_cta from cuenta_destino
   where id_cuenta_destino = p_id_cuenta_destino and id_tenant = v_tenant;

  v_arancel := round(p_monto * v_ar.arancel_pct / 100, 2);
  v_iva     := round(v_arancel * v_ar.iva_arancel_pct / 100, 2);

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

-- Reemplazar current_date -> fn_hoy_tenant() en sp_registrar_venta (viene de 00064)
create or replace function sp_registrar_venta(
  p_lineas       jsonb,
  p_forma_pago   forma_pago default 'efectivo',
  p_id_cliente   uuid default null,
  p_id_reserva   uuid default null,
  p_observaciones text default null,
  p_ip           inet default null,
  p_pagos        jsonb default null,
  p_financiacion jsonb default null,
  p_financiador  jsonb default null
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
  v_fin_cuenta uuid;
  v_fin_medio  medio_pago;
  v_fin_propia boolean;
  v_monto_pago numeric(14, 2);
  v_pagado     numeric(14, 2) := 0;
  v_medio      medio_pago;
  v_cuotas     smallint;
  v_cobro      jsonb;
  v_costo_cobro numeric(14, 2);
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

  v_fin_propia := coalesce((p_financiador->>'propia')::boolean,
                           p_financiacion is not null, false);
  v_fin_cuenta := case when v_fin_propia then null
                       else (p_financiador->>'id_cuenta_destino')::uuid end;
  v_fin_medio  := case when v_fin_propia then null
                       else nullif(p_financiador->>'medio','')::medio_pago end;

  insert into venta(id_tenant, id_cliente, id_usuario_alta, forma_pago,
                    total, observaciones, financiacion,
                    id_cuenta_recargo, medio_recargo)
  values (v_tenant, p_id_cliente, v_actor, p_forma_pago, 0, p_observaciones,
          case
            when p_financiacion is not null then 'propia'::tipo_financiacion
            when p_forma_pago::text ~ '^cuotas_\d+$' then 'externa'::tipo_financiacion
            else 'ninguna'::tipo_financiacion
          end,
          v_fin_cuenta, v_fin_medio)
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

    v_snap := sp_calcular_precio_venta_snapshot(
                v_item.id_producto, p_forma_pago, v_ids_desc,
                v_fin_cuenta, v_fin_medio, v_fin_propia);
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

  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    if v_total > 0 and p_financiacion is null then
      select id_cuenta_destino into v_id_cuenta
        from cuenta_destino
       where id_tenant = v_tenant
         and id_cuenta_destino = coalesce(v_fin_cuenta, id_cuenta_destino)
         and (v_fin_cuenta is not null or es_predeterminada)
         and activo
       limit 1;
      if v_id_cuenta is null then
        raise exception 'sin-cuenta-predeterminada' using errcode = '22023';
      end if;

      v_medio := coalesce(v_fin_medio, case p_forma_pago::text
                   when 'efectivo' then 'efectivo'::medio_pago
                   when 'transferencia' then 'transferencia'::medio_pago
                   else 'tarjeta_credito'::medio_pago
                 end);
      v_cuotas := nullif(substring(p_forma_pago::text from '^cuotas_(\d+)$'), '')::smallint;

      v_cobro := sp_calcular_costo_cobro(v_id_cuenta, v_medio, v_cuotas, v_total);
      v_costo_cobro := (v_cobro->>'costo_total')::numeric;

      insert into pago_venta(
        id_tenant, id_venta, id_cuenta_destino, medio, monto, cuotas,
        costo_cobro, neto_acreditado, fecha_acreditacion, desglose_costo
      ) values (
        v_tenant, v_id_venta, v_id_cuenta, v_medio, v_total, v_cuotas,
        v_costo_cobro, v_total - v_costo_cobro,
        fn_hoy_tenant() + (v_cobro->>'dias_acreditacion')::int,
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
        fn_hoy_tenant() + (v_cobro->>'dias_acreditacion')::int,
        v_cobro
      );

      v_pagado := v_pagado + v_monto_pago;
    end loop;
  end if;

  if p_financiacion is not null then
    v_a_financiar := v_total - v_pagado;
    if v_a_financiar <= 0 then
      raise exception 'financiacion-sin-saldo: pagado % contra total %',
        v_pagado, v_total using errcode = '22023';
    end if;

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

    if v_pagado + v_acumulado <> v_total then
      raise exception 'financiacion-no-cuadra: % + % contra %',
        v_pagado, v_acumulado, v_total using errcode = '22023';
    end if;

  elsif p_pagos is not null and jsonb_array_length(p_pagos) > 0 then
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

-- Reemplazar current_date -> fn_hoy_tenant() en rf_reporte_caja (la vista a_acreditar)
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
    coalesce(sum(pv.monto) filter (where pv.id_cuota_financiada is null), 0),
    coalesce(sum(pv.monto) filter (where pv.id_cuota_financiada is not null), 0),
    coalesce(sum(pv.costo_cobro), 0),
    coalesce(sum(pv.monto - pv.costo_cobro), 0),
    -- Lo cobrado que TODAVÍA no está en la cuenta: tarjeta con plazo.
    coalesce(sum(pv.monto - pv.costo_cobro)
             filter (where pv.fecha_acreditacion > fn_hoy_tenant()), 0),
    count(*)
  from pago_venta pv
  join venta v on v.id_venta = pv.id_venta
 where pv.id_tenant = auth_tenant_id()
   and v.estado_venta = 'registrada'
   and pv.created_at >= p_desde and pv.created_at <= p_hasta;
$$;

/* -- DOWN

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
     and (cuotas = p_cuotas or cuotas is null)
   order by cuotas nulls last
   limit 1;

  if v_ar.id_arancel_cobro is null then
    return jsonb_build_object('sin_tarifario', true, 'costo_total', 0,
                              'neto', p_monto, 'dias_acreditacion', 0);
  end if;

  select * into v_cta from cuenta_destino
   where id_cuenta_destino = p_id_cuenta_destino and id_tenant = v_tenant;

  v_arancel := round(p_monto * v_ar.arancel_pct / 100, 2);
  v_iva     := round(v_arancel * v_ar.iva_arancel_pct / 100, 2);

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
grant execute on function sp_calcular_costo_cobro(uuid, medio_pago, smallint, numeric) to authenticated;

create or replace function sp_registrar_venta(
  p_lineas       jsonb,
  p_forma_pago   forma_pago default 'efectivo',
  p_id_cliente   uuid default null,
  p_id_reserva   uuid default null,
  p_observaciones text default null,
  p_ip           inet default null,
  p_pagos        jsonb default null,
  p_financiacion jsonb default null,
  p_financiador  jsonb default null
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
  v_fin_cuenta uuid;
  v_fin_medio  medio_pago;
  v_fin_propia boolean;
  v_monto_pago numeric(14, 2);
  v_pagado     numeric(14, 2) := 0;
  v_medio      medio_pago;
  v_cuotas     smallint;
  v_cobro      jsonb;
  v_costo_cobro numeric(14, 2);
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

  v_fin_propia := coalesce((p_financiador->>'propia')::boolean,
                           p_financiacion is not null, false);
  v_fin_cuenta := case when v_fin_propia then null
                       else (p_financiador->>'id_cuenta_destino')::uuid end;
  v_fin_medio  := case when v_fin_propia then null
                       else nullif(p_financiador->>'medio','')::medio_pago end;

  insert into venta(id_tenant, id_cliente, id_usuario_alta, forma_pago,
                    total, observaciones, financiacion,
                    id_cuenta_recargo, medio_recargo)
  values (v_tenant, p_id_cliente, v_actor, p_forma_pago, 0, p_observaciones,
          case
            when p_financiacion is not null then 'propia'::tipo_financiacion
            when p_forma_pago::text ~ '^cuotas_\d+$' then 'externa'::tipo_financiacion
            else 'ninguna'::tipo_financiacion
          end,
          v_fin_cuenta, v_fin_medio)
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

    v_snap := sp_calcular_precio_venta_snapshot(
                v_item.id_producto, p_forma_pago, v_ids_desc,
                v_fin_cuenta, v_fin_medio, v_fin_propia);
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

  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    if v_total > 0 and p_financiacion is null then
      select id_cuenta_destino into v_id_cuenta
        from cuenta_destino
       where id_tenant = v_tenant
         and id_cuenta_destino = coalesce(v_fin_cuenta, id_cuenta_destino)
         and (v_fin_cuenta is not null or es_predeterminada)
         and activo
       limit 1;
      if v_id_cuenta is null then
        raise exception 'sin-cuenta-predeterminada' using errcode = '22023';
      end if;

      v_medio := coalesce(v_fin_medio, case p_forma_pago::text
                   when 'efectivo' then 'efectivo'::medio_pago
                   when 'transferencia' then 'transferencia'::medio_pago
                   else 'tarjeta_credito'::medio_pago
                 end);
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

  if p_financiacion is not null then
    v_a_financiar := v_total - v_pagado;
    if v_a_financiar <= 0 then
      raise exception 'financiacion-sin-saldo: pagado % contra total %',
        v_pagado, v_total using errcode = '22023';
    end if;

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

    if v_pagado + v_acumulado <> v_total then
      raise exception 'financiacion-no-cuadra: % + % contra %',
        v_pagado, v_acumulado, v_total using errcode = '22023';
    end if;

  elsif p_pagos is not null and jsonb_array_length(p_pagos) > 0 then
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
    coalesce(sum(pv.monto) filter (where pv.id_cuota_financiada is null), 0),
    coalesce(sum(pv.monto) filter (where pv.id_cuota_financiada is not null), 0),
    coalesce(sum(pv.costo_cobro), 0),
    coalesce(sum(pv.monto - pv.costo_cobro), 0),
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

drop function if exists fn_rango_tenant(date, date);
drop function if exists fn_hoy_tenant();
alter table tenant drop column if exists zona_horaria;
*/
