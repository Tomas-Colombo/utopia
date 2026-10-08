# Tasks — finanzas-panel

**Change**: `finanzas-panel`
**Slices**: 13 PRs encadenados (proposal §Deliverables)
**Delivery**: force-chained (400-line budget per PR)
**Strict TDD**: ACTIVO desde el inicio

## Review Workload Forecast

- Líneas estimadas totales (14 slices): **~3,700–4,100**
- Riesgo de presupuesto 400 líneas: **Medio-Alto**
- PRs encadenados: **Sí** — stacked to main
- Decisión antes de apply: **No** (decisiones cerradas en la propuesta §4)

```text
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium-High
Decision needed before apply: No
```

### Review Workload Forecast por slice

| Slice | Goal | PR est. | Est. líneas | Riesgo |
|-------|------|---------|-------------|--------|
| 1 | Zona horaria (00066) | PR 1 | ~120 | Bajo |
| 2 | Ganancia correcta (00067) | PR 2 | ~150 | Medio |
| 3 | Inmutabilidad (00068) | PR 3 | ~200 | Alto |
| 4 | Incobrables (00069) | PR 4 | ~100 | Bajo |
| 5 | Tablas reversas + sp_anular (00070a) | PR 5 | ~200 | Medio |
| 6 | sp_devolucion + rendición (00070b) | PR 6 | ~200 | Medio |
| 7 | DAL + Actions + UI ventas | PR 7 | ~350 | Alto |
| 8 | Lectura única (resultados/flujo) (00071a) | PR 8 | ~300 | Alto |
| 9 | Lectura única (resto) (00071b) | PR 9 | ~300 | Alto |
| 10 | DAL + helpers puros | PR 10 | ~350 | Medio |
| 11 | page + form + error + loading | PR 11 | ~300 | Medio |
| 12 | Bloques 1–5 | PR 12 | ~350 | Medio |
| 13 | Bloques 6–9 + gráfico | PR 13 | ~350 | Medio |
| 14 | Limpieza + docs | PR 14 | ~200 | Bajo |

---

## Fase 0 — Gate humano

- [x] Aprobar especificación completa (las decisiones DC-1 a DC-17 están cerradas).
- [x] NO AVANZAR a la Fase 1 / Slice 1 hasta recibir aprobación ESCRITA del usuario en el chat.

---

## Slice 1 — Zona horaria por tenant (~120 líneas)

**Goal**: `fn_hoy_tenant()`, `fn_rango_tenant()`, `tenant.zona_horaria`.
**Closes**: REQ-DB-01.
**Depends on**: nada.

**Pre-condición**: `supabase db reset` sin errores con las migraciones 00001–00065.

### 1.1 Test primero (antes de la migración)

- [ ] `tests/db/integridad-ventas.test.ts` — casos de zona horaria:
  - `fn_hoy_tenant()` devuelve la fecha en Buenos Aires, no en UTC.
  - `fn_rango_tenant('2026-01-01','2025-12-31')` levanta error `periodo-invalido`.
  - `fn_rango_tenant` con rango > 800 días levanta error.
  - Una venta registrada a las 23:30 (hora tenant) del 31/01 cae en enero, no en febrero.

### 1.2 Migración

- [ ] `supabase/migrations/00066_zona_horaria_tenant.sql`:
  - `ALTER TABLE tenant ADD COLUMN zona_horaria...`
  - `fn_hoy_tenant()` definida.
  - `fn_rango_tenant()` definida.
  - Reemplazar `current_date` → `fn_hoy_tenant()` en `sp_registrar_venta`, `sp_calcular_costo_cobro` y la vista `a_acreditar`.
  - Verificar si `seed.sql` y `scripts/provision-tenant.mts` necesitan ajustes.
  - `-- DOWN:` y bloque de rollback al final.
  - `supabase db reset` sin errores.

### 1.3 Gate

- [ ] `npx vitest run tests/db` (marcar NO VERIFICADO si no hay Docker).
- [ ] `pnpm typecheck && pnpm lint && npx vitest run --exclude 'tests/db/**' && pnpm build`.

---

## Slice 2 — Ganancia correcta (~150 líneas)

**Goal**: `monto_ganancia = precio_venta − costo_snapshot` para compra Y consignación.
**Closes**: REQ-DB-02.
**Depends on**: Slice 1.

### 2.1 Test primero

- [ ] `tests/db/integridad-ventas.test.ts` — casos de ganancia:
  - `INSERT detalle_venta` con `monto_ganancia ≠ precio_venta - costo_snapshot` → error.
  - `INSERT detalle_venta` de compra con `monto_proveedor ≠ 0` → error.
  - `INSERT detalle_venta` de consignación con `monto_proveedor ≠ costo_snapshot` → error.
  - Venta de compra: `monto_ganancia` = `precio - costo`, NO `precio` entero.

### 2.2 Migración

- [ ] `rg "monto_ganancia\|monto_proveedor" lib/ app/ supabase/` → verificar ningún consumidor asume el significado viejo.
- [ ] `supabase/migrations/00067_ganancia_y_costo_consistentes.sql`:
  - Redefinir `sp_registrar_venta` con cálculo correcto.
  - Agregar CHECKs en `detalle_venta` (sin `NOT VALID`).
  - `-- DOWN:` con `DROP CONSTRAINT` y redefinición del SP viejo.
  - `supabase db reset` sin errores.

### 2.3 Gate

- [ ] Tests de DB.
- [ ] Gate completo.

---

## Slice 3 — Inmutabilidad de ventas (~200 líneas)

**Goal**: Triggers de inmutabilidad + invariante de cuadre de pagos.
**Closes**: REQ-DB-03, REQ-DB-04.
**Depends on**: Slice 2.

### 3.1 Test primero (TDD estricto — tests que DEBEN FALLAR antes de la migración)

- [ ] `tests/db/integridad-ventas.test.ts`:
  - `UPDATE venta SET total = X` → error (trigger).
  - `UPDATE venta SET fecha = X` → error.
  - `UPDATE detalle_venta SET precio_venta = X` → error.
  - `DELETE FROM pago_venta WHERE ...` → error.
  - Insertar `detalle_venta` con `monto_ganancia` incorrecto → error (de Slice 2).
  - Venta cuyos `pago_venta` no suman a `total` → error al commit.
  - Cobrar cuota de venta anulada → error `venta-anulada`.
  - **Borrar tenant completo con ventas y pagos → éxito** (test de regresión crítico).

### 3.2 Leer antes de escribir

- [ ] Leer `00065_borrar_tenant_con_ingresos_confirmados.sql` para entender el mecanismo de bypass (`not exists (select 1 from tenant where id_tenant = old.id_tenant)`).
- [ ] Leer `00064` líneas 393–412 para entender si `sp_registrar_venta` hace `UPDATE total` post-insert.

### 3.3 Migración

- [ ] `supabase/migrations/00068_inmutabilidad_ventas.sql`:
  - Trigger `BEFORE UPDATE` en `venta`.
  - Trigger `BEFORE UPDATE` en `detalle_venta`.
  - Trigger/policy append-only en `pago_venta`.
  - Si `sp_registrar_venta` hace `UPDATE total`: reescribir para calcular total antes del insert (en la misma migración).
  - Trigger de constraint diferida `DEFERRABLE INITIALLY DEFERRED` en `venta` (cuadre de pagos).
  - Mecanismo de bypass para borrado de tenant.
  - `-- DOWN:` completo.
  - `supabase db reset` sin errores.

### 3.4 Gate

- [ ] Tests de DB (incluyendo el test de borrado de tenant).
- [ ] Gate completo.

---

## Slice 4 — Incobrables sin doble conteo (~100 líneas)

**Goal**: `sp_marcar_cuota_incobrable` no crea `gasto_negocio`; guards de venta anulada.
**Closes**: REQ-DB-05.
**Depends on**: Slice 3.

### 4.1 Test primero

- [ ] `tests/db/integridad-ventas.test.ts`:
  - Marcar cuota incobrable → NO genera `gasto_negocio`.
  - Cobrar cuota de venta anulada → error `venta-anulada`.
  - Marcar incobrable de venta anulada → error `venta-anulada`.

### 4.2 Migración

- [ ] `supabase/migrations/00069_incobrables_sin_gasto.sql`:
  - Quitar llamada a `sp_registrar_gasto` en `sp_marcar_cuota_incobrable`.
  - Agregar guard de `venta.estado_venta = 'anulada'` en ambos SPs.
  - `-- DOWN:` (restaura la llamada al SP de gastos).
  - `supabase db reset` sin errores.

### 4.3 Gate

- [ ] Tests de DB.
- [ ] Gate completo.

---

## Slice 5 — Tablas de reversas + sp_anular_venta (~200 líneas)

**Goal**: `devolucion_venta`, `reintegro_cliente`, `sp_anular_venta` con reintegros.
**Closes**: REQ-DB-06, REQ-DB-07.
**Depends on**: Slice 4.

### 5.1 Test primero

- [ ] `tests/db/reversas.test.ts`:
  - Anulación de venta contado → crea `reintegro_cliente`, retorna `total_reintegrado`.
  - Anulación de venta con cuotas pagadas → crea reintegros por los pagos.
  - Anulación bloqueada por incobrable → error `venta-con-incobrables`.

### 5.2 Migración

- [ ] `supabase/migrations/00070_reintegro_y_devolucion.sql` (primera parte):
  - `CREATE TABLE devolucion_venta` (REQ-DB-06).
  - `CREATE TABLE reintegro_cliente` (REQ-DB-06).
  - RLS en ambas.
  - `sp_anular_venta` modificado (REQ-DB-07).
  - `-- DOWN:`.

### 5.3 Gate

- [ ] Tests de DB.
- [ ] Gate completo.

---

## Slice 6 — sp_registrar_devolucion_cliente + rendición (~200 líneas)

**Goal**: Devolución de cliente con reintegro; rendición excluye devueltos.
**Closes**: REQ-DB-08, REQ-DB-09.
**Depends on**: Slice 5.

### 6.1 Test primero

- [ ] `tests/db/reversas.test.ts`:
  - Devolución total pagada → reintegro por el monto de la línea.
  - Devolución en venta con varias líneas → reintegro = max(0, Σ pagos − (venta.total − Σ devoluciones previas − monto de esta línea) − Σ reintegros previos).
  - Devolución bloqueada (cuotas abiertas / rendida / anulada / ya devuelta).
  - Consignación devuelta → NO entra en `sp_generar_rendicion`.

### 6.2 Migración (continuación de 00070)

- [x] Continuación de `00070` o nueva migración si supera 400 líneas:
  - [x] `sp_registrar_devolucion_cliente` reescrito (REQ-DB-08).
  - [x] `sp_generar_rendicion` modificado para excluir devueltos (REQ-DB-09).
  - [x] Actualizar `v_perfil_proveedor` si consulta el mismo campo.
  - [x] `-- DOWN:` completo.

### 6.3 Gate

- [x] Tests de DB.
- [x] Gate completo.

---

## Slice 7 — DAL + Server Actions + UI de Ventas (~350 líneas)

**Goal**: Wrappers DAL, actions con 3 compuertas, UI de anulación y devolución.
**Closes**: REQ-APP-06 (slugs), parte de Fase 2.5 de la propuesta.
**Depends on**: Slice 6.

- [x] `rg "anular\|devolucion" app/\(app\)/ventas/ lib/dal/ventas/` para localizar code existente.
- [x] Slugs en `lib/errores/mensajes.ts` + inventario en `lib/errores/mensajes.test.ts`.
- [x] Schemas Zod en `lib/validation/ventas.ts` (`z.strictObject`).
- [x] Wrappers en `lib/dal/ventas/ventas.ts`.
- [x] Server Actions con 3 compuertas.
- [x] `AnularVentaDialog.tsx`: muestra `total_reintegrado` antes de confirmar.
- [x] `DevolucionDialog.tsx`: flujo de reembolso con cuenta/medio.
- [x] Gate completo.

---

## Slice 8 — Capa de lectura única (resultados/flujo) (00071) (~300 líneas)

**Goal**: `v_linea_venta`, `rf_finanzas_resultados`, `rf_finanzas_flujo`.
**Closes**: REQ-DB-10, REQ-DB-11, REQ-DB-12.
**Depends on**: Slice 6.

**ESCRIBIR TESTS ANTES** (TDD estricto):

- [x] `tests/db/finanzas.test.ts`:
  - Escenario A completo con números exactos de §7 para resultados y flujo.
  - Escenario B completo para resultados y flujo.
  - Casos de borde aplicables a resultados y flujo.

- [x] `supabase/migrations/00072_finanzas_lectura_1.sql`:
  - `CREATE VIEW v_linea_venta` (REQ-DB-10).
  - `rf_finanzas_resultados` (REQ-DB-11).
  - `rf_finanzas_flujo` (REQ-DB-12).
  - `GRANT EXECUTE` a `authenticated` en cada función.
  - `-- DOWN:`.
  - `supabase db reset` + escenario dorado pasa.

- [x] Gate completo.

---

## Slice 9 — Capa de lectura única (resto) (00072) (~300 líneas)

**Goal**: `rf_finanzas_serie_mensual`, `rf_finanzas_posicion`, `rf_finanzas_ranking_productos`, `rf_finanzas_gastos_presupuesto`, `fn_contexto_periodo`.
**Closes**: REQ-DB-13 a REQ-DB-17.
**Depends on**: Slice 8.

**ESCRIBIR TESTS ANTES** (TDD estricto):

- [x] `tests/db/finanzas.test.ts`:
  - Escenario A y B para posición.
  - Todos los casos de borde restantes de §7.
  - `rf_finanzas_serie_mensual`: un solo escaneo agrupado (verificar con `EXPLAIN`).
  - `rf_finanzas_ranking_productos`: `orden-invalido` con valor fuera de lista blanca.

- [x] `supabase/migrations/00072_finanzas_lectura_2.sql`:
  - `rf_finanzas_serie_mensual` (REQ-DB-13).
  - `rf_finanzas_posicion` (REQ-DB-14).
  - `rf_finanzas_ranking_productos` (REQ-DB-15).
  - `rf_finanzas_gastos_presupuesto` (REQ-DB-16).
  - `fn_contexto_periodo` (REQ-DB-16).
  - `GRANT EXECUTE` a `authenticated` en cada función.
  - `-- DOWN:`.
  - `supabase db reset` + escenario dorado pasa.

- [x] Gate completo.

---

## Slice 10 — DAL, validación y helpers puros (~350 líneas)

**Goal**: `finanzas.ts`, `reportes.ts` (validación), `moneda.ts`, `bloques.ts`, `periodo.ts`.
**Closes**: REQ-APP-01 a REQ-APP-05.
**Depends on**: Slice 9 (tipos de retorno vienen de las RF).

- [x] `lib/utils/moneda.ts` + `moneda.test.ts`.
- [x] Agregar `lib/utils/moneda.ts` al `include` de cobertura en `vitest.config.mts`.
- [x] `lib/reportes/bloques.ts` + `bloques.test.ts` (tabla de visibilidad por combinaciones módulo/permiso).
- [x] `lib/reportes/periodo.ts` + `periodo.test.ts`.
- [x] Agregar `lib/reportes/bloques.ts` y `periodo.ts` al `include` de cobertura.
- [x] `hasModuleAccess` en `lib/dal/guard.ts`.
- [x] `lib/validation/reportes.ts` + `reportes.test.ts`.
- [x] `lib/types/reportes.ts` — agregar tipos de finanzas (no borrar los actuales).
- [x] `lib/dal/reportes/finanzas.ts`.
- [x] Gate completo.

---

## Slice 11 — page + form + error + loading (~300 líneas)

**Goal**: Estructura de la página, formulario de período, error.tsx, loading.tsx.
**Closes**: REQ-UI-01, REQ-UI-02, REQ-UI-03, REQ-UI-04.
**Depends on**: Slice 10.

**Leer antes de escribir**:
- [ ] `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`
- [ ] `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
- [ ] `app/(app)/gastos/page.tsx` (patrón de página).
- [ ] `app/(app)/consignaciones/page.tsx` (patrón de fechas).

- [ ] `app/(app)/reportes/error.tsx` (`'use client'`, `unstable_retry`).
- [ ] `app/(app)/reportes/loading.tsx` (skeleton con misma estructura).
- [ ] `app/(app)/reportes/ReportesPeriodoForm.tsx` (REQ-UI-04).
- [ ] `app/(app)/reportes/page.tsx` (orquestación sin cálculos).
- [ ] Tests e2e básicos de la página.
- [ ] Verificar en preview: claro, oscuro, 375 px.
- [ ] Gate completo.

---

## Slice 12 — Bloques 1–5 (~350 líneas)

**Goal**: BloqueResumen, BloqueGanancia, BloqueMovimientoPlata, GraficoTendencia, BloqueCobrar.
**Closes**: REQ-UI-05, REQ-UI-06 (bloques 1–5), REQ-UI-07.
**Depends on**: Slice 11.

- [ ] `components/reportes/VariacionBadge.tsx`.
- [ ] `components/reportes/BloqueError.tsx`.
- [ ] `components/reportes/BloqueResumen.tsx`.
- [ ] `components/reportes/BloqueGanancia.tsx`.
- [ ] `components/reportes/BloqueMovimientoPlata.tsx`.
- [ ] `components/reportes/GraficoTendencia.tsx` (SVG, accesible, REQ-UI-07).
- [ ] `components/reportes/BloqueCobrar.tsx`.
- [ ] Tests de render (RTL) para cada componente/bloque.
- [ ] Verificar en preview: claro, oscuro, 375 px.
- [ ] Gate completo.

---

## Slice 13 — Bloques 6–9 + exportación CSV (~350 líneas)

**Goal**: BloqueMercaderia, BloqueProveedores, BloqueGastos, BloqueRanking, exportación CSV.
**Closes**: REQ-UI-06 (bloques 6–9), REQ-UI-08, REQ-UI-09.
**Depends on**: Slice 12.

- [ ] `components/reportes/BloqueMercaderia.tsx`.
- [ ] `components/reportes/BloqueProveedores.tsx`.
- [ ] `components/reportes/BloqueGastos.tsx`.
- [ ] `components/reportes/BloqueRanking.tsx` (con selector de orden).
- [ ] Exportación CSV en BloqueGanancia y BloqueRanking.
- [ ] Tests de render (RTL) para los nuevos bloques.
- [ ] Verificar en preview: claro, oscuro, 375 px.
- [ ] Verificar consola y red sin errores.
- [ ] Gate completo.

---

## Slice 14 — Limpieza y cierre (~200 líneas)

**Goal**: Eliminar RPC viejas, limpiar DAL y tipos, actualizar docs.
**Closes**: Fase 6 completa.
**Depends on**: Slice 13.

- [ ] `rg "rf_reporte_financiero\|rf_reporte_caja\|rf_incobrables_periodo\|rf_rotacion_por_producto\|rf_dashboard_kpis" lib/ app/ supabase/` → verificar cero consumidores antes de borrar.
- [ ] Migración `0007x_limpieza_reportes_viejos.sql` con `DROP FUNCTION` y `-- DOWN:`.
- [ ] Borrar `getDashboardKpis`, `getReporteFinanciero`, `getReporteCaja`, `getIncobrablesPeriodo`, `getRotacion` del DAL.
- [ ] Borrar tipos muertos de `lib/types/reportes.ts`.
- [ ] `docs/modulos.md` — si cambia el mapeo de permisos por ruta/bloque.
- [ ] `supabase/README.md` — si hay convención de `-- DOWN` nueva.
- [ ] `openspec/config.yaml` — actualizar `migrations` aplicadas.
- [ ] `supabase db reset` + `seed.sql` + `pnpm provision-tenant` → tenant funcional, panel carga vacío sin errores.
- [ ] Gate final completo: typecheck, lint, unit tests, build.
- [ ] Tests de DB (marcar NO VERIFICADO si no hay Docker).
- [ ] Reporte final al usuario.
