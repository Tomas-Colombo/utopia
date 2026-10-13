-- 00092_medio_pago_cuenta_revendedora.sql
-- Slice 6d: Medio de pago cuenta_revendedora (DR-14)

-- DOWN:
--   -- OJO: en PostgreSQL `ALTER TYPE ... ADD VALUE` no tiene DROP VALUE correspondiente.
--   -- Para revertir se requeriría recrear el tipo enum y todas las tablas/vistas/funciones que lo usan.

ALTER TYPE medio_pago ADD VALUE 'cuenta_revendedora';
