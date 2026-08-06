-- 00053_gasto_descripcion_opcional_y_delete.sql
-- UP: dos cambios sobre `gasto_negocio`.
--
--  1) `descripcion` pasa a ser opcional.
--     La mayoría de los gastos ya quedan identificados por categoría +
--     monto + comprobante_ref; exigir un texto obligatorio sólo empujaba a
--     cargar relleno ("gasto", "-") que no aporta nada al histórico.
--     La columna se afloja a NULL y `sp_registrar_gasto` deja de validarla;
--     un string vacío o sólo espacios se normaliza a NULL para no mezclar
--     dos representaciones de "sin descripción".
--
--  2) `sp_eliminar_gasto` — borrado FÍSICO de un gasto mal cargado.
--     Un gasto no tiene dependientes (ninguna FK apunta a gasto_negocio) y
--     entra directo en el gastado del mes y en los reportes, así que la
--     corrección honesta de una carga equivocada es borrarlo, no dejar una
--     fila anulada sumando ruido. Se audita la fila completa antes del
--     delete para que el histórico no se pierda.
--
-- DOWN:
--   drop function if exists sp_eliminar_gasto(uuid, inet);
--   -- ojo: requiere que no queden filas con descripcion null
--   update gasto_negocio set descripcion = '' where descripcion is null;
--   alter table gasto_negocio alter column descripcion set not null;

-- ─────────────────────────────────────────────────────────────────
-- 1) descripcion opcional
-- ─────────────────────────────────────────────────────────────────

alter table gasto_negocio alter column descripcion drop not null;

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
  v_desc   text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'monto-invalido' using errcode = '22023';
  end if;

  insert into gasto_negocio(id_tenant, id_categoria_gasto, id_usuario_alta,
                             fecha, monto, descripcion, comprobante_ref)
  values (v_tenant, p_id_categoria_gasto, v_actor,
          coalesce(p_fecha, now()), p_monto, v_desc, p_comprobante_ref)
  returning id_gasto into v_id;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'gasto_negocio', v_id::text, 'crear',
          jsonb_build_object('id_categoria_gasto', p_id_categoria_gasto,
                             'monto', p_monto,
                             'descripcion', v_desc),
          p_ip);
  return v_id;
end $$;

-- ─────────────────────────────────────────────────────────────────
-- 2) Borrado físico de un gasto
-- ─────────────────────────────────────────────────────────────────

create or replace function sp_eliminar_gasto(
  p_id_gasto uuid,
  p_ip       inet default null
) returns void language plpgsql as $$
declare
  v_tenant uuid := auth_tenant_id();
  v_actor  uuid := auth.uid();
  v_row    gasto_negocio%rowtype;
begin
  if v_tenant is null then
    raise exception 'no-tenant' using errcode = '42501';
  end if;

  -- El select ya pasa por RLS: un gasto de otro tenant no se ve y cae acá.
  select * into v_row
    from gasto_negocio
   where id_gasto = p_id_gasto;
  if not found then
    raise exception 'gasto-inexistente' using errcode = '22023';
  end if;

  delete from gasto_negocio where id_gasto = p_id_gasto;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'gasto_negocio', p_id_gasto::text, 'eliminar',
          jsonb_build_object('id_categoria_gasto', v_row.id_categoria_gasto,
                             'fecha', v_row.fecha,
                             'monto', v_row.monto,
                             'descripcion', v_row.descripcion,
                             'comprobante_ref', v_row.comprobante_ref),
          p_ip);
end $$;
