-- 00069_incobrables_sin_gasto.sql
-- UP:
-- - `sp_marcar_cuota_incobrable` ya NO registra `gasto_negocio`. El KPI de pérdida es
--   `sp_perdida_incobrable_venta`, no un gasto contable. Conserva la cascada de 00060.
-- - Se agrega un guard en `sp_marcar_cuota_incobrable` y `sp_cobrar_cuota` para impedir
--   accionar sobre cuotas de ventas anuladas, devolviendo `venta-anulada`.
-- DOWN:
-- - Restaura la creación de `gasto_negocio` en `sp_marcar_cuota_incobrable` (versión 00060).
-- - Quita el guard de `venta-anulada` de ambos.

-- ─── sp_cobrar_cuota ─────────────────────────────────────────────────

create or replace function sp_cobrar_cuota(
  p_id_cuota          uuid,
  p_monto             numeric,
  p_medio             medio_pago,
  p_id_cuenta_destino uuid,
  p_referencia        text default null,
  p_ip                inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_cuota      cuota_financiada;
  v_estado_venta estado_venta;
  v_saldo      numeric(14, 2);
  v_pagado     numeric(14, 2);
  v_estado     estado_cuota;
  v_cobro      jsonb;
  v_costo      numeric(14, 2);
  v_id_pago    uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select * into v_cuota from cuota_financiada
   where id_cuota_financiada = p_id_cuota and id_tenant = v_tenant
   for update;
  if v_cuota.id_cuota_financiada is null then
    raise exception 'cuota-not-found' using errcode = '42704';
  end if;

  select estado_venta into v_estado_venta from venta where id_venta = v_cuota.id_venta;
  if v_estado_venta = 'anulada' then
    raise exception 'venta-anulada' using errcode = '22023';
  end if;

  if v_cuota.estado not in ('pendiente', 'parcial') then
    raise exception 'cuota-no-cobrable: %', v_cuota.estado using errcode = '22023';
  end if;

  v_saldo := v_cuota.monto - v_cuota.monto_pagado;
  if p_monto is null or p_monto <= 0 then
    raise exception 'monto-invalido: %', p_monto using errcode = '22023';
  end if;
  if p_monto > v_saldo then
    raise exception 'monto-excede-saldo: % contra %', p_monto, v_saldo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from cuenta_destino
     where id_cuenta_destino = p_id_cuenta_destino
       and id_tenant = v_tenant and activo
  ) then
    raise exception 'cuenta-destino-invalida: %', p_id_cuenta_destino
      using errcode = '22023';
  end if;

  v_cobro := sp_calcular_costo_cobro(p_id_cuenta_destino, p_medio, null, p_monto);
  v_costo := (v_cobro->>'costo_total')::numeric;

  insert into pago_venta(
    id_tenant, id_venta, id_cuenta_destino, id_cuota_financiada,
    medio, monto, referencia,
    costo_cobro, neto_acreditado, fecha_acreditacion, desglose_costo
  ) values (
    v_tenant, v_cuota.id_venta, p_id_cuenta_destino, p_id_cuota,
    p_medio, p_monto, nullif(trim(coalesce(p_referencia, '')), ''),
    v_costo, p_monto - v_costo,
    current_date + (v_cobro->>'dias_acreditacion')::int,
    v_cobro
  )
  returning id_pago_venta into v_id_pago;

  v_pagado := v_cuota.monto_pagado + p_monto;
  v_estado := case when v_pagado >= v_cuota.monto then 'pagada' else 'parcial' end;

  update cuota_financiada
     set monto_pagado = v_pagado,
         estado       = v_estado,
         fecha_cobro  = case when v_estado = 'pagada' then now() else fecha_cobro end
   where id_cuota_financiada = p_id_cuota;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'cuota_financiada', p_id_cuota::text, 'editar',
          jsonb_build_object('cobrado', p_monto, 'medio', p_medio,
                             'acumulado', v_pagado, 'estado', v_estado),
          p_ip);
  return v_id_pago;
end $$;

grant execute on function sp_cobrar_cuota(uuid, numeric, medio_pago, uuid, text, inet)
  to authenticated;


-- ─── sp_marcar_cuota_incobrable ──────────────────────────────────────

drop function if exists sp_marcar_cuota_incobrable(uuid, text, inet);

create or replace function sp_marcar_cuota_incobrable(
  p_id_cuota uuid,
  p_motivo   text,
  p_ip       inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_cuota      cuota_financiada;
  v_estado_venta estado_venta;
  v_saldo      numeric(14, 2);
  v_afectadas  integer;
  v_desde      smallint;
  v_hasta      smallint;
  v_ids        uuid[];
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'motivo-requerido' using errcode = '22023';
  end if;

  select * into v_cuota from cuota_financiada
   where id_cuota_financiada = p_id_cuota and id_tenant = v_tenant
   for update;
  if v_cuota.id_cuota_financiada is null then
    raise exception 'cuota-not-found' using errcode = '42704';
  end if;

  select estado_venta into v_estado_venta from venta where id_venta = v_cuota.id_venta;
  if v_estado_venta = 'anulada' then
    raise exception 'venta-anulada' using errcode = '22023';
  end if;

  if v_cuota.estado not in ('pendiente', 'parcial') then
    raise exception 'cuota-no-incobrable: %', v_cuota.estado using errcode = '22023';
  end if;

  with actualizadas as (
    update cuota_financiada
       set estado                = 'incobrable',
           fecha_incobrable      = now(),
           id_usuario_incobrable = v_actor,
           motivo_incobrable     = trim(p_motivo)
     where id_tenant = v_tenant
       and id_venta  = v_cuota.id_venta
       and numero   >= v_cuota.numero
       and estado in ('pendiente', 'parcial')
    returning id_cuota_financiada, numero, monto - monto_pagado as saldo
  )
  select coalesce(sum(saldo), 0),
         count(*),
         min(numero),
         max(numero),
         array_agg(id_cuota_financiada)
    into v_saldo, v_afectadas, v_desde, v_hasta, v_ids
    from actualizadas;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'cuota_financiada', p_id_cuota::text, 'editar',
          jsonb_build_object('estado', 'incobrable',
                             'saldo_perdido', v_saldo,
                             'cuotas_afectadas', v_afectadas,
                             'desde', v_desde, 'hasta', v_hasta,
                             'ids', to_jsonb(v_ids),
                             'motivo', trim(p_motivo)),
          p_ip);

  return jsonb_build_object(
    'cuotas_afectadas', v_afectadas,
    'monto_total',      v_saldo,
    'desde',            v_desde,
    'hasta',            v_hasta
  );
end $$;

grant execute on function sp_marcar_cuota_incobrable(uuid, text, inet) to authenticated;

/*
-- DOWN:
drop function if exists sp_marcar_cuota_incobrable(uuid, text, inet);
create or replace function sp_marcar_cuota_incobrable(
  p_id_cuota uuid,
  p_motivo   text,
  p_ip       inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_cuota      cuota_financiada;
  v_saldo      numeric(14, 2);
  v_afectadas  integer;
  v_desde      smallint;
  v_hasta      smallint;
  v_ids        uuid[];
  v_id_cat     uuid;
  v_id_gasto   uuid;
  v_cliente    text;
  v_detalle    text;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_motivo is null or trim(p_motivo) = '' then
    raise exception 'motivo-requerido' using errcode = '22023';
  end if;

  select * into v_cuota from cuota_financiada
   where id_cuota_financiada = p_id_cuota and id_tenant = v_tenant
   for update;
  if v_cuota.id_cuota_financiada is null then
    raise exception 'cuota-not-found' using errcode = '42704';
  end if;
  if v_cuota.estado not in ('pendiente', 'parcial') then
    raise exception 'cuota-no-incobrable: %', v_cuota.estado using errcode = '22023';
  end if;

  with actualizadas as (
    update cuota_financiada
       set estado                = 'incobrable',
           fecha_incobrable      = now(),
           id_usuario_incobrable = v_actor,
           motivo_incobrable     = trim(p_motivo)
     where id_tenant = v_tenant
       and id_venta  = v_cuota.id_venta
       and numero   >= v_cuota.numero
       and estado in ('pendiente', 'parcial')
    returning id_cuota_financiada, numero, monto - monto_pagado as saldo
  )
  select coalesce(sum(saldo), 0),
         count(*),
         min(numero),
         max(numero),
         array_agg(id_cuota_financiada)
    into v_saldo, v_afectadas, v_desde, v_hasta, v_ids
    from actualizadas;

  insert into categoria_gasto(id_tenant, nombre, descripcion)
  values (v_tenant, 'Incobrables',
          'Cuotas financiadas que el cliente no pagó y se dieron por perdidas.')
  on conflict (id_tenant, lower(nombre))
    do update set nombre = categoria_gasto.nombre
  returning id_categoria_gasto into v_id_cat;

  select nombre_completo into v_cliente
    from cliente where id_cliente = v_cuota.id_cliente;

  v_detalle := case
    when v_afectadas = 1 then format('Cuota %s', v_desde)
    else format('Cuotas %s a %s', v_desde, v_hasta)
  end;

  if v_saldo > 0 then
    v_id_gasto := sp_registrar_gasto(
      v_id_cat,
      v_saldo,
      format('%s incobrable(s) — %s. %s',
             v_detalle, coalesce(v_cliente, 'cliente'), trim(p_motivo)),
      null,
      null,
      p_ip
    );
  end if;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'cuota_financiada', p_id_cuota::text, 'editar',
          jsonb_build_object('estado', 'incobrable',
                             'saldo_perdido', v_saldo,
                             'cuotas_afectadas', v_afectadas,
                             'desde', v_desde, 'hasta', v_hasta,
                             'ids', to_jsonb(v_ids),
                             'motivo', trim(p_motivo),
                             'id_gasto', v_id_gasto),
          p_ip);

  return jsonb_build_object(
    'id_gasto',         v_id_gasto,
    'cuotas_afectadas', v_afectadas,
    'monto_total',      v_saldo,
    'desde',            v_desde,
    'hasta',            v_hasta
  );
end $$;

grant execute on function sp_marcar_cuota_incobrable(uuid, text, inet) to authenticated;

create or replace function sp_cobrar_cuota(
  p_id_cuota          uuid,
  p_monto             numeric,
  p_medio             medio_pago,
  p_id_cuenta_destino uuid,
  p_referencia        text default null,
  p_ip                inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_cuota      cuota_financiada;
  v_saldo      numeric(14, 2);
  v_pagado     numeric(14, 2);
  v_estado     estado_cuota;
  v_cobro      jsonb;
  v_costo      numeric(14, 2);
  v_id_pago    uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select * into v_cuota from cuota_financiada
   where id_cuota_financiada = p_id_cuota and id_tenant = v_tenant
   for update;
  if v_cuota.id_cuota_financiada is null then
    raise exception 'cuota-not-found' using errcode = '42704';
  end if;
  if v_cuota.estado not in ('pendiente', 'parcial') then
    raise exception 'cuota-no-cobrable: %', v_cuota.estado using errcode = '22023';
  end if;

  v_saldo := v_cuota.monto - v_cuota.monto_pagado;
  if p_monto is null or p_monto <= 0 then
    raise exception 'monto-invalido: %', p_monto using errcode = '22023';
  end if;
  if p_monto > v_saldo then
    raise exception 'monto-excede-saldo: % contra %', p_monto, v_saldo
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from cuenta_destino
     where id_cuenta_destino = p_id_cuenta_destino
       and id_tenant = v_tenant and activo
  ) then
    raise exception 'cuenta-destino-invalida: %', p_id_cuenta_destino
      using errcode = '22023';
  end if;

  v_cobro := sp_calcular_costo_cobro(p_id_cuenta_destino, p_medio, null, p_monto);
  v_costo := (v_cobro->>'costo_total')::numeric;

  insert into pago_venta(
    id_tenant, id_venta, id_cuenta_destino, id_cuota_financiada,
    medio, monto, referencia,
    costo_cobro, neto_acreditado, fecha_acreditacion, desglose_costo
  ) values (
    v_tenant, v_cuota.id_venta, p_id_cuenta_destino, p_id_cuota,
    p_medio, p_monto, nullif(trim(coalesce(p_referencia, '')), ''),
    v_costo, p_monto - v_costo,
    current_date + (v_cobro->>'dias_acreditacion')::int,
    v_cobro
  )
  returning id_pago_venta into v_id_pago;

  v_pagado := v_cuota.monto_pagado + p_monto;
  v_estado := case when v_pagado >= v_cuota.monto then 'pagada' else 'parcial' end;

  update cuota_financiada
     set monto_pagado = v_pagado,
         estado       = v_estado,
         fecha_cobro  = case when v_estado = 'pagada' then now() else fecha_cobro end
   where id_cuota_financiada = p_id_cuota;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'cuota_financiada', p_id_cuota::text, 'editar',
          jsonb_build_object('cobrado', p_monto, 'medio', p_medio,
                             'acumulado', v_pagado, 'estado', v_estado),
          p_ip);
  return v_id_pago;
end $$;

grant execute on function sp_cobrar_cuota(uuid, numeric, medio_pago, uuid, text, inet)
  to authenticated;
*/
