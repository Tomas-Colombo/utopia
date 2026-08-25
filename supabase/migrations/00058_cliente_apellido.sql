-- 00058_cliente_apellido.sql
-- UP: apellido del cliente, separado del nombre.
--
--     Motivo: la deuda en cuotas (00059) se busca por cliente, y con un solo
--     campo de texto libre no hay forma de ordenar una cartera alfabéticamente
--     por apellido — que es como se busca a una persona en una lista de
--     doscientas.
--
--     LOS CLIENTES EXISTENTES NO SE TOCAN. `apellido` queda NULL y su nombre
--     completo sigue siendo lo que haya en `nombre`, tal cual se cargó.
--     Deliberado: partir "María del Carmen Pérez López" con una heurística
--     acierta en los casos fáciles y destroza los reales, y esto son datos de
--     clientes de verdad, no un dataset de prueba. El operador los va
--     separando a mano cuando le toque editarlos.
--
--     Consecuencia asumida: al ordenar por apellido, los clientes viejos
--     quedan al final (NULLS LAST). Es honesto — todavía no se sabe cuál es
--     su apellido.
-- DOWN: al final, comentado.

alter table cliente add column if not exists apellido text;

-- Nombre para mostrar, calculado por la DB. Existe para que los ~15 lugares
-- que muestran un cliente (ventas, reservas, rendiciones, export, combobox
-- del mostrador) no tengan que concatenar cada uno por su cuenta: una sola
-- definición, imposible de desincronizar.
--
-- Orden natural "Nombre Apellido" porque es como se lee. El ORDEN ALFABÉTICO
-- no usa esta columna: usa `apellido` con `nombre` de desempate (ver el
-- índice de abajo), que es un criterio distinto y no se puede derivar de
-- este texto.
alter table cliente add column if not exists nombre_completo text
  generated always as (trim(nombre || ' ' || coalesce(apellido, ''))) stored;

-- Búsqueda por nombre completo tipeado de corrido ("juan perez").
create index if not exists cliente_nombre_completo_idx
  on cliente(id_tenant, nombre_completo);

-- Orden alfabético por apellido. `nulls last` acompaña al ORDER BY del DAL:
-- sin esto Postgres ordena NULLS LAST en ASC igual, pero el índice sólo se
-- usa si la declaración coincide con la consulta.
create index if not exists cliente_apellido_idx
  on cliente(id_tenant, apellido nulls last, nombre);

comment on column cliente.apellido is
  'Opcional: el mostrador recibe gente que da sólo el nombre de pila. NULL en '
  'todos los clientes anteriores a 00058 — su nombre completo vive en `nombre`.';

comment on column cliente.nombre_completo is
  'Generada. Para MOSTRAR. Para ORDENAR alfabéticamente usar apellido + nombre.';

-- ─── DOWN ────────────────────────────────────────────────────────────
--   drop index if exists cliente_apellido_idx;
--   drop index if exists cliente_nombre_completo_idx;
--   alter table cliente drop column if exists nombre_completo;
--   alter table cliente drop column if exists apellido;
