-- 00055_modulo_gastos.sql
-- UP: separa `gastos` de `rendiciones` en el catálogo de módulos.
--
-- Hasta acá Gastos vivía bajo el módulo 'rendiciones' (agrupados como
-- "cuentas financieras"), así que habilitar/deshabilitar o dar permisos
-- afectaba a los dos a la vez. Son dos pestañas distintas del sidebar y el
-- operador necesita habilitar cada una por separado.
--
-- La migración es no destructiva: 'rendiciones' sigue existiendo tal cual y
-- 'gastos' hereda su estado actual (habilitado por tenant + acciones por rol)
-- para que nadie pierda acceso al aplicarla.
--
-- DOWN:
--   update rol set permisos = permisos - 'gastos'
--    where permisos ? 'gastos';
--   delete from tenant_modulo tm
--    using modulo m
--    where m.id_modulo = tm.id_modulo and m.codigo = 'gastos';
--   delete from modulo where codigo = 'gastos';

insert into modulo (codigo, nombre) values ('gastos', 'Gastos')
on conflict (codigo) do nothing;

-- Cada tenant hereda para 'gastos' el mismo flag que tenía en 'rendiciones'.
-- Los tenants sin fila de 'rendiciones' quedan sin fila de 'gastos' (el guard
-- ya trata "sin fila" como deshabilitado).
insert into tenant_modulo (id_tenant, id_modulo, habilitado)
select tm.id_tenant, gas.id_modulo, tm.habilitado
from tenant_modulo tm
join modulo ren on ren.id_modulo = tm.id_modulo and ren.codigo = 'rendiciones'
cross join lateral (select id_modulo from modulo where codigo = 'gastos') gas
on conflict (id_tenant, id_modulo) do nothing;

-- Cada rol hereda en 'gastos' las acciones que tenía en 'rendiciones'.
update rol
   set permisos = permisos || jsonb_build_object('gastos', permisos -> 'rendiciones')
 where permisos ? 'rendiciones'
   and not permisos ? 'gastos';
