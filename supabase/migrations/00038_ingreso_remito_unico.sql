-- 00038_ingreso_remito_unico.sql
-- UP: control de unicidad opcional del número de remito. En la vida real un
--     mismo número de remito se repite entre proveedores distintos (cada uno
--     tiene su propia numeración), pero el MISMO proveedor no entrega dos veces
--     el mismo remito — eso sería cargar el remito por error. Por eso la
--     unicidad es por (tenant, proveedor, numero_remito), y sigue siendo
--     opcional: numero_remito null no participa del índice. Los ingresos sin
--     proveedor se agrupan con un uuid centinela para deduplicar entre sí.
-- DOWN:
--   drop index if exists ingreso_mercaderia_remito_uniq;

create unique index if not exists ingreso_mercaderia_remito_uniq
  on ingreso_mercaderia (
    id_tenant,
    coalesce(id_proveedor, '00000000-0000-0000-0000-000000000000'::uuid),
    numero_remito
  )
  where numero_remito is not null;

comment on index ingreso_mercaderia_remito_uniq is
  'Remito único por (tenant, proveedor); numero_remito null no participa. Un mismo remito puede repetirse entre proveedores distintos, no dentro del mismo.';
