-- 00037_ingreso_sin_proveedor.sql
-- UP: permite ingresos de mercadería sin proveedor (producción propia,
--     ofertas puntuales, ajustes de stock, mercadería sin origen). El
--     proveedor pasa a ser opcional: la FK se mantiene (si viene, tiene que
--     existir) pero acepta NULL. Ninguna función de negocio depende de
--     `id_proveedor` (sp_importar_remito / sp_confirmar_ingreso /
--     sp_cancelar_ingreso trabajan sobre el detalle), así que abrirlo es
--     seguro. El lado de lectura ya tipaba el proveedor como opcional.
-- DOWN:
--   -- Requiere que no existan ingresos sin proveedor antes de revertir.
--   alter table ingreso_mercaderia alter column id_proveedor set not null;

alter table ingreso_mercaderia
  alter column id_proveedor drop not null;

comment on column ingreso_mercaderia.id_proveedor is
  'Proveedor del ingreso; null = sin proveedor (producción propia, oferta, ajuste).';
