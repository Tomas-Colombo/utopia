# REQ-RV-MOD — Módulo, permisos y bloqueo multitenant

**Change**: `modulo-revendedoras`
**Fuente de verdad de permisos**: `CATALOGO_PERMISOS` (`lib/types/administracion.ts`).
Esta spec existe porque el borrador solo decía "mostrarlo en RolesModal".

Reglas del proyecto que rigen todo lo de abajo: `requireModuleRole` en cada Server
Action (el `layout.tsx` solo controla `ver`); chequeo de módulo habilitado **y**
permiso en memoria (`session.modulosHabilitados` + `session.permisos`); RLS solo
filtra por tenant.

## Alta del módulo

- **REQ-RV-MOD-01** `supabase/seed.sql` agrega `('revendedoras', 'Revendedoras')` al
  catálogo `modulo`, idempotente. Una migración inserta la misma fila para bases ya
  creadas (escritura por service-role, política de `00003`). `tests/db/seed-idempotency.test.ts`
  sigue verde.
- **REQ-RV-MOD-02** `CATALOGO_PERMISOS.revendedoras = ['ver','crear','editar','eliminar','liquidar','ver_propio','declarar']`
  y `MODULO_NOMBRE.revendedoras = 'Revendedoras'`. `permisosSchema` se deriva del catálogo
  (no se escribe una segunda lista). `PermisosEditor` / `RolesModal` lo muestran sin código
  propio; se verifica con un test.
- **REQ-RV-MOD-03** `docs/modulos.md` se actualiza en el mismo commit: ruta `revendedoras`,
  permiso `revendedoras`, dominio DAL `revendedoras`. Pasan de 8 a 9 los permisos.
- **REQ-RV-MOD-04** `NAV_ITEMS` del Sidebar suma `/revendedoras`, `moduloCodigo: 'revendedoras'`,
  grupo `OPERACIONES`. Lo filtra `hasPermission(...,'ver')`. El módulo apagado desaparece del
  rail porque `session.permisos` se arma solo con módulos habilitados (se verifica; si no,
  se filtra con `hasModuleAccess`).
- **REQ-RV-MOD-05** `app/(app)/revendedoras/layout.tsx` llama
  `requireModuleRole(session, 'revendedoras', 'ver')`.
- **REQ-RV-MOD-06** `scripts/provision-tenant.mts`: el comportamiento por defecto sin
  `--modulos` habilita **todo** el catálogo. Documentar en `docs/` que Revendedoras es un
  módulo vendible y que se aprovisiona con `--modulos` explícito para quien no lo contrató.

## Matriz de bloqueo (cada fila lleva test)

"Apagado" = `tenant_modulo.habilitado = false` o sin fila. "Sin permiso" = rol sin la acción.

| Punto | Apagado | Sin permiso | Cómo |
|---|---|---|---|
| Ruta `/revendedoras/**` | `module-disabled` | `no-permission` | layout `ver` |
| Cada Server Action de `revendedoras` | `{ok:false}` | `{ok:false}` | `requireModuleRole(...,accion)` primero, luego `safeParse`, luego DAL |
| Liquidar / marcar pagada | rechazado | rechazado sin `liquidar` | acción `liquidar` |
| Ítem de Sidebar | oculto | oculto | `hasPermission ver` |
| Selector de canal en `NuevaVentaView` | no se renderiza | no se renderiza | `hasModuleAccess(session,'revendedoras','ver')` desde el server component |
| **Server Action de ventas con `canal='revendedora'`** | `module-disabled` | `no-permission` | además de `ventas/crear`, exige `requireModuleRole(session,'revendedoras','crear')` cuando el canal no es `local` |
| Filtro y columna de canal en la lista de ventas | ocultos; el parámetro de URL se ignora | idem | misma condición |
| Comisión del vendedor del local (`ámbito local`) | no se calcula ni se escribe | — | `sp_registrar_venta` consulta `tenant_modulo` y deja `monto_comision = 0` |
| Bloque `revendedoras` de `/reportes` | no aparece | no aparece | `bloquesVisibles` suma `'revendedoras'` solo con `hasModuleAccess(session,'revendedoras','ver')` |
| Línea `comision_liquidada` en Resultados | se muestra en 0 solo si el módulo está activo; apagado: la línea no aparece | — | derivada de datos; sin módulo no hay filas |
| Stock "en revendedora" en inventario | columna y filtro ocultos | — | idem |
| RPC directo `sp_*` de revendedoras | cada SP valida `tenant_modulo` del `auth_tenant_id()` y levanta `modulo-revendedoras-deshabilitado` | — | defensa en profundidad; la UI no es la barrera |

- **REQ-RV-MOD-07** Deshabilitar el módulo **no borra ni oculta datos del tenant en la base**;
  solo corta el acceso. Rehabilitarlo recupera todo. Las ventas de canal `revendedora` ya
  hechas siguen contando en finanzas (son ventas reales), aunque el bloque de revendedoras
  no se vea.
- **REQ-RV-MOD-08** Aislamiento: se extiende `tests/db/e2e-tenant-isolation.test.ts` y
  `rls-enforcement.test.ts` con todas las tablas nuevas. Dos tenants, mismos nombres de
  revendedora, ninguno ve al otro; `service-role` solo en el harness de tests.
- **REQ-RV-MOD-09** Toda tabla nueva lleva `id_tenant`, RLS `id_tenant = auth_tenant_id()`
  y, en tablas hijas, la FK compuesta o el trigger que impide cruzar tenants (una consignación
  del tenant A no puede apuntar a una revendedora del B). Se prueba con inserción cruzada.
- **REQ-RV-MOD-10** No hay superficie sin sesión en este cambio. Las rutas de la revendedora
  están en `app/(revendedora)/` y exigen sesión (ver `REQ-RV-ACC`); ningún uso de service-role
  fuera de lo permitido en AGENTS.md (alta de acceso: patrón `inviteUsuario`).
- **REQ-RV-MOD-11** Con el módulo apagado, la revendedora ya con login recibe
  `modulo-revendedoras-deshabilitado` en `/mi-cuenta` y en toda función `rvp_*`.
