-- 00027_rendicion_gasto_functions.sql
-- UP: sp_* de rendición (Etapa 7). Todos con audit + errcodes semánticos.
--
--   preview_rendicion(id_proveedor)          — SELECT read-only para el preview
--                                               (líneas pendientes del proveedor).
--   sp_excluir_detalle_rendicion(id_detalle)  — antes de confirmar la rendición
--                                               el dueño puede excluir líneas:
--                                               setea excluida_rendicion=true.
--                                               La línea NUNCA vuelve a aparecer.
--   sp_reincluir_detalle_rendicion(id_detalle) — undo del anterior (por si se
--                                               excluyó por error antes de generar).
--                                               Falla si la línea YA fue rendida.
--   sp_generar_rendicion(id_proveedor, obs)   — TX atómica: crea rendicion_proveedor,
--                                               setea id_rendicion en cada detalle_venta
--                                               pendiente (id_rendicion IS NULL AND
--                                               excluida_rendicion=false AND monto_prov>0),
--                                               calcula monto_total + periodo_desde/hasta.
--                                               Devuelve id_rendicion.
--                                               Falla si no hay líneas pendientes.
--   sp_marcar_rendicion_pagada(id_rendicion, fecha_pago) — cambia estado a pagada.
--   sp_registrar_gasto(id_cat, monto, descripcion, fecha, comprobante_ref) — alta auditada.
--   sp_set_presupuesto_categoria_gasto(id_cat, presupuesto) — set presupuesto mensual.

-- ─── PREVIEW (sin efectos) ───────────────────────────────────────────

create or replace function preview_rendicion(
  p_id_proveedor uuid
) returns table (
  id_detalle_venta uuid,
  id_venta         uuid,
  fecha            timestamptz,
  producto_nombre  text,
  producto_sku     text,
  qr_code          text,
  precio_venta     numeric,
  costo_snapshot   numeric,
  monto_proveedor  numeric,
  cliente_nombre   text
) language sql stable as $$
  select
    dv.id_detalle_venta,
    v.id_venta,
    v.fecha,
    p.nombre  as producto_nombre,
    p.sku     as producto_sku,
    ip.qr_code,
    dv.precio_venta,
    dv.costo_snapshot,
    dv.monto_proveedor,
    c.nombre  as cliente_nombre
  from detalle_venta dv
  join venta v          on v.id_venta = dv.id_venta
  join producto p       on p.id_producto = dv.id_producto
  join item_producto ip on ip.id_item = dv.id_item
  left join cliente c   on c.id_cliente = v.id_cliente
  where dv.id_tenant = auth_tenant_id()
    and dv.id_proveedor = p_id_proveedor
    and dv.id_rendicion is null
    and dv.excluida_rendicion = false
    and dv.monto_proveedor > 0
    and v.estado_venta = 'registrada'
  order by v.fecha asc;
$$;

-- ─── EXCLUIR / REINCLUIR ─────────────────────────────────────────────

create or replace function sp_excluir_detalle_rendicion(
  p_id_detalle uuid,
  p_motivo     text default null,
  p_ip         inet default null
) returns void language plpgsql as $$
declare
  v_tenant     uuid := auth_tenant_id();
  v_actor      uuid := auth.uid();
  v_rendida    boolean;
  v_excluida   boolean;
begin
  select id_rendicion is not null, excluida_rendicion
    into v_rendida, v_excluida
    from detalle_venta
   where id_detalle_venta = p_id_detalle and id_tenant = v_tenant
   for update;

  if not found then
    raise exception 'detalle-not-found' using errcode = '42704';
  end if;
  if v_rendida then
    raise exception 'detalle-ya-rendido' using errcode = '22023';
  end if;
  if v_excluida then
    return; -- idempotente
  end if;

  update detalle_venta set excluida_rendicion = true
   where id_detalle_venta = p_id_detalle;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'detalle_venta', p_id_detalle::text, 'excluir_rendicion',
          jsonb_build_object('motivo', p_motivo), p_ip);
end $$;

create or replace function sp_reincluir_detalle_rendicion(
  p_id_detalle uuid,
  p_ip         inet default null
) returns void language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_rendida  boolean;
  v_excluida boolean;
begin
  select id_rendicion is not null, excluida_rendicion
    into v_rendida, v_excluida
    from detalle_venta
   where id_detalle_venta = p_id_detalle and id_tenant = v_tenant
   for update;
  if not found then
    raise exception 'detalle-not-found' using errcode = '42704';
  end if;
  if v_rendida then
    raise exception 'detalle-ya-rendido' using errcode = '22023';
  end if;
  if not v_excluida then
    return; -- idempotente
  end if;

  update detalle_venta set excluida_rendicion = false
   where id_detalle_venta = p_id_detalle;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'detalle_venta', p_id_detalle::text, 'reincluir_rendicion',
          '{}'::jsonb, p_ip);
end $$;

-- ─── GENERAR RENDICIÓN (tx atómica) ──────────────────────────────────

create or replace function sp_generar_rendicion(
  p_id_proveedor  uuid,
  p_observaciones text default null,
  p_ip            inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_id       uuid;
  v_total    numeric(14, 2);
  v_count    integer;
  v_desde    timestamptz;
  v_hasta    timestamptz;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- Snapshot de agregados (con lock implícito por la RLS + luego UPDATE).
  -- Filtramos EXACTAMENTE por los criterios del instructivo §L45/L227:
  --   - proveedor
  --   - id_rendicion IS NULL
  --   - excluida_rendicion = false
  --   - monto_proveedor > 0
  --   - venta NO anulada
  select
    coalesce(sum(dv.monto_proveedor), 0),
    count(*),
    min(v.fecha),
    max(v.fecha)
  into v_total, v_count, v_desde, v_hasta
  from detalle_venta dv
  join venta v on v.id_venta = dv.id_venta
  where dv.id_tenant = v_tenant
    and dv.id_proveedor = p_id_proveedor
    and dv.id_rendicion is null
    and dv.excluida_rendicion = false
    and dv.monto_proveedor > 0
    and v.estado_venta = 'registrada';

  if v_count = 0 then
    raise exception 'sin-lineas-pendientes' using errcode = '22023';
  end if;

  -- Crear cabecera
  insert into rendicion_proveedor(
    id_tenant, id_proveedor, id_usuario_alta,
    periodo_desde, periodo_hasta,
    monto_total, cantidad_lineas, observaciones
  ) values (
    v_tenant, p_id_proveedor, v_actor,
    v_desde, v_hasta,
    v_total, v_count, p_observaciones
  ) returning id_rendicion into v_id;

  -- Setear id_rendicion en cada línea que matchee AHORA (misma tx).
  -- Si alguien entre el SELECT anterior y este UPDATE agregó otra
  -- línea, cae en esta rendición también — deseable (no perdemos plata).
  update detalle_venta dv
     set id_rendicion = v_id
   from venta v
   where v.id_venta = dv.id_venta
     and dv.id_tenant = v_tenant
     and dv.id_proveedor = p_id_proveedor
     and dv.id_rendicion is null
     and dv.excluida_rendicion = false
     and dv.monto_proveedor > 0
     and v.estado_venta = 'registrada';

  -- Recalcular total real (por si UPDATE tomó más líneas que el SELECT)
  select coalesce(sum(monto_proveedor), 0), count(*)
    into v_total, v_count
    from detalle_venta
   where id_rendicion = v_id;

  update rendicion_proveedor
     set monto_total = v_total, cantidad_lineas = v_count
   where id_rendicion = v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'rendicion_proveedor', v_id::text, 'generar',
          jsonb_build_object('id_proveedor', p_id_proveedor,
                             'monto_total', v_total,
                             'cantidad_lineas', v_count,
                             'periodo_desde', v_desde,
                             'periodo_hasta', v_hasta),
          p_ip);
  return v_id;
end $$;

-- ─── MARCAR PAGADA ───────────────────────────────────────────────────

create or replace function sp_marcar_rendicion_pagada(
  p_id_rendicion uuid,
  p_fecha_pago   timestamptz default null,
  p_ip           inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_estado estado_rendicion;
begin
  select estado into v_estado
    from rendicion_proveedor
   where id_rendicion = p_id_rendicion and id_tenant = v_tenant
   for update;
  if v_estado is null then
    raise exception 'rendicion-not-found' using errcode = '42704';
  end if;
  if v_estado = 'pagada' then
    return; -- idempotente
  end if;

  update rendicion_proveedor
     set estado = 'pagada',
         fecha_pago = coalesce(p_fecha_pago, now())
   where id_rendicion = p_id_rendicion;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'rendicion_proveedor', p_id_rendicion::text, 'marcar_pagada',
          jsonb_build_object('fecha_pago', coalesce(p_fecha_pago, now())),
          p_ip);
end $$;

-- ─── GASTOS ──────────────────────────────────────────────────────────

create or replace function sp_registrar_gasto(
  p_id_categoria_gasto uuid,
  p_monto              numeric,
  p_descripcion        text,
  p_fecha              timestamptz default null,
  p_comprobante_ref    text default null,
  p_ip                 inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'monto-invalido' using errcode = '22023';
  end if;
  if p_descripcion is null or trim(p_descripcion) = '' then
    raise exception 'descripcion-requerida' using errcode = '22023';
  end if;

  insert into gasto_negocio(id_tenant, id_categoria_gasto, id_usuario_alta,
                             fecha, monto, descripcion, comprobante_ref)
  values (v_tenant, p_id_categoria_gasto, v_actor,
          coalesce(p_fecha, now()), p_monto, p_descripcion, p_comprobante_ref)
  returning id_gasto into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'gasto_negocio', v_id::text, 'crear',
          jsonb_build_object('id_categoria_gasto', p_id_categoria_gasto,
                             'monto', p_monto,
                             'descripcion', p_descripcion),
          p_ip);
  return v_id;
end $$;

create or replace function sp_set_presupuesto_categoria_gasto(
  p_id_categoria uuid,
  p_presupuesto  numeric,  -- null = quita presupuesto
  p_ip           inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_prev   numeric;
begin
  select presupuesto_mensual into v_prev
    from categoria_gasto
   where id_categoria_gasto = p_id_categoria and id_tenant = v_tenant
   for update;
  if not found then
    raise exception 'categoria-not-found' using errcode = '42704';
  end if;

  update categoria_gasto
     set presupuesto_mensual = p_presupuesto
   where id_categoria_gasto = p_id_categoria;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'categoria_gasto', p_id_categoria::text, 'set_presupuesto',
          jsonb_build_object('presupuesto_anterior', v_prev,
                             'presupuesto_nuevo', p_presupuesto),
          p_ip);
end $$;

grant execute on function preview_rendicion(uuid) to authenticated;
grant execute on function sp_excluir_detalle_rendicion(uuid, text, inet) to authenticated;
grant execute on function sp_reincluir_detalle_rendicion(uuid, inet) to authenticated;
grant execute on function sp_generar_rendicion(uuid, text, inet) to authenticated;
grant execute on function sp_marcar_rendicion_pagada(uuid, timestamptz, inet) to authenticated;
grant execute on function sp_registrar_gasto(uuid, numeric, text, timestamptz, text, inet) to authenticated;
grant execute on function sp_set_presupuesto_categoria_gasto(uuid, numeric, inet) to authenticated;

-- DOWN block:
--   drop function if exists sp_set_presupuesto_categoria_gasto(uuid, numeric, inet);
--   drop function if exists sp_registrar_gasto(uuid, numeric, text, timestamptz, text, inet);
--   drop function if exists sp_marcar_rendicion_pagada(uuid, timestamptz, inet);
--   drop function if exists sp_generar_rendicion(uuid, text, inet);
--   drop function if exists sp_reincluir_detalle_rendicion(uuid, inet);
--   drop function if exists sp_excluir_detalle_rendicion(uuid, text, inet);
--   drop function if exists preview_rendicion(uuid);
