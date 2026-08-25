-- 00064_precio_por_financiador.sql
-- UP: el precio deja de resolverse sólo por `forma_pago` y pasa a depender
--     también de QUIÉN financia.
--
--     00063 creó `recargo_cuotas`. Esta migración la enchufa: el motor de
--     precios deja de leer los recargos de `regla_precio` y empieza a
--     resolverlos por (cuotas, cuenta, medio, propia).
--
--     ─── Qué NO se toca ───────────────────────────────────────────────
--     Nada se borra. Es deliberado y es lo que hace esta migración segura
--     sobre una base con datos reales:
--
--       · `tipo_regla` conserva el valor 'recargo'. Postgres no tiene DROP
--         VALUE en enums: sacarlo obliga a recrear el tipo y reescribir cada
--         columna que lo usa, y cualquier fila que todavía lo diga frena la
--         migración a mitad de camino.
--       · `regla_precio.forma_pago` se queda donde está. Los recargos viejos
--         siguen en su tabla, legibles, aunque ya nadie los lea al precificar.
--       · `resolver_regla_recargo` NO se dropea. Queda sin llamadores, pero
--         es lo único que permite releer por qué una venta anterior a esta
--         migración salió al precio que salió.
--       · `venta.forma_pago` sigue siendo la columna que dice cómo se preció
--         la venta. Las columnas nuevas la COMPLEMENTAN, no la reemplazan:
--         toda venta anterior las tiene en NULL y su forma_pago intacta.
--
--     ─── Lo que sí cambia de firma ────────────────────────────────────
--     Los dos SP se recrean con parámetros nuevos. No alcanza con agregar
--     defaults dejando la versión vieja viva: quedarían dos overloads y una
--     llamada de 3 argumentos sería ambigua ("function is not unique").
--     El drop y el create van en la misma transacción, así que no existe un
--     instante con la función ausente.
-- DOWN: al final, comentado.

-- ─── Auditoría del recargo en la venta ───────────────────────────────
-- Sin esto, `venta.forma_pago = 'cuotas_3'` no alcanza para explicar el
-- precio: hay un recargo por cada financiador, y cuál se aplicó es
-- irrecuperable después. Ambas NULL en todo lo ya registrado — que es lo
-- honesto, porque en esas ventas el financiador no existía como concepto.

alter table venta
  add column if not exists id_cuenta_recargo uuid
    references cuenta_destino(id_cuenta_destino) on delete set null,
  add column if not exists medio_recargo medio_pago;

comment on column venta.id_cuenta_recargo is
  'Cuenta cuyo recargo por cuotas se aplicó al precificar. NULL = comodín, '
  'financiación propia, o venta anterior a 00064. NO es dónde entró la plata: '
  'eso es pago_venta.id_cuenta_destino, y pueden diferir si el cliente '
  'terminó pagando por otro lado.';

-- ─── sp_calcular_precio_venta_snapshot ───────────────────────────────

drop function if exists sp_calcular_precio_venta_snapshot(uuid, forma_pago, uuid[]);

create or replace function sp_calcular_precio_venta_snapshot(
  p_id_producto    uuid,
  p_forma_pago     forma_pago default 'efectivo',
  p_ids_descuentos uuid[] default '{}',
  -- Quién financia. Define QUÉ recargo por cuotas aplica (00063): Mercado
  -- Pago en 3 y el posnet del banco en 3 no cuestan lo mismo. Todos con
  -- default, para que una llamada de 3 argumentos siga resolviendo el
  -- comodín — que es exactamente el comportamiento anterior.
  p_id_cuenta_destino uuid default null,
  p_medio             medio_pago default null,
  p_propia            boolean default false
) returns jsonb language plpgsql stable as $$
declare
  v_tenant         uuid := auth_tenant_id();
  v_precio_lista   numeric;
  v_desactualizado boolean;
  v_id_categoria   uuid;
  v_id_proveedor   uuid;
  v_desc           regla_precio;
  v_id             uuid;
  v_aplica         boolean;
  v_monto          numeric;
  v_desc_total     numeric := 0;   -- suma de impactos (siempre en $)
  v_recargo        recargo_cuotas;
  v_cuotas         smallint;
  v_recargo_monto  numeric;
  v_precio_desc    numeric;
  v_precio_final   numeric;
  v_descuentos     jsonb := '[]'::jsonb;
  v_desglose       jsonb := '{}'::jsonb;
begin
  select precio_venta, precio_venta_desactualizado, id_categoria
    into v_precio_lista, v_desactualizado, v_id_categoria
    from producto
   where id_producto = p_id_producto and id_tenant = v_tenant;

  if v_precio_lista is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'sin-precio-lista',
      'requiere_recalcular', true
    );
  end if;

  -- Proveedor del último ingreso (misma lógica que la cascada de margen).
  select im.id_proveedor into v_id_proveedor
    from ingreso_mercaderia im
    join item_producto ip on ip.id_ingreso = im.id_ingreso
   where ip.id_producto = p_id_producto
   order by im.fecha desc
   limit 1;

  -- Descuentos elegidos por el vendedor. Se validan uno a uno; los que no
  -- son válidos para este producto se ignoran en silencio (ej. un descuento
  -- de categoría pasado a un producto de otra categoría).
  if p_ids_descuentos is not null then
    foreach v_id in array p_ids_descuentos loop
      select * into v_desc from regla_precio
       where id_regla = v_id
         and id_tenant = v_tenant
         and tipo_regla = 'descuento'
         and fecha_baja is null
         and (fecha_inicio is null or fecha_inicio <= now())
         and (fecha_hasta  is null or fecha_hasta  >= now());
      if v_desc.id_regla is null then continue; end if;

      v_aplica := (v_desc.alcance = 'global')
        or (v_desc.alcance = 'producto'  and v_desc.id_producto  = p_id_producto)
        or (v_desc.alcance = 'categoria' and v_desc.id_categoria = v_id_categoria)
        or (v_desc.alcance = 'proveedor' and v_desc.id_proveedor = v_id_proveedor);
      if not v_aplica then continue; end if;

      if v_desc.tipo_valor = 'porcentaje' then
        v_monto := round(v_precio_lista * v_desc.valor, 2);
      else
        v_monto := round(v_desc.valor, 2);
      end if;
      v_desc_total := v_desc_total + v_monto;

      v_descuentos := v_descuentos || jsonb_build_array(jsonb_build_object(
        'id_regla',   v_desc.id_regla,
        'nombre',     v_desc.nombre,
        'alcance',    v_desc.alcance,
        'tipo_valor', v_desc.tipo_valor,
        'valor',      v_desc.valor,
        'acumulable', v_desc.acumulable,
        'monto',      v_monto
      ));
    end loop;
  end if;

  v_precio_desc := v_precio_lista - v_desc_total;
  if v_precio_desc < 0 then v_precio_desc := 0; end if;

  v_desglose := jsonb_build_object('descuentos', v_descuentos);

  -- ─── Recargo por cuotas (después del descuento) ───────────────────
  -- Ya no sale de `regla_precio`: sale de `recargo_cuotas` (00063), resuelto
  -- por (cuotas, financiador). `resolver_regla_recargo` queda sin llamadores
  -- pero NO se dropea — las reglas viejas siguen en su tabla, y esa función
  -- es la única forma de releerlas si hay que auditar un precio anterior a
  -- esta migración.
  --
  -- Desaparece el corte por `p_forma_pago = 'efectivo'`: una venta sin cuotas
  -- no tiene plan que resolver, así que v_cuotas queda NULL y
  -- resolver_recargo_cuotas devuelve NULL sin siquiera tocar la tabla. El
  -- corte viejo además hacía que un recargo cargado para efectivo no se
  -- aplicara nunca, sin decirlo.
  v_cuotas := nullif(substring(p_forma_pago::text from '^cuotas_(\d+)$'), '')::smallint;
  select * into v_recargo
    from resolver_recargo_cuotas(v_cuotas, p_id_cuenta_destino, p_medio, p_propia);

  if v_recargo.id_recargo_cuotas is null then
    v_precio_final := v_precio_desc;
  else
    -- En 'porcentaje' el valor es 10.000 para +10% (convención del arancel,
    -- ver cabecera de 00063). De ahí el /100 que el modelo viejo no tenía:
    -- regla_precio guardaba 0.1000 para lo mismo.
    v_recargo_monto := case v_recargo.tipo_valor
                         when 'porcentaje' then round(v_precio_desc * v_recargo.valor / 100, 2)
                         else round(v_recargo.valor, 2)
                       end;
    v_precio_final := v_precio_desc + v_recargo_monto;

    -- La CLAVE se mantiene: las ventas ya registradas guardan su snapshot con
    -- este nombre y renombrarla dejaría ilegible el desglose del historial.
    -- Lo que cambia es el identificador de adentro — antes `id_regla`, ahora
    -- `id_recargo_cuotas` — así que los lectores toleran los dos.
    v_desglose := v_desglose || jsonb_build_object(
      'recargo_forma_pago',
      jsonb_build_object('id_recargo_cuotas', v_recargo.id_recargo_cuotas,
                         'tipo_valor', v_recargo.tipo_valor,
                         'valor', v_recargo.valor,
                         'forma_pago', p_forma_pago,
                         'propia', p_propia,
                         'id_cuenta_destino', v_recargo.id_cuenta_destino,
                         'medio', v_recargo.medio,
                         'monto', v_recargo_monto)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'precio_lista', v_precio_lista,
    'precio_final', round(v_precio_final::numeric, 2),
    'forma_pago', p_forma_pago,
    'desactualizado', v_desactualizado,
    'desglose', v_desglose
  );
end $$;

-- ─── sp_registrar_venta ──────────────────────────────────────────────
-- Mismo cuerpo que 00059, con cuatro cambios: recibe el financiador, lo
-- guarda en la venta, se lo pasa al snapshot de precio, y — cuando no hay
-- detalle de cobranza — manda el pago por defecto a la cuenta que se eligió
-- al precificar en vez de a la predeterminada. Ese último es el que hace que
-- elegir "Mercado Pago en 3" arriba deje la plata en Mercado Pago abajo, sin
-- que el vendedor lo repita.

drop function if exists sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet, jsonb, jsonb);

create or replace function sp_registrar_venta(
  p_lineas       jsonb,
  p_forma_pago   forma_pago default 'efectivo',
  p_id_cliente   uuid default null,
  p_id_reserva   uuid default null,
  p_observaciones text default null,
  p_ip           inet default null,
  -- [{ medio, id_cuenta_destino, monto, cuotas?, monto_recibido?, referencia? }, ...]
  -- NULL o vacío = un solo pago por el total contra la cuenta predeterminada.
  p_pagos        jsonb default null,
  -- { cuotas: 6, primer_vencimiento: '2026-09-10' }
  -- NULL = venta sin financiación propia. Si viene, lo que no cubran los
  -- pagos del día queda como deuda del cliente.
  p_financiacion jsonb default null,
  -- { id_cuenta_destino, medio, propia } — QUIÉN financia esta venta. Es lo
  -- que resuelve el recargo por cuotas (00063). NULL = sin financiador
  -- declarado: se resuelve contra el comodín, que es como se comportaba
  -- todo antes de 00063.
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
  -- Cobro (00057)
  v_medio      medio_pago;
  v_cuotas     smallint;
  v_cobro      jsonb;
  v_costo_cobro numeric(14, 2);
  -- Financiación propia (00059)
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

  -- Se valida ANTES de tocar stock: si falta el cliente, la venta no puede
  -- existir, y descubrirlo después de marcar los ítems como vendidos obliga a
  -- deshacer media transacción.
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

  -- Financiador declarado por la UI. Con financiación propia se ignora el
  -- procesador: el check de recargo_cuotas garantiza que esas filas no lo
  -- tienen, y aceptarlo acá haría que el resolver buscara una fila imposible.
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

  -- ─── Cobranza ──────────────────────────────────────────────────────
  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    -- Sin detalle de cobranza: un pago por el total contra la predeterminada.
    -- Con financiación propia NO se genera: lo que no se pagó hoy es deuda.
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

  -- ─── Financiación propia ───────────────────────────────────────────
  if p_financiacion is not null then
    v_a_financiar := v_total - v_pagado;
    if v_a_financiar <= 0 then
      raise exception 'financiacion-sin-saldo: pagado % contra total %',
        v_pagado, v_total using errcode = '22023';
    end if;

    -- El residuo del redondeo va TODO a la última cuota. Repartirlo o
    -- ignorarlo deja la suma de cuotas distinta del saldo, y a partir de ahí
    -- todo reporte de deuda arrastra centavos que nadie puede explicar.
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

    -- Cinturón y tiradores: la suma de cuotas más lo cobrado hoy TIENE que
    -- dar el total. Si no, hay un bug de redondeo y es mejor abortar que
    -- persistir una deuda que no cierra.
    if v_pagado + v_acumulado <> v_total then
      raise exception 'financiacion-no-cuadra: % + % contra %',
        v_pagado, v_acumulado, v_total using errcode = '22023';
    end if;

  elsif p_pagos is not null and jsonb_array_length(p_pagos) > 0 then
    -- Sin financiación, la cobranza tiene que cerrar contra el total. Un pago
    -- mixto que no suma el total es plata que no sabés dónde está.
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

grant execute on function sp_calcular_precio_venta_snapshot(
  uuid, forma_pago, uuid[], uuid, medio_pago, boolean
) to authenticated;

grant execute on function sp_registrar_venta(
  jsonb, forma_pago, uuid, uuid, text, inet, jsonb, jsonb, jsonb
) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- DOWN
-- ─────────────────────────────────────────────────────────────────────
--   drop function if exists sp_registrar_venta(jsonb, forma_pago, uuid, uuid, text, inet, jsonb, jsonb, jsonb);
--   drop function if exists sp_calcular_precio_venta_snapshot(uuid, forma_pago, uuid[], uuid, medio_pago, boolean);
--   -- (recrear las versiones de 00059 y 00046 antes de seguir)
--   alter table venta drop column if exists medio_recargo;
--   alter table venta drop column if exists id_cuenta_recargo;
