-- 00093_venta_revendedora_pago.sql
-- Slice 6d: Pago de venta de revendedora (DR-14)
--
-- UP:
--   1. Hace id_cuenta_destino nullable en pago_venta con check condicional.
--   2. Actualiza sp_registrar_venta (desde 00089):
--      - Canal 'revendedora' registra automáticamente el pago por el total con medio 'cuenta_revendedora'
--        y sin cuenta destino, para que tr_venta_cuadre_pagos cuadre.
--      - Canal distinto de 'revendedora' rechaza el medio 'cuenta_revendedora' con slug 'medio-solo-revendedora'.
--   3. Actualiza sp_anular_venta (desde 00090):
--      - Excluye pagos con medio 'cuenta_revendedora' al calcular y generar reintegros.
--   4. Actualiza rf_finanzas_flujo (desde 00072) y rf_finanzas_resultados (desde 00091):
--      - Excluye pagos con medio 'cuenta_revendedora' de cobrado y costo_cobro.
--
-- DOWN:
--   -- 1. Restaurar sp_registrar_venta ejecutando la definición de 00089_sp_registrar_venta_canal.sql
--   -- 2. Restaurar sp_anular_venta ejecutando la definición de 00090_anular_venta_revendedora.sql
--   -- 3. Restaurar rf_finanzas_resultados ejecutando la definición de 00091_finanzas_comision.sql
--   -- 4. Restaurar rf_finanzas_flujo ejecutando la definición de 00072_finanzas_lectura_1.sql:
--   create or replace function rf_finanzas_flujo(p_desde date, p_hasta date)
--   returns table (
--     cobrado numeric, devuelto_clientes numeric, costo_cobro numeric,
--     neto_cobros numeric, compras_mercaderia numeric, pagos_proveedores numeric,
--     gastos numeric, flujo_neto numeric, por_acreditar jsonb
--   ) language plpgsql security invoker as $$
--   declare
--     v_tenant_id uuid; v_cobrado numeric := 0; v_devuelto_clientes numeric := 0;
--     v_costo_cobro numeric := 0; v_compras_mercaderia numeric := 0;
--     v_pagos_proveedores numeric := 0; v_gastos numeric := 0; v_por_acreditar jsonb; v_zona text;
--   begin
--     v_tenant_id := auth_tenant_id();
--     select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;
--     select coalesce(sum(pv.monto), 0) into v_cobrado from pago_venta pv where pv.id_tenant = v_tenant_id and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;
--     select coalesce(sum(rc.monto), 0) into v_devuelto_clientes from reintegro_cliente rc where rc.id_tenant = v_tenant_id and (rc.fecha at time zone v_zona)::date >= p_desde and (rc.fecha at time zone v_zona)::date <= p_hasta;
--     select coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro from pago_venta pv where pv.id_tenant = v_tenant_id and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;
--     select coalesce(sum(cantidad * costo_unitario), 0) into v_compras_mercaderia from ingreso_mercaderia_detalle d join ingreso_mercaderia i on i.id_ingreso = d.id_ingreso where i.id_tenant = v_tenant_id and i.tipo_ingreso = 'compra' and i.confirmado = true and i.cancelado_at is null and (i.fecha at time zone v_zona)::date >= p_desde and (i.fecha at time zone v_zona)::date <= p_hasta;
--     select coalesce(sum(rp.monto_total), 0) into v_pagos_proveedores from rendicion_proveedor rp where rp.id_tenant = v_tenant_id and rp.estado = 'pagada' and (rp.fecha_pago at time zone v_zona)::date >= p_desde and (rp.fecha_pago at time zone v_zona)::date <= p_hasta;
--     select coalesce(sum(gn.monto), 0) into v_gastos from gasto_negocio gn where gn.id_tenant = v_tenant_id and (gn.fecha at time zone v_zona)::date >= p_desde and (gn.fecha at time zone v_zona)::date <= p_hasta;
--     select jsonb_object_agg(t.tipo, coalesce(t.total, 0)) into v_por_acreditar from (select cd.tipo, sum(p.neto_acreditado) as total from pago_venta p join cuenta_destino cd on cd.id_cuenta_destino = p.id_cuenta_destino where p.id_tenant = v_tenant_id and (p.fecha_acreditacion at time zone v_zona)::date > (now() at time zone v_zona)::date group by cd.tipo) t;
--     if v_por_acreditar is null then v_por_acreditar := '{}'::jsonb; end if;
--     return query select v_cobrado, v_devuelto_clientes, v_costo_cobro, v_cobrado - v_devuelto_clientes - v_costo_cobro, v_compras_mercaderia, v_pagos_proveedores, v_gastos, (v_cobrado - v_devuelto_clientes - v_costo_cobro) - v_compras_mercaderia - v_pagos_proveedores - v_gastos, v_por_acreditar;
--   end; $$;
--   -- 5. Revertir constraint en pago_venta:
--   alter table pago_venta drop constraint if exists pago_venta_cuenta_destino_req;
--   -- alter table pago_venta alter column id_cuenta_destino set not null;

-- 1. Modificar pago_venta para permitir id_cuenta_destino nulo en cuenta_revendedora
alter table pago_venta alter column id_cuenta_destino drop not null;

alter table pago_venta
  drop constraint if exists pago_venta_cuenta_destino_req;

alter table pago_venta
  add constraint pago_venta_cuenta_destino_req
  check (medio = 'cuenta_revendedora' or id_cuenta_destino is not null);

-- 2. sp_registrar_venta (partiendo de 00089)
create or replace function sp_registrar_venta(
  p_lineas         jsonb,
  p_forma_pago     forma_pago default 'efectivo',
  p_id_cliente     uuid default null,
  p_id_reserva     uuid default null,
  p_observaciones  text default null,
  p_ip             inet default null,
  p_pagos          jsonb default null,
  p_financiacion   jsonb default null,
  p_financiador    jsonb default null,
  p_canal          canal_venta default 'local',
  p_id_revendedora uuid default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_id_venta   uuid := gen_random_uuid();
  v_total      numeric(14, 2) := 0;
  v_lineas_procesadas jsonb := '[]'::jsonb;
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

  -- Variables específicas para canal y comisiones
  v_canal      canal_venta := coalesce(p_canal, 'local');
  v_pct_preview numeric(5, 2) := 0;
  v_id_dcr     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Seguridad (ACC-07 punto 5): una sesión con rol Revendedora no puede vender directamente
  if auth_revendedora_id() is not null then
    raise exception 'no-permission' using errcode = '42501';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'lineas-vacias' using errcode = '22023';
  end if;

  if v_canal = 'online' then
    raise exception 'canal-no-disponible' using errcode = '22023';
  end if;

  -- Validaciones específicas del canal revendedora
  if v_canal = 'revendedora' then
    if not exists (
      select 1 from tenant_modulo tm
      join modulo m on m.id_modulo = tm.id_modulo
      where tm.id_tenant = v_tenant and m.codigo = 'revendedoras' and tm.habilitado = true
    ) then
      raise exception 'modulo-revendedoras-deshabilitado' using errcode = '42501';
    end if;

    if p_id_revendedora is null then
      raise exception 'venta-revendedora-sin-id' using errcode = '22023';
    end if;

    if not exists (
      select 1 from revendedora
      where id_tenant = v_tenant and id_revendedora = p_id_revendedora and activo = true
    ) then
      raise exception 'revendedora-not-found' using errcode = '42704';
    end if;

    -- Obtener el snapshot informativo de comisión según la regla vigente
    select coalesce(porcentaje, 0) into v_pct_preview
      from fn_resolver_comision(p_id_revendedora, fn_hoy_tenant(), 0, 'revendedora')
     limit 1;
    v_pct_preview := coalesce(v_pct_preview, 0);
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

  if v_fin_medio = 'cuenta_revendedora' and v_canal <> 'revendedora' then
    raise exception 'medio-solo-revendedora' using errcode = '22023';
  end if;


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

    v_id_dcr := null;

    if v_canal = 'revendedora' then
      if v_item.estado_item <> 'en_revendedora' then
        raise exception 'item-no-en-revendedora: % (estado=%)',
          v_id_item, v_item.estado_item using errcode = '22023';
      end if;

      select crd.id_consignacion_revendedora_detalle into v_id_dcr
        from consignacion_revendedora_detalle crd
        join consignacion_revendedora cr on cr.id_consignacion_revendedora = crd.id_consignacion_revendedora
       where crd.id_item = v_id_item
         and cr.id_tenant = v_tenant
         and cr.id_revendedora = p_id_revendedora
         and cr.confirmada = true
         and cr.estado = 'abierta'
         and crd.estado_detalle = 'en_poder'
       for update of crd;

      if v_id_dcr is null then
        raise exception 'item-no-en-revendedora: %', v_id_item using errcode = '22023';
      end if;
    else
      if v_item.estado_item <> 'disponible' then
        raise exception 'item-no-disponible: % (estado=%)',
          v_id_item, v_item.estado_item using errcode = '22023';
      end if;
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

    v_monto_gan := v_precio - v_costo;

    v_lineas_procesadas := v_lineas_procesadas || jsonb_build_object(
      'id_item', v_id_item, 'id_producto', v_item.id_producto,
      'id_prov', coalesce(v_id_prov::text, ''), 'precio', v_precio, 'costo', v_costo,
      'monto_prov', v_monto_prov,
      'monto_gan', v_monto_gan, 'tipo_ingreso', v_item.tipo_ingreso,
      'desglose', coalesce(v_snap->'desglose', '{}'::jsonb),
      'id_dcr', v_id_dcr
    );

    v_total := v_total + v_precio;
  end loop;

  insert into venta(id_venta, id_tenant, id_cliente, id_usuario_alta, forma_pago,
                    total, observaciones, financiacion,
                    id_cuenta_recargo, medio_recargo,
                    canal, id_revendedora)
  values (v_id_venta, v_tenant, p_id_cliente, v_actor, p_forma_pago, v_total, p_observaciones,
          case
            when p_financiacion is not null then 'propia'::tipo_financiacion
            when p_forma_pago::text ~ '^cuotas_\d+$' then 'externa'::tipo_financiacion
            else 'ninguna'::tipo_financiacion
          end,
          v_fin_cuenta, v_fin_medio,
          v_canal, p_id_revendedora);

  for v_linea in select * from jsonb_array_elements(v_lineas_procesadas) loop
    insert into detalle_venta(
      id_tenant, id_venta, id_item, id_producto, id_proveedor,
      precio_venta, costo_snapshot, monto_proveedor, monto_gasto, monto_ganancia,
      tipo_ingreso_snapshot, desglose_reglas,
      porcentaje_comision_preview
    ) values (
      v_tenant, v_id_venta, (v_linea->>'id_item')::uuid, (v_linea->>'id_producto')::uuid, nullif(v_linea->>'id_prov', '')::uuid,
      (v_linea->>'precio')::numeric, (v_linea->>'costo')::numeric, (v_linea->>'monto_prov')::numeric, 0, (v_linea->>'monto_gan')::numeric,
      (v_linea->>'tipo_ingreso')::tipo_ingreso, (v_linea->'desglose'),
      v_pct_preview
    );

    perform sp_transicion_item_producto(
      (v_linea->>'id_item')::uuid, 'vendido', 'venta', v_id_venta, 'venta', p_ip
    );

    if v_canal = 'revendedora' and (v_linea->>'id_dcr') is not null then
      update consignacion_revendedora_detalle
         set estado_detalle = 'vendido'
       where id_consignacion_revendedora_detalle = (v_linea->>'id_dcr')::uuid;
    end if;
  end loop;

  if p_id_reserva is not null then
    update reserva
       set estado_reserva = 'convertida_venta',
           fecha_cierre = now()
     where id_reserva = p_id_reserva;
  end if;

  -- ─── Cobranza y registro de pagos (DR-14) ──────────────────────────
  if v_canal = 'revendedora' then
    if v_total > 0 then
      insert into pago_venta(
        id_tenant, id_venta, id_cuenta_destino, medio, monto, cuotas,
        costo_cobro, neto_acreditado, fecha_acreditacion, desglose_costo
      ) values (
        v_tenant, v_id_venta, null, 'cuenta_revendedora'::medio_pago, v_total, null,
        0, v_total, null, '{}'::jsonb
      );
      v_pagado := v_total;
    end if;

  elsif p_pagos is null or jsonb_array_length(p_pagos) = 0 then
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

      if v_medio = 'cuenta_revendedora' and v_canal <> 'revendedora' then
        raise exception 'medio-solo-revendedora' using errcode = '22023';
      end if;

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

  elsif p_pagos is not null and jsonb_array_length(p_pagos) > 0 and v_canal <> 'revendedora' then
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
                             'canal', v_canal,
                             'id_revendedora', p_id_revendedora,
                             'pagado', v_pagado,
                             'pagos', coalesce(jsonb_array_length(p_pagos), 1),
                             'financiado', v_acumulado,
                             'cuotas_financiadas', coalesce(v_fin_cuotas, 0)),
          p_ip);

  return v_id_venta;
end $$;

grant execute on function sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet, jsonb, jsonb, jsonb, canal_venta, uuid) to authenticated;

-- 3. sp_anular_venta (partiendo de 00090)
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
         where id_item = r_det.id_item and estado_detalle = 'vendido';
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

-- 4. rf_finanzas_flujo (desde 00072) excluyendo cuenta_revendedora
create or replace function rf_finanzas_flujo(p_desde date, p_hasta date)
returns table (
  cobrado numeric,
  devuelto_clientes numeric,
  costo_cobro numeric,
  neto_cobros numeric,
  compras_mercaderia numeric,
  pagos_proveedores numeric,
  gastos numeric,
  flujo_neto numeric,
  por_acreditar jsonb
)
language plpgsql
security invoker
as $$
declare
  v_tenant_id uuid;
  v_cobrado numeric := 0;
  v_devuelto_clientes numeric := 0;
  v_costo_cobro numeric := 0;
  v_compras_mercaderia numeric := 0;
  v_pagos_proveedores numeric := 0;
  v_gastos numeric := 0;
  v_por_acreditar jsonb;
  v_zona text;
begin
  v_tenant_id := auth_tenant_id();
  select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;

  select
    coalesce(sum(pv.monto), 0) into v_cobrado
  from pago_venta pv
  where pv.id_tenant = v_tenant_id
    and pv.medio <> 'cuenta_revendedora'
    and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(rc.monto), 0) into v_devuelto_clientes
  from reintegro_cliente rc
  where rc.id_tenant = v_tenant_id
    and rc.medio <> 'cuenta_revendedora'
    and (rc.fecha at time zone v_zona)::date >= p_desde and (rc.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro
  from pago_venta pv
  where pv.id_tenant = v_tenant_id
    and pv.medio <> 'cuenta_revendedora'
    and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(cantidad * costo_unitario), 0) into v_compras_mercaderia
  from ingreso_mercaderia_detalle d
  join ingreso_mercaderia i on i.id_ingreso = d.id_ingreso
  where i.id_tenant = v_tenant_id
    and i.tipo_ingreso = 'compra'
    and i.confirmado = true
    and i.cancelado_at is null
    and (i.fecha at time zone v_zona)::date >= p_desde and (i.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(rp.monto_total), 0) into v_pagos_proveedores
  from rendicion_proveedor rp
  where rp.id_tenant = v_tenant_id and rp.estado = 'pagada' and (rp.fecha_pago at time zone v_zona)::date >= p_desde and (rp.fecha_pago at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(gn.monto), 0) into v_gastos
  from gasto_negocio gn
  where gn.id_tenant = v_tenant_id and (gn.fecha at time zone v_zona)::date >= p_desde and (gn.fecha at time zone v_zona)::date <= p_hasta;

  select jsonb_object_agg(t.tipo, coalesce(t.total, 0)) into v_por_acreditar
  from (
    select cd.tipo, sum(p.neto_acreditado) as total
    from pago_venta p
    join cuenta_destino cd on cd.id_cuenta_destino = p.id_cuenta_destino
    where p.id_tenant = v_tenant_id
      and p.medio <> 'cuenta_revendedora'
      and (p.fecha_acreditacion at time zone v_zona)::date > (now() at time zone v_zona)::date
    group by cd.tipo
  ) t;
  
  if v_por_acreditar is null then
    v_por_acreditar := '{}'::jsonb;
  end if;

  return query select
    v_cobrado,
    v_devuelto_clientes,
    v_costo_cobro,
    v_cobrado - v_devuelto_clientes - v_costo_cobro as neto_cobros,
    v_compras_mercaderia,
    v_pagos_proveedores,
    v_gastos,
    (v_cobrado - v_devuelto_clientes - v_costo_cobro) - v_compras_mercaderia - v_pagos_proveedores - v_gastos as flujo_neto,
    v_por_acreditar;
end;
$$;

grant execute on function rf_finanzas_flujo(date, date) to authenticated;

-- 5. rf_finanzas_resultados (desde 00091) excluyendo cuenta_revendedora de costo_cobro
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
begin
  v_tenant_id := auth_tenant_id();
  select zona_horaria into v_zona from tenant where id_tenant = v_tenant_id;

  select
    coalesce(sum(v.total), 0) into v_ventas_brutas
  from venta v
  where v.id_tenant = v_tenant_id and (v.fecha at time zone v_zona)::date >= p_desde and (v.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(v.total), 0) into v_anulaciones
  from venta v
  where v.id_tenant = v_tenant_id and (v.fecha_anulacion at time zone v_zona)::date >= p_desde and (v.fecha_anulacion at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(dv.monto), 0) into v_devoluciones
  from devolucion_venta dv
  where dv.id_tenant = v_tenant_id and (dv.fecha at time zone v_zona)::date >= p_desde and (dv.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(vl.costo), 0) into v_costo_mercaderia
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;
  
  declare
    v_costo_anuladas numeric := 0;
    v_costo_devueltas numeric := 0;
  begin
    select coalesce(sum(vl.costo), 0) into v_costo_anuladas
    from v_linea_venta vl
    where vl.id_tenant = v_tenant_id and (vl.fecha_anulacion at time zone v_zona)::date >= p_desde and (vl.fecha_anulacion at time zone v_zona)::date <= p_hasta;

    select coalesce(sum(vl.costo_recuperado), 0) into v_costo_devueltas
    from v_linea_venta vl
    where vl.id_tenant = v_tenant_id and (vl.fecha_devolucion at time zone v_zona)::date >= p_desde and (vl.fecha_devolucion at time zone v_zona)::date <= p_hasta;
    
    v_costo_mercaderia := v_costo_mercaderia - v_costo_anuladas - v_costo_devueltas;
  end;

  select
    coalesce(sum(pv.costo_cobro), 0) into v_costo_cobro
  from pago_venta pv
  where pv.id_tenant = v_tenant_id 
    and pv.medio <> 'cuenta_revendedora'
    and (pv.created_at at time zone v_zona)::date >= p_desde and (pv.created_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(cf.monto - cf.monto_pagado), 0) into v_incobrables
  from cuota_financiada cf
  where cf.id_tenant = v_tenant_id and cf.estado = 'incobrable' and (cf.fecha_incobrable at time zone v_zona)::date >= p_desde and (cf.fecha_incobrable at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(ip.costo_ingreso), 0) into v_bajas_inventario
  from item_producto ip
  where ip.id_tenant = v_tenant_id and ip.estado_item = 'baja' and (ip.updated_at at time zone v_zona)::date >= p_desde and (ip.updated_at at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(gn.monto), 0) into v_gastos
  from gasto_negocio gn
  where gn.id_tenant = v_tenant_id and (gn.fecha at time zone v_zona)::date >= p_desde and (gn.fecha at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(vl.comision), 0) into v_comision_liquidada
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;

  select
    coalesce(sum(vl.comision_estimada), 0) into v_comision_pendiente_estimada
  from v_linea_venta vl
  where vl.id_tenant = v_tenant_id and (vl.fecha_venta at time zone v_zona)::date >= p_desde and (vl.fecha_venta at time zone v_zona)::date <= p_hasta;

  select count(*) into v_cantidad_ventas
  from venta v
  where v.id_tenant = v_tenant_id and v.estado_venta = 'registrada' and (v.fecha at time zone v_zona)::date >= p_desde and (v.fecha at time zone v_zona)::date <= p_hasta;

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
