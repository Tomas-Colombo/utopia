-- 00049_producto_nombre_unico.sql
-- UP: nombre de producto único por tenant.
--
--     `categoria` ya tenía su índice de nombre único (00011) y `producto`
--     sólo lo tenía para el SKU (00013). El chequeo de nombre duplicado vivía
--     únicamente en el formulario de alta (`buscarMatchNombre`), así que un
--     doble click, dos pestañas abiertas o una llamada directa a la Server
--     Action metían el duplicado igual.
--
--     La normalización replica la del cliente (`lib/inventario/producto-match.ts`:
--     minúsculas, sin acentos, espacios colapsados) para que el formulario y
--     la base coincidan exactamente. Si sólo usáramos `lower(nombre)`, la app
--     rechazaría "Remera Ñandu" contra "Remera Ñandú" y la base lo aceptaría.
--
--     El índice cubre activos e inactivos: el formulario indexa el listado
--     completo (`listProductosConDetalle()` sin filtro), así que dar de baja un
--     producto no libera su nombre. Mismo criterio en los dos lados.
--
-- DOWN:
--   drop index if exists producto_tenant_nombre_uk;
--   drop function if exists producto_nombre_normalizado(text);

-- IMMUTABLE: requisito para poder usarla en un índice de expresión.
-- `translate` sobre el set acentuado del español evita depender de la
-- extensión `unaccent`, que es STABLE (depende del diccionario) y por eso
-- no se puede indexar.
create or replace function producto_nombre_normalizado(txt text)
returns text language sql immutable strict as $$
  select regexp_replace(
           trim(translate(lower(txt),
             'áàäâãéèëêíìïîóòöôõúùüûñç',
             'aaaaaeeeeiiiiooooouuuunc')),
           '\s+', ' ', 'g')
$$;

-- Falla ruidosamente y en seco si ya hay duplicados: `create unique index`
-- daría un error opaco ("could not create unique index") sin decir cuáles son.
do $$
declare
  v_dups text;
begin
  select string_agg(format('"%s" (tenant %s, %s veces)', nombre, id_tenant, n), '; ')
    into v_dups
  from (
    select id_tenant, min(nombre) as nombre, count(*) as n
      from producto
     group by id_tenant, producto_nombre_normalizado(nombre)
    having count(*) > 1
  ) d;

  if v_dups is not null then
    raise exception
      'Hay nombres de producto duplicados; resolvelos antes de aplicar esta migración -> %',
      v_dups;
  end if;
end $$;

create unique index if not exists producto_tenant_nombre_uk
  on producto(id_tenant, producto_nombre_normalizado(nombre));
