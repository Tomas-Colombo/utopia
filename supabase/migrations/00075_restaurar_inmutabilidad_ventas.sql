-- 00075_restaurar_inmutabilidad_ventas.sql
-- UP: recrea los triggers de inmutabilidad y el cuadre de pagos de 00068.
--
-- Por qué: el bloque "-- DOWN" de 00068 tenía sentencias `drop trigger` /
-- `drop function` SIN comentar, así que esa migración creaba los triggers y los
-- borraba en la misma corrida. En una base armada desde las migraciones
-- (supabase db reset, CI) venta, detalle_venta y pago_venta quedaron sin
-- protección. 00068 no se edita porque puede estar aplicada en una base
-- compartida; esta migración repone lo que debía haber dejado.
--
-- Definiciones copiadas de 00068 (secciones 1 a 4), con `drop trigger if exists`
-- previo para poder correr también sobre una base donde sí existan.
--
-- DOWN:
--   drop trigger if exists tr_venta_cuadre_pagos on venta;
--   drop function if exists tg_venta_cuadre_pagos();
--   drop trigger if exists tr_pago_venta_inmutable on pago_venta;
--   drop function if exists tg_pago_venta_inmutable();
--   drop trigger if exists tr_detalle_venta_inmutable on detalle_venta;
--   drop function if exists tg_detalle_venta_inmutable();
--   drop trigger if exists tr_venta_inmutable on venta;
--   drop function if exists tg_venta_inmutable();

-- 1. Trigger de inmutabilidad en venta
create or replace function tg_venta_inmutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from tenant where id_tenant = old.id_tenant) then
      return old;
    end if;
    raise exception 'venta-inmutable: Una venta no puede modificarse ni eliminarse directamente (intentando: %). Se debe anular mediante id_reserva_anulacion', tg_op using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.total <> old.total or
       new.fecha <> old.fecha or
       new.id_cliente is distinct from old.id_cliente or
       new.forma_pago <> old.forma_pago or
       new.financiacion is distinct from old.financiacion or
       new.id_tenant <> old.id_tenant then
      raise exception 'venta-inmutable: Una venta no puede modificarse ni eliminarse directamente (intentando: %). Se debe anular mediante id_reserva_anulacion', tg_op using errcode = '22023';
    end if;
    return new;
  end if;
end $$;

drop trigger if exists tr_venta_inmutable on venta;
create trigger tr_venta_inmutable
before update or delete on venta
for each row execute function tg_venta_inmutable();

-- 2. Trigger de inmutabilidad en detalle_venta
create or replace function tg_detalle_venta_inmutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from tenant where id_tenant = old.id_tenant) then
      return old;
    end if;
    raise exception 'detalle-venta-inmutable: no se puede eliminar directamente' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.id_tenant <> old.id_tenant or
       new.id_venta <> old.id_venta or
       new.id_item <> old.id_item or
       new.id_producto <> old.id_producto or
       new.id_proveedor is distinct from old.id_proveedor or
       new.precio_venta <> old.precio_venta or
       new.costo_snapshot <> old.costo_snapshot or
       new.monto_proveedor <> old.monto_proveedor or
       new.monto_gasto <> old.monto_gasto or
       new.monto_ganancia <> old.monto_ganancia or
       new.tipo_ingreso_snapshot <> old.tipo_ingreso_snapshot or
       new.desglose_reglas is distinct from old.desglose_reglas then
      raise exception 'detalle-venta-inmutable: solo se puede modificar id_rendicion y excluida_rendicion' using errcode = '22023';
    end if;
    return new;
  end if;
end $$;

drop trigger if exists tr_detalle_venta_inmutable on detalle_venta;
create trigger tr_detalle_venta_inmutable
before update or delete on detalle_venta
for each row execute function tg_detalle_venta_inmutable();

-- 3. Trigger de inmutabilidad en pago_venta
create or replace function tg_pago_venta_inmutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from tenant where id_tenant = old.id_tenant) then
      return old;
    end if;
    raise exception 'pago-venta-inmutable: no se puede eliminar directamente' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'pago-venta-inmutable: no se puede modificar directamente' using errcode = '22023';
  end if;
end $$;

drop trigger if exists tr_pago_venta_inmutable on pago_venta;
create trigger tr_pago_venta_inmutable
before update or delete on pago_venta
for each row execute function tg_pago_venta_inmutable();

-- 4. Constraint diferida de cuadre de pagos
create or replace function tg_venta_cuadre_pagos()
returns trigger language plpgsql as $$
declare
  v_suma numeric(14, 2) := 0;
begin
  select coalesce(sum(monto), 0) into v_suma from pago_venta where id_venta = new.id_venta;
  select v_suma + coalesce(sum(monto), 0) into v_suma from cuota_financiada where id_venta = new.id_venta;
  
  if v_suma <> new.total then
    raise exception 'cuadre-pagos-fallido: total de venta % no coincide con suma de pagos y cuotas %', new.total, v_suma using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists tr_venta_cuadre_pagos on venta;
create constraint trigger tr_venta_cuadre_pagos
after insert on venta
deferrable initially deferred
for each row execute function tg_venta_cuadre_pagos();
