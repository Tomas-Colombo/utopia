-- 00051_ingreso_confirmado_inmutable.sql
-- UP: dos invariantes del detalle de ingreso que hasta ahora sólo vivían en
--     la UI (`readonly = ingreso.confirmado`) o en ningún lado.
--
--  1) El detalle de un ingreso CONFIRMADO es inmutable.
--     Un ingreso confirmado ya generó sus `item_producto`. Agregarle una
--     línea después inserta la fila pero no genera nada (sp_confirmar_ingreso
--     es idempotente y devuelve 0), y el ingreso queda mostrando un total que
--     no existe en el stock físico. Borrar una línea deja los ítems vivos
--     pero con `id_ingreso_detalle = null` (la FK es `on delete set null`),
--     o sea sin trazabilidad a la línea que los originó.
--
--     No hace falta mala intención: alcanza con tener el ingreso abierto en
--     una pestaña mientras otro usuario lo confirma.
--
--     Va como trigger y no como guarda adentro de los SP porque el detalle se
--     toca por varias vías — sp_importar_remito, el insert directo de
--     PostgREST desde el DAL, y el delete directo. El trigger las cubre todas,
--     incluida cualquiera que se agregue después.
--
--  2) `costo_unitario` no puede ser NaN.
--     `sp_importar_remito` castea con `(v_linea->>'costoUnitario')::numeric`,
--     y en Postgres `'NaN'::numeric` es un valor VÁLIDO. Peor: NaN se ordena
--     como mayor que cualquier otro numeric, así que el `check (>= 0)` que ya
--     existe lo deja pasar. Ese NaN se copia a `item_producto.costo_ingreso`
--     al confirmar y contamina todo cálculo de costo y margen aguas abajo,
--     sin error en ningún lado.
--
-- DOWN:
--   alter table ingreso_mercaderia_detalle drop constraint if exists ingreso_detalle_costo_no_nan;
--   drop trigger if exists ingreso_detalle_inmutable on ingreso_mercaderia_detalle;
--   drop function if exists ingreso_detalle_bloquea_confirmado();

-- ─────────────────────────────────────────────────────────────────
-- 1) Inmutabilidad del detalle de un ingreso confirmado
-- ─────────────────────────────────────────────────────────────────

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

drop trigger if exists ingreso_detalle_inmutable on ingreso_mercaderia_detalle;

create trigger ingreso_detalle_inmutable
  before insert or update or delete on ingreso_mercaderia_detalle
  for each row execute function ingreso_detalle_bloquea_confirmado();

-- ─────────────────────────────────────────────────────────────────
-- 2) Costo unitario finito
-- ─────────────────────────────────────────────────────────────────

-- Falla ruidosamente si ya hay NaN cargado, en vez de dejar el constraint
-- sin aplicar: si hay datos contaminados hay que verlos, no esconderlos.
do $$
declare
  v_sucios integer;
begin
  select count(*) into v_sucios
    from ingreso_mercaderia_detalle
   where costo_unitario = 'NaN'::numeric;

  if v_sucios > 0 then
    raise exception
      'Hay % líneas de ingreso con costo_unitario = NaN; corregilas antes de aplicar esta migración',
      v_sucios;
  end if;
end $$;

-- `<>` alcanza porque en numeric (a diferencia de IEEE 754) Postgres define
-- NaN = NaN como verdadero.
alter table ingreso_mercaderia_detalle
  add constraint ingreso_detalle_costo_no_nan
  check (costo_unitario <> 'NaN'::numeric);
