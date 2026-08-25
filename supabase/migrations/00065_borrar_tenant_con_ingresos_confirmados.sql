-- 00065_borrar_tenant_con_ingresos_confirmados.sql
-- UP: un tenant vuelve a poder borrarse aunque tenga ingresos confirmados.
--
--     ─── El bug ───────────────────────────────────────────────────────
--     `ingreso_mercaderia_detalle` cuelga del tenant por DOS caminos, y los
--     dos son `on delete cascade`:
--
--       id_ingreso → ingreso_mercaderia → tenant   (indirecto)
--       id_tenant  → tenant                        (directo)
--
--     00051 contempló sólo el primero: ahí la cabecera ya fue borrada cuando
--     el trigger mira, `v_confirmado` queda null y se deja pasar. Por el
--     camino directo la cabecera SIGUE VIVA mientras se borran sus líneas
--     —Postgres no ordena las cascadas hermanas— así que el trigger la
--     encuentra `confirmado` y aborta el `delete from tenant` entero con
--     `ingreso-confirmado: el detalle de un ingreso confirmado es inmutable`.
--
--     Consecuencia: ningún tenant que haya confirmado un ingreso se podía
--     borrar. El primero en pegarse fue el teardown de la suite e2e
--     (`dropExistingTenant`, e2e/support/tenant.ts), que desde la segunda
--     corrida local no lograba limpiar el tenant de la corrida anterior; el
--     rollback de `scripts/provision-tenant.mts` borra el tenant por la misma
--     vía y quedaba igual de trabado.
--
--     ─── El arreglo ───────────────────────────────────────────────────
--     Si el tenant dueño de la línea ya no existe, no hay nada que proteger:
--     se deja pasar. Es el mismo razonamiento que 00051 aplicó a la cabecera,
--     extendido al otro padre.
--
--     El chequeo es confiable y no es una carrera: la fila de `tenant` la
--     borra el comando de arriba, y las cascadas corren después. Cuando este
--     trigger mira, el tenant ya no está en el snapshot.
--
--     La invariante NO se afloja. Con el tenant vivo, tocar el detalle de un
--     ingreso confirmado sigue abortando venga de donde venga —insert, update
--     o delete—, que es lo que 00051 fue a proteger: que nadie edite un
--     ingreso que ya generó sus `item_producto`. Borrar el tenant no es
--     editar un ingreso: es que deje de existir el comercio entero.
-- DOWN: al final, comentado.

create or replace function ingreso_detalle_bloquea_confirmado()
returns trigger language plpgsql as $$
declare
  v_confirmado boolean;
begin
  -- En UPDATE se miran las DOS puntas: mover una línea desde o hacia un
  -- ingreso confirmado rompe la invariante igual que insertar o borrar.
  if tg_op in ('INSERT', 'UPDATE') then
    select confirmado into v_confirmado
      from ingreso_mercaderia
     where id_ingreso = new.id_ingreso;
    if v_confirmado then
      raise exception
        'ingreso-confirmado: el detalle de un ingreso confirmado es inmutable'
        using errcode = '22023';
    end if;
  end if;

  -- Agregado en 00065: el tenant ya no está, o sea que este DELETE viene en
  -- cascada desde `tenant`. No hay ingreso que proteger porque no hay comercio.
  if tg_op = 'DELETE'
     and not exists (select 1 from tenant where id_tenant = old.id_tenant) then
    return old;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    -- `v_confirmado` queda null si la cabecera ya no está: eso pasa cuando el
    -- delete viene en cascada desde `ingreso_mercaderia`. Ahí no hay nada que
    -- proteger y se deja pasar.
    select confirmado into v_confirmado
      from ingreso_mercaderia
     where id_ingreso = old.id_ingreso;
    if v_confirmado then
      raise exception
        'ingreso-confirmado: el detalle de un ingreso confirmado es inmutable'
        using errcode = '22023';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

-- ─── DOWN ────────────────────────────────────────────────────────────
--   -- Recrear la versión de 00051 (sin la guarda por tenant borrado).
--   -- OJO: con la versión vieja, borrar un tenant que confirmó algún ingreso
--   -- vuelve a fallar entero.
--
--   create or replace function ingreso_detalle_bloquea_confirmado()
--   returns trigger language plpgsql as $$
--   declare
--     v_confirmado boolean;
--   begin
--     if tg_op in ('INSERT', 'UPDATE') then
--       select confirmado into v_confirmado
--         from ingreso_mercaderia
--        where id_ingreso = new.id_ingreso;
--       if v_confirmado then
--         raise exception
--           'ingreso-confirmado: el detalle de un ingreso confirmado es inmutable'
--           using errcode = '22023';
--       end if;
--     end if;
--
--     if tg_op in ('UPDATE', 'DELETE') then
--       select confirmado into v_confirmado
--         from ingreso_mercaderia
--        where id_ingreso = old.id_ingreso;
--       if v_confirmado then
--         raise exception
--           'ingreso-confirmado: el detalle de un ingreso confirmado es inmutable'
--           using errcode = '22023';
--       end if;
--     end if;
--
--     if tg_op = 'DELETE' then
--       return old;
--     end if;
--     return new;
--   end $$;
