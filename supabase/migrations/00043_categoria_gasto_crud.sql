-- Alta/baja de categorías de gasto desde /gastos/presupuestos.
-- Se registra `fecha_baja` cuando se hace soft-delete (categoría con gastos
-- históricos que la referencian). Cuando no tiene gastos, el caller hace un
-- DELETE físico y esta columna nunca se usa.
ALTER TABLE public.categoria_gasto
  ADD COLUMN IF NOT EXISTS fecha_baja timestamptz NULL;

-- Nombre único por tenant entre las activas: permite reutilizar el nombre de
-- una categoría dada de baja sin bloquear el alta.
CREATE UNIQUE INDEX IF NOT EXISTS categoria_gasto_tenant_nombre_activa_uidx
  ON public.categoria_gasto (id_tenant, lower(nombre))
  WHERE activa = true;
