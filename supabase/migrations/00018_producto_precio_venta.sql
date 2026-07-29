-- 00018_producto_precio_venta.sql
-- UP: agrega `precio_venta` + `id_regla_margen_aplicada` + timestamps de
--     resolución a `producto` (Planificacion.txt Etapa 4 §80, RF-07:
--     "margen se fija UNA vez al alta"). El precio_venta se calcula al
--     alta o por acción explícita de "recalcular" — nunca se recalcula
--     silenciosamente al cambiar el costo (decisión de sesión).
-- DOWN:
--   alter table producto drop column if exists precio_venta_desactualizado;
--   alter table producto drop column if exists precio_venta_resuelto_at;
--   alter table producto drop column if exists id_regla_margen_aplicada;
--   alter table producto drop column if exists precio_venta;

alter table producto
  add column if not exists precio_venta numeric(14, 2) check (precio_venta is null or precio_venta >= 0),
  add column if not exists id_regla_margen_aplicada uuid references regla_precio(id_regla) on delete set null,
  add column if not exists precio_venta_resuelto_at timestamptz,
  add column if not exists precio_venta_desactualizado boolean not null default false;

-- Trigger: cuando cambia el costo vigente, marcar producto como
-- desactualizado (sin recalcular). Un job/pantalla "Control de precios"
-- lo pone al día explícitamente. Se hace en app-level en sp_set_costo_producto
-- para simplificar — no necesitamos un trigger DB para esto.
-- (Ver actualización de sp_set_costo_producto en 00019.)
