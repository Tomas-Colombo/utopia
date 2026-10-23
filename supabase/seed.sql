-- Utopia base seed data: catalog of modules.
-- Mandatory platform metadata: required for any tenant to exist.
-- Applied on `supabase db reset` (local and linked).
-- Idempotent by design; safe to re-run.

insert into modulo (codigo, nombre) values
  ('inventario', 'Inventario'),
  ('ventas', 'Ventas'),
  ('precios', 'Precios'),
  ('consignaciones', 'Consignaciones'),
  ('rendiciones', 'Rendiciones'),
  ('gastos', 'Gastos'),
  ('reportes', 'Reportes'),
  ('administracion', 'Administración'),
  ('revendedoras', 'Revendedoras')
on conflict (codigo) do nothing;
