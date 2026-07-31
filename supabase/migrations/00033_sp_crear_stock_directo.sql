-- 00033_sp_crear_stock_directo.sql
-- UP: sp_crear_stock_directo — genera items físicos (con QR único) para un
--     producto SIN pasar por un ingreso. Lo usa el alta de producto para
--     cargar stock inicial por talle (2 S, 2 XL…). Cada item queda con
--     estado 'disponible', costo e (opcional) talle. Registra movimiento
--     'alta' (referencia 'alta-directa') + auditoría, en la misma tx.
-- DOWN:
--   revoke execute on function sp_crear_stock_directo(uuid, numeric, tipo_ingreso, jsonb, inet) from authenticated;
--   drop function if exists sp_crear_stock_directo(uuid, numeric, tipo_ingreso, jsonb, inet);

create or replace function sp_crear_stock_directo(
  p_id_producto  uuid,
  p_costo        numeric default 0,
  p_tipo_ingreso tipo_ingreso default 'compra',
  p_items        jsonb default '[]',   -- [{ "talle": "S"|null, "cantidad": 2 }, ...]
  p_ip           inet default null
) returns integer language plpgsql as $$
declare
  v_tenant   uuid := auth_tenant_id();
  v_actor    uuid := auth.uid();
  v_count    integer := 0;
  v_item     jsonb;
  v_talle    text;
  v_cant     integer;
  v_i        integer;
  v_qr       text;
  v_new_item uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  if not exists (
    select 1 from producto where id_producto = p_id_producto and id_tenant = v_tenant
  ) then
    raise exception 'producto-not-found' using errcode = '42704';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_talle := nullif(trim(v_item->>'talle'), '');
    v_cant := coalesce((v_item->>'cantidad')::integer, 0);
    if v_cant <= 0 then
      continue;
    end if;

    for v_i in 1 .. v_cant loop
      v_qr := encode(gen_random_bytes(12), 'hex');

      insert into item_producto(id_tenant, id_producto, id_ingreso, id_ingreso_detalle,
                                qr_code, estado_item, costo_ingreso, tipo_ingreso, talle)
      values (v_tenant, p_id_producto, null, null,
              v_qr, 'disponible', coalesce(p_costo, 0),
              coalesce(p_tipo_ingreso, 'compra'), v_talle)
      returning id_item into v_new_item;

      insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                                  estado_desde, estado_hasta,
                                  referencia_tipo, referencia_id, id_usuario)
      values (v_tenant, v_new_item, 'alta', null, 'disponible',
              'alta-directa', p_id_producto, v_actor);

      v_count := v_count + 1;
    end loop;
  end loop;

  if v_count > 0 then
    insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
    values (v_tenant, v_actor, 'item_producto', p_id_producto::text, 'alta-directa',
            jsonb_build_object('items_generados', v_count, 'costo', p_costo), p_ip);
  end if;

  return v_count;
end $$;

grant execute on function sp_crear_stock_directo(uuid, numeric, tipo_ingreso, jsonb, inet) to authenticated;
