-- 00036_sku_autogen.sql
-- UP: Autogeneración de SKU corto y legible (`PREFIJO-####`) para altas
--     que no traen SKU explícito. El vendedor puede tipearlo a mano
--     cuando no hay escáner de QR disponible.
--
--     - `producto_sku_seq`: contador correlativo ÚNICO POR TENANT. La
--       secuencia es global al tenant (no por categoría) para que dos
--       categorías que deriven el mismo prefijo nunca colisionen.
--     - `sp_gen_sku(id_categoria)`: prefijo = 3 primeras letras del
--       nombre de la categoría (sin acentos, mayúsculas) + correlativo
--       con padding. Atómico: el UPSERT toma lock de fila, serializando
--       altas concurrentes (sin condición de carrera). Reintenta si el
--       candidato ya existe (p. ej. choca con un SKU cargado a mano).
--     - `sp_create_producto` y `sp_importar_remito`: si no viene SKU,
--       lo generan con el helper. Fuente única de verdad para ambos
--       caminos de alta (form directo + import de remito).
--
-- DOWN:
--   -- restaurar cuerpos previos de sp_importar_remito (00034) y
--   -- sp_create_producto (00016) sin la llamada a sp_gen_sku, y:
--   drop function if exists sp_gen_sku(uuid);
--   drop policy if exists producto_sku_seq_all_own_tenant on producto_sku_seq;
--   drop table if exists producto_sku_seq;

-- ─────────────────────────────────────────────────────────────────
-- Contador correlativo por tenant.
-- ─────────────────────────────────────────────────────────────────
create table if not exists producto_sku_seq (
  id_tenant uuid primary key references tenant(id_tenant) on delete cascade,
  ultimo    integer not null default 0
);

alter table producto_sku_seq enable row level security;

create policy producto_sku_seq_all_own_tenant on producto_sku_seq for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- ─────────────────────────────────────────────────────────────────
-- sp_gen_sku: genera `PREFIJO-####` único para el tenant actual.
-- ─────────────────────────────────────────────────────────────────
create or replace function sp_gen_sku(p_id_categoria uuid)
returns text language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_nombre text;
  v_prefix text;
  v_seq    integer;
  v_sku    text;
  v_try    integer := 0;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select nombre into v_nombre
    from categoria
   where id_categoria = p_id_categoria
     and id_tenant = v_tenant;

  -- Prefijo: 3 primeras LETRAS del nombre de categoría, sin acentos, en
  -- mayúsculas. translate() evita depender de la extensión unaccent.
  v_prefix := upper(substring(
    regexp_replace(
      translate(lower(coalesce(v_nombre, '')),
        'áàäâãéèëêíìïîóòöôõúùüûñç',
        'aaaaaeeeeiiiiooooouuuunc'),
      '[^a-z]', '', 'g'),
    1, 3));

  if v_prefix is null or v_prefix = '' then
    v_prefix := 'PRD';  -- categoría sin letras utilizables
  end if;

  -- El correlativo es monotónico por tenant, así que dos generados nunca
  -- chocan. El loop sólo cubre el choque contra un SKU cargado a mano.
  loop
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'no-se-pudo-generar-sku' using errcode = '55000';
    end if;

    insert into producto_sku_seq (id_tenant, ultimo)
    values (v_tenant, 1)
    on conflict (id_tenant)
      do update set ultimo = producto_sku_seq.ultimo + 1
    returning ultimo into v_seq;

    v_sku := v_prefix || '-' || lpad(v_seq::text, 4, '0');

    exit when not exists (
      select 1 from producto
       where id_tenant = v_tenant and sku = v_sku
    );
  end loop;

  return v_sku;
end $$;

grant execute on function sp_gen_sku(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- sp_create_producto: ahora autogenera el SKU si no viene uno explícito.
-- (Reemplaza el cuerpo de 00016; el resto de la firma queda igual.)
-- ─────────────────────────────────────────────────────────────────
create or replace function sp_create_producto(
  p_id_categoria uuid,
  p_nombre       text,
  p_sku          text default null,
  p_stock_minimo integer default 0,
  p_descripcion  text default null,
  p_ip           inet default null
) returns uuid language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_id     uuid;
  v_sku    text;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- SKU explícito (si vino) o autogenerado.
  v_sku := nullif(trim(p_sku), '');
  if v_sku is null then
    v_sku := sp_gen_sku(p_id_categoria);
  end if;

  insert into producto(id_tenant, id_categoria, nombre, sku, stock_minimo, descripcion)
  values (v_tenant, p_id_categoria, p_nombre, v_sku, coalesce(p_stock_minimo, 0), p_descripcion)
  returning id_producto into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'producto', v_id::text, 'crear',
          jsonb_build_object('nombre', p_nombre, 'sku', v_sku,
                             'id_categoria', p_id_categoria,
                             'stock_minimo', p_stock_minimo),
          p_ip);

  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- sp_importar_remito: los productos nuevos del remito también reciben
-- SKU autogenerado. (Reemplaza el cuerpo de 00034; sólo cambia el
-- INSERT del producto nuevo para incluir `sku`.)
-- ─────────────────────────────────────────────────────────────────
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
  v_sku         text;
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

      v_sku := sp_gen_sku(v_id_categoria);

      insert into producto(id_tenant, id_categoria, nombre, sku, stock_minimo, es_nuevo)
      values (v_tenant, v_id_categoria, v_nombre, v_sku, 0, true)
      returning id_producto into v_id_producto;

      insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
      values (v_tenant, v_actor, 'producto', v_id_producto::text, 'crear',
              jsonb_build_object('nombre', v_nombre, 'sku', v_sku,
                                 'id_categoria', v_id_categoria,
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
