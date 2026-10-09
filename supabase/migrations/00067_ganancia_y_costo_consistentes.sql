-- 00067_ganancia_y_costo_consistentes.sql
-- UP: Slice 2 - Ganancia correcta

-- 1. Corregir datos existentes para que pasen los CHECKs
update detalle_venta
   set monto_ganancia = precio_venta - costo_snapshot
 where monto_ganancia <> (precio_venta - costo_snapshot);

update detalle_venta
   set monto_proveedor = 0
 where tipo_ingreso_snapshot = 'compra' and monto_proveedor <> 0
   and id_rendicion is null;

update detalle_venta
   set monto_proveedor = costo_snapshot
 where tipo_ingreso_snapshot = 'consignacion' and monto_proveedor <> costo_snapshot
   and id_rendicion is null;

-- 2. Imponer las reglas
alter table detalle_venta
  add constraint detalle_venta_monto_ganancia_check
  check (monto_ganancia = precio_venta - costo_snapshot);

alter table detalle_venta drop constraint if exists detalle_venta_monto_proveedor_check;
-- Se marca NOT VALID porque las líneas ya rendidas mantienen su monto_proveedor histórico y pueden violar esta regla
alter table detalle_venta
  add constraint detalle_venta_monto_proveedor_check
  check (
    (tipo_ingreso_snapshot = 'compra' and monto_proveedor = 0) or
    (tipo_ingreso_snapshot = 'consignacion' and monto_proveedor = costo_snapshot)
  ) not valid;

-- 3. Redefinir sp_registrar_venta con el cálculo correcto
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
    v_monto_gan := v_precio - v_costo;

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

/* -- DOWN
alter table detalle_venta drop constraint if exists detalle_venta_monto_ganancia_check;
alter table detalle_venta drop constraint if exists detalle_venta_monto_proveedor_check;
alter table detalle_venta
  add constraint detalle_venta_monto_proveedor_check
  check (monto_proveedor >= 0);

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
    -- OLD LOGIC
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
*/
