-- 00050_stock_por_talle.sql
-- UP: sp_stock_por_talle — stock disponible de un producto agrupado por talle.
--
--     Reemplaza `contarDisponiblesPorTalle`, que traía TODAS las unidades
--     disponibles del producto y después mandaba sus id_item de vuelta en un
--     `.in(...)` para cruzarlas contra `detalle_reserva`. Ese segundo query
--     viaja en el query string de PostgREST: con 3000 unidades son 3000 UUIDs
--     en la URL y el request muere con 414 URI Too Long. El costo crecía con
--     el stock, justo al revés de lo que uno quiere.
--
--     Acá el cruce se hace donde viven los datos y sólo vuelve el agregado:
--     una fila por talle, sin importar si el producto tiene 10 unidades o
--     100.000. Mismo patrón que sp_listar_productos / sp_inventario_resumen
--     (00042).
--
--     SECURITY INVOKER (default): la RLS de item_producto y detalle_reserva
--     sigue aplicando. Los filtros explícitos por auth_tenant_id() son
--     belt-and-suspenders, igual que en 00042.
--
-- DOWN:
--   revoke execute on function sp_stock_por_talle(uuid, uuid, jsonb) from authenticated;
--   drop function if exists sp_stock_por_talle(uuid, uuid, jsonb);

create or replace function sp_stock_por_talle(
  p_id_producto    uuid,
  p_id_reserva_ctx uuid  default null,
  p_excluir        jsonb default '[]'
) returns jsonb language sql stable as $$
with disponibles as (
  select i.id_item, i.talle
    from item_producto i
   where i.id_tenant = auth_tenant_id()
     and i.id_producto = p_id_producto
     and i.estado_item = 'disponible'
),
-- Unidades tomadas por una reserva activa AJENA al contexto. Cuando
-- p_id_reserva_ctx viene null no hay contexto: todas las reservas son ajenas.
bloqueos as (
  select dr.id_item, dr.id_reserva
    from detalle_reserva dr
    join disponibles d on d.id_item = dr.id_item
   where dr.id_tenant = auth_tenant_id()
     and dr.estado = 'activa'
     and (p_id_reserva_ctx is null or dr.id_reserva <> p_id_reserva_ctx)
),
-- Distinct: un ítem con más de una reserva activa se cuenta UNA vez, si no
-- el join multiplicaría filas y el conteo saldría inflado.
bloqueados as (
  select distinct id_item from bloqueos
),
-- Unidades ya cargadas en el carrito: no se pueden volver a agregar, así que
-- no aparecen en ningún balde.
excluidos as (
  select value::uuid as id_item
    from jsonb_array_elements_text(coalesce(p_excluir, '[]'::jsonb))
),
conteo as (
  select d.talle,
         count(*) filter (where b.id_item is null)     as disponibles,
         count(*) filter (where b.id_item is not null) as reservados
    from disponibles d
    left join bloqueados b on b.id_item = d.id_item
   where not exists (select 1 from excluidos e where e.id_item = d.id_item)
   group by d.talle
)
select jsonb_build_object(
  'porTalle', coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'talle', c.talle,
               'disponibles', c.disponibles,
               'reservados', c.reservados
             ) order by c.talle nulls last)
      from conteo c
  ), '[]'::jsonb),

  -- A propósito SIN descontar reservas ni carrito: distingue "no hay stock"
  -- de "hay stock pero está todo tomado".
  'totalDisponible', (select count(*) from disponibles),

  -- Sobre todas las unidades, no sólo las no excluidas: una reserva que
  -- bloquea algo que ya está en el carrito sigue siendo una reserva a mostrar.
  'reservasBloqueantes', coalesce((
    select jsonb_agg(distinct b.id_reserva) from bloqueos b
  ), '[]'::jsonb)
);
$$;

grant execute on function sp_stock_por_talle(uuid, uuid, jsonb) to authenticated;
