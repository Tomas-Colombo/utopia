-- 00060_incobrable_en_cascada.sql
-- UP: marcar una cuota como incobrable arrastra a las POSTERIORES del mismo
--     plan.
--
--     Motivo: la versión de 00059 daba por perdida una sola cuota, lo que
--     obligaba al operador a repetir la acción para cada una de las que
--     seguían. Y no es una decisión distinta: si el cliente no pagó la 3, la 4
--     no se va a cobrar sola. Marcarlas de a una dejaba el panel mostrando
--     deuda que ya se sabía irrecuperable, que es exactamente lo que se quería
--     sacar de ahí.
--
--     Qué NO arrastra:
--       - Las cuotas ANTERIORES. Si la 1 y la 2 se cobraron, se cobraron; y
--         si quedó una anterior impaga, es una decisión aparte (puede haber
--         un acuerdo por esa sola).
--       - Cuotas ya `pagada`, `incobrable` o `anulada`. Sólo se tocan las que
--         siguen abiertas.
--       - Otras VENTAS del mismo cliente. Se arrastra dentro del plan, no
--         dentro de la persona: que no pague una compra no prueba que no vaya
--         a pagar otra, y esa sí es una decisión que toma el operador.
--
--     Un solo gasto por el total, no uno por cuota: es UNA decisión de dar por
--     perdida una deuda, y N asientos por el mismo hecho ensucian el listado
--     de gastos sin agregar información.
--
--     La firma cambia de `returns uuid` a `returns jsonb` para poder informar
--     cuántas cuotas se arrastraron — con `create or replace` no se puede
--     cambiar el tipo de retorno, así que se dropea primero.
-- DOWN: al final, comentado.

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

  -- La elegida y todas las que le siguen en ESTE plan que sigan abiertas.
  --
  -- Se actualiza y se mide en UNA sola sentencia con `returning`, en vez de
  -- leer el conjunto y después escribirlo: entre las dos operaciones un cobro
  -- concurrente de la cuota 5 podría cambiar su saldo, y el gasto terminaría
  -- registrando plata que en realidad sí entró. El `update` bloquea justo las
  -- filas que toca y devuelve exactamente las que cambió.
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

  -- La categoría se crea la PRIMERA vez que el tenant da algo por perdido, no
  -- en la migración: sembrarla en todos los tenants llenaría el listado de
  -- gastos de una categoría vacía para los que nunca financian.
  --
  -- `on conflict` y no `if not exists`: entre el select y el insert, dos
  -- incobrables simultáneos del mismo tenant creaban la categoría dos veces y
  -- el segundo moría contra `categoria_gasto_tenant_nombre_uk`, tirando abajo
  -- la transacción entera — cuotas incluidas. El `do update` sobre el propio
  -- nombre es un no-op que existe sólo para que `returning` devuelva la fila
  -- gane o pierda la carrera.
  --
  -- El match es case-insensitive contra el índice: si el tenant ya tiene una
  -- categoría "incobrables" cargada a mano, se reutiliza esa.
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

  -- `sp_registrar_gasto` rechaza monto <= 0. Una cuota `parcial` ya cobrada
  -- por completo no puede existir (lo impide el check de 00059), así que el
  -- saldo siempre es > 0; el guard está por si el estado se corrompe.
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

-- ─── DOWN ────────────────────────────────────────────────────────────
--   drop function if exists sp_marcar_cuota_incobrable(uuid, text, inet);
--   -- (recrear la versión `returns uuid` de 00059)
