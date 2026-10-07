# REQ-APP — Requisitos de aplicación (DAL, validación, lógica pura)

**Change**: `finanzas-panel`
**Applies to**: Fase 4

---

## REQ-APP-01 — lib/dal/reportes/finanzas.ts

**MUST**: Existir `lib/dal/reportes/finanzas.ts` con `import 'server-only'`.

**MUST**: Seguir el patrón de `reportes.ts`: `createServerClient()` por llamada,
`if (error) throw new Error('<rpc>: ' + error.message)`.

**MUST**: Exponer un método por bloque: `getResultados`, `getFlujo`,
`getSerieMensual`, `getPosicion`, `getRankingProductos`, `getGastosPresupuesto`,
`getContextoPeriodo`.

**MUST**: Los tipos estar escritos a mano en `lib/types/reportes.ts`
(no tipos generados por Supabase). Los valores `numeric` de la DB MUST
convertirse con `Number()`. Las filas únicas MUST normalizarse con el helper
`fila()` existente.

**MUST NOT**: Contener SQL inline.

---

## REQ-APP-02 — lib/validation/reportes.ts

**MUST**: Existir schema Zod `z.strictObject({ desde, hasta })` para `searchParams`
con:
- `desde`/`hasta` en formato `YYYY-MM-DD` validados como fecha real.
- `desde <= hasta`.
- Rango ≤ 366 días.
- `limite` entre 1–100.
- `orden` en lista blanca (`ganancia`|`unidades`|`monto`).

**MUST**: Ante entrada inválida, volver al período por defecto con aviso
visible. MUST NOT lanzar 500.

**MUST**: Usar `safeParse` (no `parse` que lanza).

**MUST**: Respetar las particularidades de Zod 4 (`strictObject` exhaustivo,
`__proto__` descartado sin rechazar, orden de `trim`).

---

## REQ-APP-03 — lib/utils/moneda.ts

**MUST**: Existir `lib/utils/moneda.ts` como módulo puro con tests colocados.

**MUST**: Exponer:
- `formatearMoneda(n: number): string` — locale `es-AR`, sin decimales, negativos
  con signo explícito.
- `formatearPorcentaje(n: number): string`.
- `formatearVariacion(actual: number, anterior: number): { texto: string; direccion: 'sube' | 'baja' | 'igual' | 'sin-base' }`.
  MUST NOT dividir por cero. Sin base → `sin-base` con texto "sin datos del período anterior".

**MUST**: El módulo agregarse al `include` de cobertura en `vitest.config.mts`.

**MUST NOT**: Sumar, restar ni multiplicar importes monetarios.

---

## REQ-APP-04 — lib/reportes/bloques.ts

**MUST**: Existir `lib/reportes/bloques.ts` como módulo puro con tests colocados.

**MUST**: `bloquesVisibles(session: Session)` retornar qué bloques mostrar según DC-14:
módulo habilitado en el tenant (`modulosHabilitados.includes(...)`) Y permiso `ver`
(`hasPermission(session, ..., 'ver')`).

**MUST**: Los bloques seguir el mapeo de permisos de §4 DC-14 de la propuesta:
- `resultados`/`flujo`/`serie`/`cobrar` → módulo `ventas`.
- `gastos` → módulo `gastos`.
- `mercaderia`/`ranking` → módulo `inventario`.
- `proveedores` → módulo `rendiciones`.

**MUST**: Existir en `lib/dal/guard.ts` el helper `hasModuleAccess(session, modulo, accion)`.
MUST NOT duplicar la lógica en `bloques.ts`.

**MUST**: El módulo y sus tests agregarse al `include` de cobertura.

---

## REQ-APP-05 — lib/reportes/periodo.ts

**MUST**: Existir `lib/reportes/periodo.ts` como módulo puro con tests colocados.

**MUST**: `periodoAnterior(desde: string, hasta: string, hoy: string)` retornar
un período anterior de igual duración para comparación.

**MUST NOT**: Usar `Date.now()` ni zona horaria del proceso. Recibir `hoy` como
argumento.

---

## REQ-APP-06 — Slugs de error nuevos

**MUST**: Todos los slugs nuevos levantados por `sp_*` existir en
`lib/errores/mensajes.ts` (español, voseo, punto final, sin jerga).

**MUST**: El mismo conjunto de slugs estar en la lista inventariada de
`lib/errores/mensajes.test.ts`.

Slugs nuevos mínimos:
- `venta-con-incobrables`
- `venta-anulada`
- `linea-ya-devuelta`
- `linea-ya-rendida`
- `devolucion-venta-con-cuotas-abiertas`
- `reintegro-requiere-cuenta`
- `periodo-invalido`
- `orden-invalido`
