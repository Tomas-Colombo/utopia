-- 00042_inventario_batch.sql
-- UP: elimina las cadenas secuenciales de round-trips en la home de Inventario.
--
-- Contexto medido: una query de esta app ejecuta en 0,2-3ms adentro de
-- Postgres, pero cada round-trip HTTP cuesta ~258ms (la región del proyecto
-- está lejos). Con esa relación, lo único que importa es CUÁNTAS idas y
-- vueltas hace la página, no cuánto tarda cada query.
--
-- `/inventario` corría 7 llamadas en `Promise.all` (eso está bien: medido,
-- 7 en paralelo = 369ms), pero DOS de ellas encadenaban queries adentro:
--   - `queryProductos`      → producto+categoria, luego costo_producto,
--                             luego item_producto  = 3 en fila (~774ms)
--   - `getInventarioResumen`→ producto, luego item_producto = 2 en fila
-- Como corren dentro del mismo `Promise.all`, manda la cadena más larga.
--
-- Ambas pasan a UN round-trip. SECURITY INVOKER (default): la RLS de
-- producto/categoria/costo_producto/item_producto sigue aplicando igual.
-- DOWN: drops al final del archivo.

-- ─────────────────────────────────────────────────────────────────
-- LISTADO MAESTRO DE PRODUCTOS
--
-- Replica exactamente lo que hacía `queryProductos` + `hydrateProductos`:
--   - filtros: activos, categoría, búsqueda ilike sobre nombre O sku
--   - orden por nombre asc
--   - costo vigente = costo_producto con `vigente_hasta is null`
--   - moneda: 'ARS' por defecto cuando hay costo; null cuando no hay
--   - stock_total    = ítems cuyo estado NO es 'baja' ni 'devuelto'
--   - stock_disponible = ítems en estado 'disponible'
--
-- Devuelve `{ total, rows }` como jsonb en vez de una tabla plana. El total
-- va FUERA del arreglo a propósito: si viajara en cada fila, una página
-- fuera de rango volvería vacía y se perdería el total, y la paginación
-- quedaría trabada sin forma de volver. Así se calcula siempre sobre el
-- conjunto filtrado completo, igual que el `count: 'exact'` de PostgREST
-- que reemplaza. `categoria` viaja ya anidada, con la forma que espera
-- `ProductoConDetalle`.
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_listar_productos(
  p_search       text    default null,
  p_id_categoria uuid    default null,
  p_solo_activos boolean default false,
  p_limit        integer default null,
  p_offset       integer default 0
) returns jsonb language sql stable as $$
  with filtrados as (
    select p.*
      from producto p
     where p.id_tenant = auth_tenant_id()
       and (not p_solo_activos or p.activo)
       and (p_id_categoria is null or p.id_categoria = p_id_categoria)
       and (
         p_search is null
         or btrim(p_search) = ''
         or p.nombre ilike '%' || btrim(p_search) || '%'
         or p.sku    ilike '%' || btrim(p_search) || '%'
       )
  ),
  pagina as (
    select
      f.id_producto,
      f.id_tenant,
      f.id_categoria,
      f.sku,
      f.nombre,
      f.descripcion,
      f.stock_minimo,
      f.activo,
      f.es_nuevo,
      f.precio_venta,
      f.id_regla_margen_aplicada,
      f.precio_venta_resuelto_at,
      f.precio_venta_desactualizado,
      f.created_at,
      f.updated_at,
      case when c.id_categoria is not null
           then jsonb_build_object('id_categoria', c.id_categoria, 'nombre', c.nombre)
      end as categoria,
      cp.costo as costo_vigente,
      case when cp.id_costo is not null then coalesce(cp.moneda, 'ARS') end as moneda_vigente,
      st.disponible as stock_disponible,
      st.total      as stock_total
    from filtrados f
    left join categoria c
      on c.id_categoria = f.id_categoria
    left join costo_producto cp
      on cp.id_producto = f.id_producto
     and cp.vigente_hasta is null
    left join lateral (
      select
        count(*) filter (where ip.estado_item <> 'baja' and ip.estado_item <> 'devuelto')::integer as total,
        count(*) filter (where ip.estado_item = 'disponible')::integer as disponible
      from item_producto ip
      where ip.id_producto = f.id_producto
    ) st on true
    order by f.nombre asc
    limit  p_limit
    offset coalesce(p_offset, 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtrados),
    'rows',  coalesce(
               (select jsonb_agg(to_jsonb(pg) order by pg.nombre asc) from pagina pg),
               '[]'::jsonb
             )
  );
$$;

-- ─────────────────────────────────────────────────────────────────
-- KPIs DE LA HOME DE INVENTARIO
-- Reemplaza el par de queries encadenadas (`producto`, después
-- `item_producto` filtrado por los ids del primero).
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_inventario_resumen()
returns table (
  productos_activos      integer,
  stock_disponible_total integer,
  productos_bajo_minimo  integer
) language sql stable as $$
  with activos as (
    select
      p.stock_minimo,
      (select count(*)
         from item_producto ip
        where ip.id_producto = p.id_producto
          and ip.estado_item = 'disponible') as disponibles
    from producto p
    where p.id_tenant = auth_tenant_id()
      and p.activo
  )
  select
    count(*)::integer,
    coalesce(sum(a.disponibles), 0)::integer,
    count(*) filter (where a.disponibles < a.stock_minimo)::integer
  from activos a;
$$;

grant execute on function sp_listar_productos(text, uuid, boolean, integer, integer) to authenticated;
grant execute on function sp_inventario_resumen() to authenticated;

-- DOWN block (idempotent drops):
--   revoke execute on function sp_inventario_resumen() from authenticated;
--   revoke execute on function sp_listar_productos(text, uuid, boolean, integer, integer) from authenticated;
--   drop function if exists sp_inventario_resumen();
--   drop function if exists sp_listar_productos(text, uuid, boolean, integer, integer);
