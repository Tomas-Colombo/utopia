-- 00031_producto_es_nuevo.sql
-- UP: agrega `es_nuevo` a `producto`. Marca los productos creados
--     automáticamente desde la importación de un remito PDF (el
--     proveedor no manda código, así que dependemos del nombre que
--     escriban). Sirve para filtrarlos y auditarlos/verificarlos luego.
--     (Ver flujo de precarga en app/(app)/inventario/ingresos/[id]).
-- DOWN:
--   alter table producto drop column if exists es_nuevo;

alter table producto
  add column if not exists es_nuevo boolean not null default false;

comment on column producto.es_nuevo is
  'true = creado automáticamente desde import de remito PDF; requiere revisión (nombre sin código de proveedor).';
