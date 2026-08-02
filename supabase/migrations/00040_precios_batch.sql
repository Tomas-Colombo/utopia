-- 00040_precios_batch.sql
-- UP: elimina el N+1 del módulo de precios.
--
-- Antes, `listControlDePrecios()` (lib/dal/precios/resolucion.ts) llamaba a
-- `resolver_regla_margen` UNA VEZ POR PRODUCTO desde TypeScript, en serie.
-- Con 35 productos activos eso son 35 round-trips secuenciales (~10s medidos).
-- Estas tres funciones mueven ese trabajo adentro de Postgres:
--
--   - sp_precios_resumen        → contadores del home de Precios (1 round-trip)
--   - sp_control_de_precios     → listado + proyección completa (1 round-trip)
--   - sp_recalcular_precios_batch → recálculo masivo (1 round-trip)
--
-- Todas son SECURITY INVOKER (default): la RLS de `producto` / `regla_precio`
-- sigue aplicando igual que en las llamadas sueltas que reemplazan.
-- DOWN: drops al final del archivo.

-- ─────────────────────────────────────────────────────────────────
-- RESUMEN PARA EL HOME DE PRECIOS
-- El home solo muestra contadores; no necesita la proyección por
-- producto. Una agregación reemplaza el listado entero.
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_precios_resumen()
returns table (
  productos_activos integer,
  desactualizados   integer,
  sin_precio        integer,
  con_regla         integer
) language sql stable as $$
  select
    count(*)::integer,
    count(*) filter (where p.precio_venta_desactualizado)::integer,
    count(*) filter (where p.precio_venta is null)::integer,
    count(*) filter (where p.id_regla_margen_aplicada is not null)::integer
  from producto p
  where p.id_tenant = auth_tenant_id()
    and p.activo;
$$;

-- ─────────────────────────────────────────────────────────────────
-- CONTROL DE PRECIOS (listado + proyección)
--
-- Replica exactamente la lógica que vivía en TS:
--   - sin costo vigente            → precio_proyectado = null
--   - sin regla (o valor null)     → precio_proyectado = costo
--   - regla porcentaje             → costo * (1 + valor)
--   - regla monto_fijo             → costo + valor
--   - diferencia_pct solo si hay precio_venta > 0 y proyección
--
-- El LATERAL sobre `resolver_regla_margen` es la clave: resuelve la
-- cascada producto > categoría > proveedor > global para TODOS los
-- productos en una sola pasada del planner, en vez de N llamadas.
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_control_de_precios()
returns table (
  id_producto                 uuid,
  nombre                      text,
  sku                         text,
  categoria_nombre            text,
  costo_vigente               numeric,
  precio_venta                numeric,
  precio_venta_resuelto_at    timestamptz,
  precio_venta_desactualizado boolean,
  regla_margen_nombre         text,
  precio_proyectado           numeric,
  diferencia_pct              numeric
) language sql stable as $$
  with base as (
    select
      p.id_producto,
      p.nombre,
      p.sku,
      c.nombre as categoria_nombre,
      cp.costo as costo_vigente,
      p.precio_venta,
      p.precio_venta_resuelto_at,
      p.precio_venta_desactualizado,
      ra.nombre as regla_margen_nombre,
      case
        when cp.costo is null then null
        when r.valor is null then round(cp.costo, 2)
        when r.tipo_valor = 'porcentaje' then round(cp.costo * (1 + r.valor), 2)
        else round(cp.costo + r.valor, 2)
      end as precio_proyectado
    from producto p
    left join categoria c
      on c.id_categoria = p.id_categoria
    left join costo_producto cp
      on cp.id_producto = p.id_producto
     and cp.vigente_hasta is null
    left join regla_precio ra
      on ra.id_regla = p.id_regla_margen_aplicada
    left join lateral resolver_regla_margen(p.id_producto) r on true
    where p.id_tenant = auth_tenant_id()
      and p.activo
  )
  select
    b.id_producto,
    b.nombre,
    b.sku,
    b.categoria_nombre,
    b.costo_vigente,
    b.precio_venta,
    b.precio_venta_resuelto_at,
    b.precio_venta_desactualizado,
    b.regla_margen_nombre,
    b.precio_proyectado,
    case
      when b.precio_venta is not null
       and b.precio_venta > 0
       and b.precio_proyectado is not null
      then round(((b.precio_proyectado - b.precio_venta) / b.precio_venta) * 100, 2)
      else null
    end as diferencia_pct
  from base b
  order by b.nombre asc;
$$;

-- ─────────────────────────────────────────────────────────────────
-- RECÁLCULO MASIVO
--
-- Reemplaza el loop en TS que hacía un round-trip por id. Mantiene el
-- orden del array recibido (la auditoría queda ordenada, que era el
-- motivo declarado del loop serial) y aísla cada producto en su propio
-- subbloque: si uno falla, devuelve null para ese id sin abortar el
-- resto — mismo contrato que el `try/catch` que reemplaza.
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_recalcular_precios_batch(
  p_ids uuid[],
  p_ip  inet default null
) returns table (
  id_producto uuid,
  precio      numeric
) language plpgsql as $$
declare
  v_id uuid;
begin
  if auth_tenant_id() is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    begin
      id_producto := v_id;
      precio := sp_recalcular_precio_venta(v_id, p_ip);
    exception when others then
      -- El subbloque revierte solo lo de ESTE producto (incluida su
      -- fila de auditoría); los ya procesados quedan firmes.
      id_producto := v_id;
      precio := null;
    end;
    return next;
  end loop;
end $$;

grant execute on function sp_precios_resumen() to authenticated;
grant execute on function sp_control_de_precios() to authenticated;
grant execute on function sp_recalcular_precios_batch(uuid[], inet) to authenticated;

-- DOWN block (idempotent drops):
--   revoke execute on function sp_recalcular_precios_batch(uuid[], inet) from authenticated;
--   revoke execute on function sp_control_de_precios() from authenticated;
--   revoke execute on function sp_precios_resumen() from authenticated;
--   drop function if exists sp_recalcular_precios_batch(uuid[], inet);
--   drop function if exists sp_control_de_precios();
--   drop function if exists sp_precios_resumen();
