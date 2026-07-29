-- 00019_precios_functions.sql
-- UP: sp_* del motor de precios (Planificacion.txt Etapa 4).
--   - resolver_regla_margen / resolver_regla_recargo / resolver_reglas_descuento
--     (cascada producto > categoria > proveedor > global; §31, §63)
--   - sp_recalcular_precio_venta (fija producto.precio_venta = costo × (1+margen);
--     §80, RF-07)
--   - sp_calcular_precio_venta_snapshot (resuelve precio final para una venta
--     dada forma de pago + descuentos aplicables; devuelve JSON snapshot para
--     que la venta guarde el precio efectivo y el desglose)
--   - sp_create_regla_precio / sp_baja_regla_precio (mutaciones auditadas)
--   - Actualiza sp_set_costo_producto para marcar producto desactualizado.
-- DOWN: (drops en orden inverso al final del archivo)

-- ─────────────────────────────────────────────────────────────────
-- HELPERS DE CASCADA
-- Devuelven UNA regla (la más específica) o NULL. Especificidad:
--   producto (4) > categoria (3) > proveedor (2) > global (1).
-- Desempate: prioridad DESC, updated_at DESC.
-- Filtros: fecha_baja IS NULL, vigencia actual (fecha_inicio/hasta),
--          tenant actual.
-- ─────────────────────────────────────────────────────────────────

create or replace function resolver_regla_margen(
  p_id_producto uuid
) returns regla_precio language sql stable as $$
  with p as (
    select pr.id_producto, pr.id_categoria, pr.id_tenant,
           (select id_proveedor
              from ingreso_mercaderia im
              join item_producto ip on ip.id_ingreso = im.id_ingreso
             where ip.id_producto = pr.id_producto
             order by im.fecha desc
             limit 1) as id_proveedor
      from producto pr
     where pr.id_producto = p_id_producto
  )
  select r.*
    from regla_precio r, p
   where r.id_tenant = auth_tenant_id()
     and r.tipo_regla = 'margen'
     and r.fecha_baja is null
     and (r.fecha_inicio is null or r.fecha_inicio <= now())
     and (r.fecha_hasta  is null or r.fecha_hasta  >= now())
     and (
       (r.alcance = 'producto'  and r.id_producto  = p.id_producto)
       or (r.alcance = 'categoria' and r.id_categoria = p.id_categoria)
       or (r.alcance = 'proveedor' and r.id_proveedor = p.id_proveedor)
       or (r.alcance = 'global')
     )
   order by
     case r.alcance
       when 'producto' then 4
       when 'categoria' then 3
       when 'proveedor' then 2
       when 'global' then 1
     end desc,
     r.prioridad desc,
     r.updated_at desc
   limit 1;
$$;

create or replace function resolver_regla_recargo(
  p_id_producto uuid,
  p_forma_pago  forma_pago
) returns regla_precio language sql stable as $$
  with p as (
    select pr.id_producto, pr.id_categoria, pr.id_tenant,
           (select id_proveedor
              from ingreso_mercaderia im
              join item_producto ip on ip.id_ingreso = im.id_ingreso
             where ip.id_producto = pr.id_producto
             order by im.fecha desc
             limit 1) as id_proveedor
      from producto pr
     where pr.id_producto = p_id_producto
  )
  select r.*
    from regla_precio r, p
   where r.id_tenant = auth_tenant_id()
     and r.tipo_regla = 'recargo'
     and r.forma_pago = p_forma_pago
     and r.fecha_baja is null
     and (r.fecha_inicio is null or r.fecha_inicio <= now())
     and (r.fecha_hasta  is null or r.fecha_hasta  >= now())
     and (
       (r.alcance = 'producto'  and r.id_producto  = p.id_producto)
       or (r.alcance = 'categoria' and r.id_categoria = p.id_categoria)
       or (r.alcance = 'proveedor' and r.id_proveedor = p.id_proveedor)
       or (r.alcance = 'global')
     )
   order by
     case r.alcance
       when 'producto' then 4 when 'categoria' then 3
       when 'proveedor' then 2 when 'global' then 1
     end desc,
     r.prioridad desc,
     r.updated_at desc
   limit 1;
$$;

-- Descuentos: pueden ser varios acumulables (Etapa 4 §84). Devuelve
-- setof — la aplicación decide el modo de acumulación (por defecto
-- suma de porcentajes; sp_calcular_precio_venta_snapshot implementa
-- "un descuento por alcance, mejor gana; luego se suman los alcances").
create or replace function resolver_reglas_descuento(
  p_id_producto uuid
) returns setof regla_precio language sql stable as $$
  with p as (
    select pr.id_producto, pr.id_categoria, pr.id_tenant,
           (select id_proveedor
              from ingreso_mercaderia im
              join item_producto ip on ip.id_ingreso = im.id_ingreso
             where ip.id_producto = pr.id_producto
             order by im.fecha desc
             limit 1) as id_proveedor
      from producto pr
     where pr.id_producto = p_id_producto
  ),
  candidatos as (
    select r.*
      from regla_precio r, p
     where r.id_tenant = auth_tenant_id()
       and r.tipo_regla = 'descuento'
       and r.fecha_baja is null
       and (r.fecha_inicio is null or r.fecha_inicio <= now())
       and (r.fecha_hasta  is null or r.fecha_hasta  >= now())
       and (
         (r.alcance = 'producto'  and r.id_producto  = p.id_producto)
         or (r.alcance = 'categoria' and r.id_categoria = p.id_categoria)
         or (r.alcance = 'proveedor' and r.id_proveedor = p.id_proveedor)
         or (r.alcance = 'global')
       )
  ),
  -- Un descuento GANADOR por alcance (el de más prioridad).
  ganadores as (
    select distinct on (alcance) *
      from candidatos
     order by alcance, prioridad desc, updated_at desc
  )
  select * from ganadores;
$$;

-- ─────────────────────────────────────────────────────────────────
-- RECALCULAR PRECIO DE VENTA (RF-07). Fija producto.precio_venta
-- aplicando la regla de margen resuelta contra el costo vigente.
-- Devuelve el nuevo precio (o null si no hay margen / no hay costo).
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_recalcular_precio_venta(
  p_id_producto uuid,
  p_ip inet default null
) returns numeric language plpgsql as $$
declare
  v_tenant       uuid := auth_tenant_id();
  v_actor        uuid := auth.uid();
  v_costo        numeric;
  v_regla        regla_precio;
  v_precio_ant   numeric;
  v_precio_nuevo numeric;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select costo into v_costo
    from costo_producto
   where id_producto = p_id_producto and vigente_hasta is null;

  if v_costo is null then
    -- Sin costo vigente no hay precio calculable — marcar desactualizado y salir.
    update producto
       set precio_venta = null,
           id_regla_margen_aplicada = null,
           precio_venta_resuelto_at = now(),
           precio_venta_desactualizado = true
     where id_producto = p_id_producto and id_tenant = v_tenant;
    return null;
  end if;

  select * into v_regla from resolver_regla_margen(p_id_producto);

  select precio_venta into v_precio_ant
    from producto where id_producto = p_id_producto;

  if v_regla.id_regla is null then
    -- Sin regla de margen: precio = costo (0% margen). Marca desactualizado
    -- FALSE porque respetó la (no)regla; el operador puede definir la regla
    -- después y volver a recalcular.
    v_precio_nuevo := v_costo;
  elsif v_regla.tipo_valor = 'porcentaje' then
    v_precio_nuevo := v_costo * (1 + v_regla.valor);
  else
    v_precio_nuevo := v_costo + v_regla.valor;
  end if;

  update producto
     set precio_venta = v_precio_nuevo,
         id_regla_margen_aplicada = v_regla.id_regla,
         precio_venta_resuelto_at = now(),
         precio_venta_desactualizado = false
   where id_producto = p_id_producto and id_tenant = v_tenant;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'producto', p_id_producto::text, 'recalcular_precio',
          jsonb_build_object(
            'precio_anterior', v_precio_ant,
            'precio_nuevo', v_precio_nuevo,
            'costo', v_costo,
            'id_regla_margen', v_regla.id_regla,
            'tipo_valor', v_regla.tipo_valor,
            'valor', v_regla.valor
          ),
          p_ip);

  return v_precio_nuevo;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- Marcar productos como desactualizados. Llamado desde
-- sp_set_costo_producto y también manualmente cuando se crea/modifica
-- una regla de margen.
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_marcar_precio_desactualizado_by_producto(
  p_id_producto uuid
) returns void language sql as $$
  update producto
     set precio_venta_desactualizado = true
   where id_producto = p_id_producto and id_tenant = auth_tenant_id();
$$;

create or replace function sp_marcar_precio_desactualizado_by_regla(
  p_id_regla uuid
) returns integer language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_regla  regla_precio;
  v_count  integer := 0;
begin
  select * into v_regla from regla_precio
    where id_regla = p_id_regla and id_tenant = v_tenant;
  if v_regla.id_regla is null then return 0; end if;

  -- Solo reglas de margen impactan precio_venta. Descuento/recargo se
  -- resuelven en venta.
  if v_regla.tipo_regla <> 'margen' then return 0; end if;

  if v_regla.alcance = 'producto' then
    update producto set precio_venta_desactualizado = true
     where id_producto = v_regla.id_producto and id_tenant = v_tenant;
    get diagnostics v_count = row_count;
  elsif v_regla.alcance = 'categoria' then
    update producto set precio_venta_desactualizado = true
     where id_categoria = v_regla.id_categoria and id_tenant = v_tenant;
    get diagnostics v_count = row_count;
  else
    -- proveedor / global: marca todos los productos del tenant (barrida).
    -- Los proveedores no están mapeados directamente en producto — es un
    -- catch-all seguro.
    update producto set precio_venta_desactualizado = true
     where id_tenant = v_tenant;
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- Reemplaza sp_set_costo_producto (00016) para marcar producto
-- desactualizado. Preserva firma y comportamiento anterior.
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_set_costo_producto(
  p_id_producto uuid,
  p_costo       numeric,
  p_moneda      text default 'ARS',
  p_motivo      text default null,
  p_ip          inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_id       uuid;
  v_previous numeric;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  update costo_producto
     set vigente_hasta = now()
   where id_producto = p_id_producto
     and vigente_hasta is null
  returning costo into v_previous;

  insert into costo_producto(id_tenant, id_producto, costo, moneda,
                             id_usuario_alta, motivo)
  values (v_tenant, p_id_producto, p_costo, coalesce(p_moneda, 'ARS'),
          v_actor, p_motivo)
  returning id_costo into v_id;

  -- Diferencia vs 00016: marcar producto desactualizado (Etapa 4 decisión
  -- "recalcular manual — no silencioso").
  perform sp_marcar_precio_desactualizado_by_producto(p_id_producto);

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'costo_producto', v_id::text, 'crear',
          jsonb_build_object('id_producto', p_id_producto,
                             'costo_anterior', v_previous,
                             'costo_nuevo', p_costo,
                             'moneda', coalesce(p_moneda, 'ARS'),
                             'motivo', p_motivo),
          p_ip);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- SNAPSHOT DE PRECIO DE VENTA. Se llama en el momento de la venta
-- (Etapa 5 lo usará). Devuelve JSON con precio final + desglose. NO
-- persiste — sólo calcula. La venta guarda el resultado en
-- detalle_venta.precio_venta (Etapa 5).
--
-- Regla de acumulación de descuentos (definida acá para ser explícita):
--   - un ganador por alcance (mayor prioridad)
--   - se SUMAN los porcentajes de los ganadores (max 100%)
--   - descuentos de monto_fijo se restan al final, en orden de alcance
--     más específico primero.
-- Recargo por forma de pago se aplica DESPUÉS de descuentos, sobre el
-- precio ya descontado (evita que un descuento del 20% "coma" el
-- recargo del 15%).
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_calcular_precio_venta_snapshot(
  p_id_producto uuid,
  p_forma_pago  forma_pago default 'efectivo'
) returns jsonb language plpgsql stable as $$
declare
  v_precio_lista numeric;
  v_desactualizado boolean;
  v_desc_pct  numeric := 0;
  v_desc_fijo numeric := 0;
  v_desc      regla_precio;
  v_recargo   regla_precio;
  v_precio_desc numeric;
  v_precio_final numeric;
  v_desglose jsonb := '{}'::jsonb;
begin
  select precio_venta, precio_venta_desactualizado
    into v_precio_lista, v_desactualizado
    from producto
   where id_producto = p_id_producto and id_tenant = auth_tenant_id();

  if v_precio_lista is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'sin-precio-lista',
      'requiere_recalcular', true
    );
  end if;

  -- Descuentos (suma de % ganadores; monto_fijo se resta después)
  for v_desc in select * from resolver_reglas_descuento(p_id_producto) loop
    if v_desc.tipo_valor = 'porcentaje' then
      v_desc_pct := v_desc_pct + v_desc.valor;
    else
      v_desc_fijo := v_desc_fijo + v_desc.valor;
    end if;
    v_desglose := v_desglose || jsonb_build_object(
      'descuento_' || v_desc.alcance,
      jsonb_build_object('id_regla', v_desc.id_regla, 'tipo_valor', v_desc.tipo_valor,
                         'valor', v_desc.valor, 'nombre', v_desc.nombre)
    );
  end loop;
  if v_desc_pct > 1 then v_desc_pct := 1; end if;

  v_precio_desc := (v_precio_lista * (1 - v_desc_pct)) - v_desc_fijo;
  if v_precio_desc < 0 then v_precio_desc := 0; end if;

  -- Recargo por forma de pago (después del descuento)
  select * into v_recargo from resolver_regla_recargo(p_id_producto, p_forma_pago);
  if v_recargo.id_regla is null or p_forma_pago = 'efectivo' then
    v_precio_final := v_precio_desc;
  elsif v_recargo.tipo_valor = 'porcentaje' then
    v_precio_final := v_precio_desc * (1 + v_recargo.valor);
    v_desglose := v_desglose || jsonb_build_object(
      'recargo_forma_pago',
      jsonb_build_object('id_regla', v_recargo.id_regla, 'tipo_valor', 'porcentaje',
                         'valor', v_recargo.valor, 'forma_pago', p_forma_pago)
    );
  else
    v_precio_final := v_precio_desc + v_recargo.valor;
    v_desglose := v_desglose || jsonb_build_object(
      'recargo_forma_pago',
      jsonb_build_object('id_regla', v_recargo.id_regla, 'tipo_valor', 'monto_fijo',
                         'valor', v_recargo.valor, 'forma_pago', p_forma_pago)
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

-- ─────────────────────────────────────────────────────────────────
-- MUTACIONES DE REGLAS (audit-wrapped).
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_create_regla_precio(
  p_nombre       text,
  p_tipo_regla   tipo_regla,
  p_tipo_valor   tipo_valor_regla,
  p_valor        numeric,
  p_alcance      alcance_regla,
  p_id_producto  uuid default null,
  p_id_categoria uuid default null,
  p_id_proveedor uuid default null,
  p_forma_pago   forma_pago default null,
  p_prioridad    integer default 0,
  p_fecha_inicio timestamptz default null,
  p_fecha_hasta  timestamptz default null,
  p_ip           inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  insert into regla_precio(
    id_tenant, nombre, tipo_regla, tipo_valor, valor, alcance,
    id_producto, id_categoria, id_proveedor, forma_pago,
    prioridad, fecha_inicio, fecha_hasta
  ) values (
    v_tenant, p_nombre, p_tipo_regla, p_tipo_valor, p_valor, p_alcance,
    p_id_producto, p_id_categoria, p_id_proveedor, p_forma_pago,
    coalesce(p_prioridad, 0), p_fecha_inicio, p_fecha_hasta
  ) returning id_regla into v_id;

  -- Si es margen, invalida precios de venta afectados (usuario debe
  -- recalcular explícitamente).
  if p_tipo_regla = 'margen' then
    perform sp_marcar_precio_desactualizado_by_regla(v_id);
  end if;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'regla_precio', v_id::text, 'crear',
          jsonb_build_object('nombre', p_nombre, 'tipo_regla', p_tipo_regla,
                             'tipo_valor', p_tipo_valor, 'valor', p_valor,
                             'alcance', p_alcance, 'forma_pago', p_forma_pago,
                             'prioridad', p_prioridad),
          p_ip);
  return v_id;
end $$;

create or replace function sp_baja_regla_precio(
  p_id_regla uuid,
  p_ip       inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_regla  regla_precio;
begin
  select * into v_regla from regla_precio
    where id_regla = p_id_regla and id_tenant = v_tenant;
  if v_regla.id_regla is null then
    raise exception 'regla-not-found' using errcode = '42704';
  end if;
  if v_regla.fecha_baja is not null then
    return; -- idempotente
  end if;

  update regla_precio set fecha_baja = now() where id_regla = p_id_regla;

  if v_regla.tipo_regla = 'margen' then
    perform sp_marcar_precio_desactualizado_by_regla(p_id_regla);
  end if;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'regla_precio', p_id_regla::text, 'baja',
          jsonb_build_object('nombre', v_regla.nombre),
          p_ip);
end $$;

-- Permite extender vigencia o renombrar sin editar el valor (§65 "no
-- se modifica algo que afecte integridad de datos").
create or replace function sp_extender_vigencia_regla(
  p_id_regla     uuid,
  p_fecha_hasta  timestamptz,
  p_ip           inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_prev   timestamptz;
begin
  select fecha_hasta into v_prev from regla_precio
    where id_regla = p_id_regla and id_tenant = v_tenant;
  if not found then
    raise exception 'regla-not-found' using errcode = '42704';
  end if;

  update regla_precio set fecha_hasta = p_fecha_hasta
   where id_regla = p_id_regla;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'regla_precio', p_id_regla::text, 'extender_vigencia',
          jsonb_build_object('fecha_hasta_anterior', v_prev,
                             'fecha_hasta_nueva', p_fecha_hasta),
          p_ip);
end $$;

grant execute on function resolver_regla_margen(uuid) to authenticated;
grant execute on function resolver_regla_recargo(uuid, forma_pago) to authenticated;
grant execute on function resolver_reglas_descuento(uuid) to authenticated;
grant execute on function sp_recalcular_precio_venta(uuid, inet) to authenticated;
grant execute on function sp_marcar_precio_desactualizado_by_producto(uuid) to authenticated;
grant execute on function sp_marcar_precio_desactualizado_by_regla(uuid) to authenticated;
grant execute on function sp_calcular_precio_venta_snapshot(uuid, forma_pago) to authenticated;
grant execute on function sp_create_regla_precio(text, tipo_regla, tipo_valor_regla, numeric, alcance_regla, uuid, uuid, uuid, forma_pago, integer, timestamptz, timestamptz, inet) to authenticated;
grant execute on function sp_baja_regla_precio(uuid, inet) to authenticated;
grant execute on function sp_extender_vigencia_regla(uuid, timestamptz, inet) to authenticated;

-- DOWN block (idempotent drops):
--   revoke execute on function sp_extender_vigencia_regla(uuid, timestamptz, inet) from authenticated;
--   drop function if exists sp_extender_vigencia_regla(uuid, timestamptz, inet);
--   ... resto de drops en orden inverso ...
