# Proposal: Remodelación del módulo Finanzas / Reportes

**Change**: `finanzas-panel`
**Status**: Pendiente de aprobación del usuario — decisiones cerradas en §4 de la propuesta fuente
**Source**: `ingenieria/changes/modulo-finanzas/propuesta.md` (v2, pendiente de aprobación del usuario)
**Covers**: Fases 1–6 de la propuesta. La Fase 0 (esta carpeta) es el spec formal que habilita la ejecución.

---

## Intent

Reemplazar el panel de reportes actual (`/reportes`) con un módulo de finanzas
correcto: modelo de datos consistente, métricas únicas y verificables, UI por
bloques que respeta módulos habilitados por tenant, sin cálculos de dinero en
TypeScript, y sin las 14 deficiencias documentadas en la propuesta §2.

El software sale de cero (el cliente borró todos los datos). No hay backfill
ni compatibilidad hacia atrás.

---

## Motivation

Los defectos D1–D14 de la propuesta hacen que el número principal del panel
(ganancia neta) sea erróneo. En compras, `monto_ganancia` incluye el costo
completo en vez de restarlo (D1). El panel suma `monto_ganancia` menos gastos
pero ignora `costo_mercaderia` (D2). Las devoluciones de cliente no bajan
ingresos ni caja (D4). Las anulaciones no generan reintegros visibles (D5).
Los incobrables se penalizan dos veces (D6). Las queries usan `current_date`
(UTC) y las ventas de la noche van al día siguiente (D9). Un `RangeError` en
`new Date()` tira un 500 sin error.tsx (D10).

Corrección sin backfill porque los datos se borraron: momento ideal para
reparar el modelo de raíz.

---

## Scope

### In Scope

- **Fase 1 — Integridad del modelo (DB)**: zona horaria por tenant (`fn_hoy_tenant`,
  `fn_rango_tenant`), ganancia correcta (`monto_ganancia = precio_venta − costo_snapshot`
  para compra Y consignación), triggers de inmutabilidad sobre `venta`/`detalle_venta`/
  `pago_venta`, constraint de cuadre de pagos, incobrables sin `gasto_negocio`.

- **Fase 2 — Reversas (DB + UI de Ventas)**: tablas `devolucion_venta` y
  `reintegro_cliente` (append-only), reescritura de `sp_anular_venta` y
  `sp_registrar_devolucion_cliente`, corrección de `sp_generar_rendicion` para
  excluir ítems devueltos.

- **Fase 3 — Capa de lectura única (DB)**: vista `v_linea_venta` como fuente
  única de costo/margen; funciones `rf_finanzas_resultados`, `rf_finanzas_flujo`,
  `rf_finanzas_serie_mensual`, `rf_finanzas_posicion`, `rf_finanzas_ranking_productos`,
  `rf_finanzas_gastos_presupuesto`, `fn_contexto_periodo`.

- **Fase 4 — DAL, validación y lógica pura**: `lib/dal/reportes/finanzas.ts`,
  `lib/validation/reportes.ts`, `lib/utils/moneda.ts`, `lib/reportes/bloques.ts`,
  `lib/reportes/periodo.ts`.

- **Fase 5 — UI de `/reportes`**: reescritura completa de la página y sus
  componentes, `error.tsx`, `loading.tsx`, `ReportesPeriodoForm`, nueve bloques
  de componentes en `components/reportes/`, gráfico SVG accesible, exportación CSV.

- **Fase 6 — Limpieza**: eliminar `rf_reporte_financiero`, `rf_reporte_caja`,
  `rf_incobrables_periodo`, `rf_rotacion_por_producto`, `rf_dashboard_kpis` y sus
  consumidores en el DAL y en tipos.

### Out of Scope

- Módulo Revendedoras (ninguna tabla, texto, ni placeholder).
- Comisiones de vendedor, multi-moneda, facturación electrónica.
- Cuentas por pagar de compras, saldo a favor del cliente, metas de venta.
- Descuentos como KPI, saldos por cuenta/caja, arqueo.
- Devoluciones sobre ventas con cuotas abiertas (DC-6 — se bloquea con error).
- Reversa de incobrables al anular (DC-7 — se bloquea con error).

---

## Closed Decisions (no se reabren sin preguntar al usuario)

Ver propuesta §4 (DC-1 a DC-17). Las más críticas para el spec:

- **DC-1**: costo único: `monto_ganancia = precio_venta − costo_snapshot` para compra Y consignación.
- **DC-3**: evento por fecha del evento, no reescribe el pasado; ventas anuladas no desaparecen del período original.
- **DC-4/DC-5**: `reintegro_cliente` y `devolucion_venta` append-only; snapshots inmutables.
- **DC-8**: incobrables salen de `cuota_financiada`, no de `gasto_negocio`.
- **DC-10**: zona horaria por tenant; rangos semiabiertos `[desde 00:00, hasta+1 00:00)`.
- **DC-14**: bloques de UI se muestran solo si módulo habilitado Y permiso `ver`.
- **DC-15**: gráfico SVG propio; sin librería de gráficos.

---

## Capabilities

### New Capabilities

- `finanzas-integridad-db`: modelo correcto con triggers, CHECKs, zona horaria por tenant.
- `finanzas-reversas`: anulación y devolución con reintegros auditables.
- `finanzas-lectura`: capa de lectura única (`v_linea_venta`, `rf_finanzas_*`).
- `finanzas-dal`: DAL tipado, validación Zod, helpers puros.
- `finanzas-ui`: panel por bloques, accesible, sin SQL en componentes.

### Modified Capabilities

- `reportes-dal`: `lib/dal/reportes/reportes.ts` — se limpia en Fase 6.
- `ventas-reversas`: SP de anulación y devolución reescritos.
- `rendiciones`: `sp_generar_rendicion` modificado para excluir devueltos.

---

## Approach / High-level design

1. **PostgreSQL es el motor de verdad.** Toda invariante de negocio vive en la
   base (CHECKs, triggers, FKs). Los SPs son la única puerta de escritura.
   Las lecturas de reporte usan `rf_finanzas_*` y `v_*`; nunca SQL en TS.

2. **Una migración por tema**, numeradas desde 00066, con encabezado `-- DOWN:`.
   El rollback se documenta como bloque comentado al final. Probadas con
   `supabase db reset` desde cero antes de comprometer.

3. **TDD estricto**: el test que falla va primero. Los tests de DB viven en
   `tests/db/`. Los tests de lógica pura van colocalidados (`*.test.ts`).

4. **Ninguna cifra en TypeScript**: la UI formatea y compara; las sumas se
   hacen en SQL sobre `numeric`. Variaciones y porcentajes de presentación
   son la única aritmética permitida en TS.

5. **Bloques condicionales**: `lib/reportes/bloques.ts` decide qué bloques
   mostrar. Un bloque roto entrega `BloqueError` sin tumbar la página.

---

## Deliverables (by slice / PR)

| # | Slice | Archivos principales | Líneas est. |
|---|-------|----------------------|------------|
| 1 | Fase 1.1 — Zona horaria | `00066_zona_horaria_tenant.sql`, tests | ~120 |
| 2 | Fase 1.2 — Ganancia correcta | `00067_ganancia_y_costo_consistentes.sql`, tests | ~150 |
| 3 | Fase 1.3 — Inmutabilidad | `00068_inmutabilidad_ventas.sql`, tests | ~180 |
| 4 | Fase 1.4 — Incobrables | `00069_incobrables_sin_gasto.sql`, tests | ~100 |
| 5 | Fase 2.1–2.2 — Tablas + sp_anular | `00070_reintegro_y_devolucion.sql` | ~200 |
| 6 | Fase 2.3–2.4 — sp_devolucion + rendición | Continuación de 00070, tests | ~200 |
| 7 | Fase 2.5 — DAL + UI de Ventas | `lib/dal/ventas/`, acciones, componentes | ~350 |
| 8 | Fase 3 — Lectura única | `00071_finanzas_lectura.sql`, tests dorado | ~380 |
| 9 | Fase 4 — DAL + helpers | `lib/dal/reportes/finanzas.ts`, validación, moneda | ~350 |
| 10 | Fase 5a — page + form + skeleton | `app/(app)/reportes/`, `loading.tsx`, `error.tsx` | ~300 |
| 11 | Fase 5b — Bloques 1–5 | `components/reportes/Bloque*.tsx` x5 | ~350 |
| 12 | Fase 5c — Bloques 6–9 + gráfico | `GraficoTendencia`, bloques restantes | ~350 |
| 13 | Fase 6 — Limpieza | Migración drop, DAL limpieza, docs | ~200 |

Cada slice ≤ 400 líneas cambiadas. Si un slice se excede durante apply, se
parte en a/b sin reducir cobertura de tests.
