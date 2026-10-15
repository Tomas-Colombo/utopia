-- 00108_admin_permisos_revendedoras.sql
-- Los roles Administrador de tenants provisionados antes del modulo
-- Revendedoras no tenian la clave `revendedoras`: el admin no veia el modulo.
-- Se agregan las acciones de gestion (no `ver_propio` ni `declarar`, que son
-- del rol Revendedora) solo donde el modulo esta habilitado.
-- DOWN:
-- update rol set permisos = permisos - 'revendedoras' where nombre = 'Administrador';

update rol r
set permisos = r.permisos || '{"revendedoras": ["ver", "crear", "editar", "eliminar", "liquidar"]}'::jsonb
where r.nombre = 'Administrador'
  and exists (
    select 1
    from tenant_modulo tm
    join modulo m on m.id_modulo = tm.id_modulo
    where tm.id_tenant = r.id_tenant
      and m.codigo = 'revendedoras'
      and tm.habilitado = true
  );
