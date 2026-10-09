# Design: Módulo Revendedoras

**Change**: `modulo-revendedoras` · **Specs**: `specs/REQ-RV-MOD.md`, `specs/REQ-RV-DB.md`
**Decisiones**: cerradas en `proposal.md §4`.

## 1. Capas (AGENTS.md, sin excepciones)

```
app/(app)/revendedoras/**   rutas + Server Actions       — sin SQL
components/revendedoras/**  UI                            — sin SQL
lib/dal/revendedoras/**     único lugar que consulta Supabase
lib/comisiones/**           lógica pura (resolver TS + fixtures)
lib/validation/revendedoras.ts   zod strictObject
supabase/migrations/        invariantes y escrituras (sp_*)
```

Dominios nuevos: ruta `revendedoras`, permiso `revendedoras`, DAL `revendedoras`
(los tres coinciden; no hace falta la tabla de excepciones de `docs/modulos.md`).

## 2. Cómo se compone con los otros módulos

Revendedoras **no** posee ventas, inventario ni reportes: les agrega una dimensión.
Por eso cada cruce es condicional al módulo (matriz en `REQ-RV-MOD`):

```
ventas ──(canal != local)──▶ exige además permiso revendedoras/crear
reportes ─ bloquesVisibles ─▶ suma 'revendedoras' si hasModuleAccess
inventario ─ estado en_revendedora ─▶ badge exhaustivo (guardia never)
finanzas ─ v_linea_venta.comision ─▶ rf_finanzas_* (cifra única, sin TS)
```

Regla de oro: **la UI oculta, la Server Action rechaza, el SP vuelve a validar**. Las
tres capas, porque un POST directo salta la primera y un `rpc` directo salta las dos.

## 3. Tres maneras de preguntar "¿puede?" (no confundirlas)

| Capa | Pregunta | Dónde |
|---|---|---|
| Módulo | ¿el tenant lo contrató? | `session.modulosHabilitados` / `tenant_modulo` en SP |
| Rol | ¿el rol tiene la acción? | `session.permisos` → `requireModuleRole` |
| Fila | ¿la fila es de este tenant? | RLS `id_tenant = auth_tenant_id()` (única barrera de datos) |

Hay una **cuarta capa, por usuario**, que este cambio introduce solo para la revendedora
(`REQ-RV-ACC`): el claim `id_revendedora` y policies `RESTRICTIVE` que niegan por defecto en
todas las tablas. El operador no tiene el claim y no cambia de comportamiento.

```
JWT  tenant_id ─▶ RLS permisiva existente (tenant)
JWT  id_revendedora ─▶ RLS restrictiva nueva (solo lista blanca) + funciones rvp_*
```

## 4. Comisión: dónde se calcula y cuándo

```
venta ──▶ detalle_venta.porcentaje_comision_preview   (informativo, congelado)
liquidar ▶ fn_resolver_comision(total del período)    (UNA vez, autoridad SQL)
        ▶ detalle_venta.monto_comision por línea       (único momento en que se escribe)
finanzas ▶ resta solo comision_liquidada               (DR-2)
```

El preview en `CobranzaPanel` usa el resolutor TS y se rotula como estimación. Los
fixtures compartidos garantizan que TS y SQL no se desvíen.

## 5. Trade-offs asumidos

- **Devengar al liquidar** (DR-2) deja el tablero con un tramo "pendiente" visible en vez de
  una cifra que cambia hacia atrás. Costo: la ganancia final del mes en curso no incluye las
  comisiones aún sin liquidar; el aviso lo hace explícito.
- **Login real con policies restrictivas** (DR-12) en vez de reescribir las policies de cada
  tabla: más barato y falla cerrado, pero obliga a mantener la guardia anti-olvido y a que
  cada tabla nueva del proyecto cumpla la regla.
- **Funciones `rvp_*` DEFINER** (DR-13): rompen la regla "lecturas INVOKER", pero es la única
  forma de ocultar columnas de costo. Se acota por prefijo, identidad del claim y snapshot.
- **Declarar/confirmar** (DR-11) agrega un paso al local, a cambio de que ninguna cifra
  dependa de datos sin confirmar.
- **Una sola tabla de reglas con ventana de vigencia** en vez de versionar tramos: más simple;
  el `EXCLUDE` impide solapes y la historia queda en las reglas vencidas.
- **Bloqueo en tres capas** cuesta un chequeo repetido en cada SP; es el precio de que el
  flag de módulo sea real y no cosmético.

## 6. Qué no se toca

Cálculo de precios y recargos, módulo `consignaciones` (proveedores), `rendiciones`,
cuotas. Si un SP compartido cambia (`sp_registrar_venta`, `sp_anular_venta`,
`is_transicion_item_valida`, trigger de inmutabilidad), se parte de su última definición
y el set de tests existente debe seguir en verde antes de agregar la rama nueva.
