-- 00032_talles.sql
-- UP: Talles (medidas) por categoría + talle por unidad física.
--   * `categoria.talles`             → lista de talles propia de cada
--                                       categoría (ej: Remeras [S,M,L,XL],
--                                       Anillos [16,18,20]). Se define al
--                                       crear/editar la categoría.
--   * `item_producto.talle`          → talle de la unidad física (nullable:
--                                       null = producto sin talle).
--   * `ingreso_mercaderia_detalle.talle` → talle de la línea de ingreso; se
--                                       copia a cada item al confirmar.
--   Se actualiza `sp_confirmar_ingreso` para propagar el talle del detalle
--   al item generado.
-- DOWN:
--   -- restaurar sp_confirmar_ingreso desde 00016 (sin talle)
--   alter table ingreso_mercaderia_detalle drop column if exists talle;
--   alter table item_producto drop column if exists talle;
--   alter table categoria drop column if exists talles;

alter table categoria
  add column if not exists talles text[] not null default '{}';

alter table item_producto
  add column if not exists talle text;

alter table ingreso_mercaderia_detalle
  add column if not exists talle text;

comment on column categoria.talles is
  'Talles/medidas válidos para los productos de esta categoría (ej: {S,M,L,XL}).';
comment on column item_producto.talle is
  'Talle de la unidad física; null = producto sin talle.';
comment on column ingreso_mercaderia_detalle.talle is
  'Talle de la línea; se copia a cada item al confirmar el ingreso.';

-- ─────────────────────────────────────────────────────────────────
-- sp_confirmar_ingreso (00016) + propagación de talle detalle → item.
-- Reemplazo idempotente: mismo comportamiento, ahora copia `talle`.
-- ─────────────────────────────────────────────────────────────────
create or replace function sp_confirmar_ingreso(
  p_id_ingreso uuid,
  p_ip         inet default null
) returns integer language plpgsql as $$
declare
  v_tenant    uuid := auth_tenant_id();
  v_actor     uuid := auth.uid();
  v_confirmado boolean;
  v_tipo      tipo_ingreso;
  v_count     integer := 0;
  v_detalle   record;
  v_i         integer;
  v_qr        text;
  v_new_item  uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  select confirmado, tipo_ingreso into v_confirmado, v_tipo
    from ingreso_mercaderia
   where id_ingreso = p_id_ingreso and id_tenant = v_tenant
   for update;

  if v_confirmado is null then
    raise exception 'ingreso-not-found' using errcode = '42704';
  end if;

  if v_confirmado then
    return 0;  -- idempotente
  end if;

  for v_detalle in
    select id_detalle, id_producto, cantidad, costo_unitario, talle
      from ingreso_mercaderia_detalle
     where id_ingreso = p_id_ingreso and id_tenant = v_tenant
  loop
    for v_i in 1 .. v_detalle.cantidad loop
      v_qr := encode(gen_random_bytes(12), 'hex');

      insert into item_producto(id_tenant, id_producto, id_ingreso, id_ingreso_detalle,
                                qr_code, estado_item, costo_ingreso, tipo_ingreso, talle)
      values (v_tenant, v_detalle.id_producto, p_id_ingreso, v_detalle.id_detalle,
              v_qr, 'disponible', v_detalle.costo_unitario, v_tipo, v_detalle.talle)
      returning id_item into v_new_item;

      insert into movimiento_item(id_tenant, id_item, tipo_movimiento,
                                  estado_desde, estado_hasta,
                                  referencia_tipo, referencia_id, id_usuario)
      values (v_tenant, v_new_item, 'alta',
              null, 'disponible',
              'ingreso', p_id_ingreso, v_actor);

      v_count := v_count + 1;
    end loop;
  end loop;

  update ingreso_mercaderia
     set confirmado = true
   where id_ingreso = p_id_ingreso;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'ingreso_mercaderia', p_id_ingreso::text, 'confirmar',
          jsonb_build_object('items_generados', v_count, 'tipo_ingreso', v_tipo),
          p_ip);

  return v_count;
end $$;
