-- 00034_sp_importar_remito.sql
-- UP: sp_importar_remito — import masivo de un remito en UNA transacción.
--     Reemplaza el loop en la app (que hacía N+1 round-trips y no era
--     atómico). Por cada línea: crea el producto (es_nuevo=true) + costo
--     inicial, o usa uno existente; e inserta una línea de detalle por
--     cada parte (talle). Todo o nada: si falla, rollback completo.
--     Devuelve { creados, vinculados, detalles: [...] }.
--
--     `p_lineas` (jsonb array), cada elemento:
--       { esNuevo, idProducto, idCategoria, nombre, costoUnitario,
--         partes: [ { talle, cantidad }, ... ] }
-- DOWN:
--   revoke execute on function sp_importar_remito(uuid, text, jsonb, inet) from authenticated;
--   drop function if exists sp_importar_remito(uuid, text, jsonb, inet);

create or replace function sp_importar_remito(
  p_id_ingreso uuid,
  p_moneda     text default 'ARS',
  p_lineas     jsonb default '[]',
  p_ip         inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant      uuid := auth_tenant_id();
  v_actor       uuid := auth.uid();
  v_linea       jsonb;
  v_parte       jsonb;
  v_es_nuevo    boolean;
  v_id_producto uuid;
  v_id_categoria uuid;
  v_nombre      text;
  v_costo       numeric;
  v_talle       text;
  v_cant        integer;
  v_id_detalle  uuid;
  v_creados     integer := 0;
  v_vinculados  integer := 0;
  v_detalles    jsonb := '[]'::jsonb;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from ingreso_mercaderia
     where id_ingreso = p_id_ingreso and id_tenant = v_tenant
  ) then
    raise exception 'ingreso-not-found' using errcode = '42704';
  end if;

  for v_linea in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb))
  loop
    v_es_nuevo := coalesce((v_linea->>'esNuevo')::boolean, false);
    v_nombre   := trim(v_linea->>'nombre');
    v_costo    := coalesce((v_linea->>'costoUnitario')::numeric, 0);

    if v_nombre is null or v_nombre = '' then
      raise exception 'linea-sin-nombre' using errcode = '22023';
    end if;

    if v_es_nuevo then
      v_id_categoria := nullif(v_linea->>'idCategoria', '')::uuid;
      if v_id_categoria is null then
        raise exception 'falta-categoria: %', v_nombre using errcode = '22023';
      end if;

      insert into producto(id_tenant, id_categoria, nombre, stock_minimo, es_nuevo)
      values (v_tenant, v_id_categoria, v_nombre, 0, true)
      returning id_producto into v_id_producto;

      insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
      values (v_tenant, v_actor, 'producto', v_id_producto::text, 'crear',
              jsonb_build_object('nombre', v_nombre, 'id_categoria', v_id_categoria,
                                 'origen', 'import-remito'),
              p_ip);

      if v_costo > 0 then
        insert into costo_producto(id_tenant, id_producto, costo, moneda, id_usuario_alta, motivo)
        values (v_tenant, v_id_producto, v_costo, coalesce(p_moneda, 'ARS'), v_actor,
                'costo inicial (import remito)');

        insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
        values (v_tenant, v_actor, 'costo_producto', v_id_producto::text, 'crear',
                jsonb_build_object('costo_nuevo', v_costo, 'moneda', coalesce(p_moneda, 'ARS'),
                                   'motivo', 'costo inicial (import remito)'),
                p_ip);
      end if;

      v_creados := v_creados + 1;
    else
      v_id_producto := nullif(v_linea->>'idProducto', '')::uuid;
      if v_id_producto is null then
        raise exception 'falta-producto: %', v_nombre using errcode = '22023';
      end if;
      if not exists (
        select 1 from producto where id_producto = v_id_producto and id_tenant = v_tenant
      ) then
        raise exception 'producto-not-found: %', v_nombre using errcode = '42704';
      end if;
      v_vinculados := v_vinculados + 1;
    end if;

    for v_parte in select * from jsonb_array_elements(coalesce(v_linea->'partes', '[]'::jsonb))
    loop
      v_talle := nullif(trim(v_parte->>'talle'), '');
      v_cant  := coalesce((v_parte->>'cantidad')::integer, 0);
      if v_cant <= 0 then
        continue;
      end if;

      insert into ingreso_mercaderia_detalle(id_tenant, id_ingreso, id_producto,
                                             cantidad, costo_unitario, talle)
      values (v_tenant, p_id_ingreso, v_id_producto, v_cant, v_costo, v_talle)
      returning id_detalle into v_id_detalle;

      v_detalles := v_detalles || jsonb_build_object(
        'id_detalle', v_id_detalle,
        'id_producto', v_id_producto,
        'nombre', v_nombre,
        'cantidad', v_cant,
        'costo_unitario', v_costo,
        'talle', v_talle
      );
    end loop;
  end loop;

  return jsonb_build_object('creados', v_creados, 'vinculados', v_vinculados, 'detalles', v_detalles);
end $$;

grant execute on function sp_importar_remito(uuid, text, jsonb, inet) to authenticated;
