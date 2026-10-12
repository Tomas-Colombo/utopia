-- 00082_transicion_en_revendedora.sql
-- Slice 2: Transiciones para estado en_revendedora (Migracion B)

-- DOWN:
-- create or replace function is_transicion_item_valida(
--   p_desde estado_item, p_hasta estado_item
-- ) returns boolean language sql immutable as $$
--   select case
--     when p_desde = 'disponible'       and p_hasta in ('reservado', 'vendido', 'devuelto', 'baja') then true
--     when p_desde = 'reservado'        and p_hasta in ('disponible', 'vendido', 'baja') then true
--     when p_desde = 'vendido'          and p_hasta in ('disponible', 'devuelto_cliente', 'devuelto', 'baja') then true
--     when p_desde = 'devuelto_cliente' and p_hasta in ('disponible', 'baja') then true
--     else false
--   end;
-- $$;

create or replace function is_transicion_item_valida(
  p_desde estado_item, p_hasta estado_item
) returns boolean language sql immutable as $$
  select case
    -- Alta (no hay estado previo): manejado por confirmar_ingreso, no por transicion
    when p_desde = 'disponible'       and p_hasta in ('reservado', 'vendido', 'devuelto', 'baja', 'en_revendedora') then true
    when p_desde = 'reservado'        and p_hasta in ('disponible', 'vendido', 'baja') then true
    when p_desde = 'vendido'          and p_hasta in ('disponible', 'devuelto_cliente', 'devuelto', 'baja') then true
    when p_desde = 'devuelto_cliente' and p_hasta in ('disponible', 'baja') then true
    when p_desde = 'en_revendedora'   and p_hasta in ('disponible', 'vendido', 'devuelto', 'baja') then true
    -- 'devuelto' y 'baja' son estados terminales
    else false
  end;
$$;

grant execute on function is_transicion_item_valida(estado_item, estado_item) to authenticated;
