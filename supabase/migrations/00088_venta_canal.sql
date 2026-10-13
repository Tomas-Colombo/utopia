-- 00088_venta_canal.sql
-- Venta por canal: enum canal_venta, columnas en venta y detalle_venta, ampliación de inmutabilidad.
--
-- DOWN:
-- -- Restaurar tg_detalle_venta_inmutable a versión 00075
-- create or replace function tg_detalle_venta_inmutable()
-- returns trigger language plpgsql as $$
-- begin
--   if tg_op = 'DELETE' then
--     if not exists (select 1 from tenant where id_tenant = old.id_tenant) then
--       return old;
--     end if;
--     raise exception 'detalle-venta-inmutable: no se puede eliminar directamente' using errcode = '22023';
--   end if;
--   if tg_op = 'UPDATE' then
--     if new.id_tenant <> old.id_tenant or
--        new.id_venta <> old.id_venta or
--        new.id_item <> old.id_item or
--        new.id_producto <> old.id_producto or
--        new.id_proveedor is distinct from old.id_proveedor or
--        new.precio_venta <> old.precio_venta or
--        new.costo_snapshot <> old.costo_snapshot or
--        new.monto_proveedor <> old.monto_proveedor or
--        new.monto_gasto <> old.monto_gasto or
--        new.monto_ganancia <> old.monto_ganancia or
--        new.tipo_ingreso_snapshot <> old.tipo_ingreso_snapshot or
--        new.desglose_reglas is distinct from old.desglose_reglas then
--       raise exception 'detalle-venta-inmutable: solo se puede modificar id_rendicion y excluida_rendicion' using errcode = '22023';
--     end if;
--     return new;
--   end if;
-- end $$;
-- alter table detalle_venta drop column if exists excluida_liquidacion;
-- alter table detalle_venta drop column if exists id_liquidacion;
-- alter table detalle_venta drop column if exists monto_comision;
-- alter table detalle_venta drop column if exists porcentaje_comision_preview;
-- alter table venta drop constraint if exists venta_canal_revendedora_check;
-- alter table venta drop column if exists id_revendedora;
-- alter table venta drop column if exists canal;
-- drop type if exists canal_venta;

-- 1. Enum canal_venta
do $$ begin
  if not exists (select 1 from pg_type where typname = 'canal_venta') then
    create type canal_venta as enum ('local', 'revendedora', 'online');
  end if;
end $$;

-- 2. Columnas en venta
alter table venta
  add column if not exists canal canal_venta not null default 'local',
  add column if not exists id_revendedora uuid references revendedora(id_revendedora);

alter table venta
  drop constraint if exists venta_canal_revendedora_check,
  add constraint venta_canal_revendedora_check
    check (canal <> 'revendedora' or id_revendedora is not null);

-- 3. Columnas en detalle_venta
alter table detalle_venta
  add column if not exists porcentaje_comision_preview numeric(5,2) not null default 0 check (porcentaje_comision_preview >= 0 and porcentaje_comision_preview <= 100),
  add column if not exists monto_comision numeric(14,2) not null default 0 check (monto_comision >= 0),
  add column if not exists id_liquidacion uuid,
  add column if not exists excluida_liquidacion boolean not null default false;

-- 4. Trigger de inmutabilidad ampliado en detalle_venta (REQ-RV-DB-05)
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
    -- Si la línea ya está liquidada, no se puede alterar su liquidación ni su comisión
    if old.id_liquidacion is not null then
      if new.id_liquidacion is distinct from old.id_liquidacion or
         new.monto_comision <> old.monto_comision or
         new.excluida_liquidacion <> old.excluida_liquidacion then
        raise exception 'detalle-venta-inmutable: linea ya liquidada no se puede modificar' using errcode = '22023';
      end if;
    end if;

    -- Campos estrictamente congelados (precio, costo, ganancia, preview comision, etc.)
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
       new.desglose_reglas is distinct from old.desglose_reglas or
       new.porcentaje_comision_preview <> old.porcentaje_comision_preview then
      raise exception 'detalle-venta-inmutable: solo se puede modificar comision/liquidacion y rendicion' using errcode = '22023';
    end if;

    return new;
  end if;
end $$;
