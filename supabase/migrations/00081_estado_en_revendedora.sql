-- 00081_estado_en_revendedora.sql
-- Slice 2: Estado en_revendedora (Migracion A)

-- DOWN:
--   -- OJO: los valores agregados a `estado_item` (enum de Postgres) NO se pueden
--   -- eliminar sin recrear el tipo y todas las vistas y tablas que lo referencian
--   -- (v_alerta_reposicion, item_producto, etc).

ALTER TYPE estado_item ADD VALUE 'en_revendedora';
