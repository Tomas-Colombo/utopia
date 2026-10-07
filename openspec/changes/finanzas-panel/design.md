# Design: Remodelación del módulo Finanzas / Reportes

**Change**: `finanzas-panel`
**Status**: Design (decisiones CERRADAS — ver propuesta §4 DC-1 a DC-17)
**Mode**: openspec
**Covers**: Fases 1–6 de la propuesta fuente

---

## 1. Overview

Este design convierte la propuesta aprobada en una implementación concreta sobre
el proyecto existente (Next.js 16.2.10, React 19, TS 5, Tailwind 4, Supabase/Postgres).

El estado de partida es:
- 65 migraciones aplicadas (`00001`–`00065`).
- `sp_registrar_venta` calcula `monto_ganancia` de forma incorrecta para compras (D1).
- `rf_reporte_financiero` usa `monto_ganancia` sin restar costo (D2).
- No existe `error.tsx` en ninguna ruta de la app (D10).
- No existen `devolucion_venta`, `reintegro_cliente`, `fn_hoy_tenant`, `fn_rango_tenant`.
- Unit tests: 432 pasando. Build: verde. Lint: 0 errores.

El diseño es organizado por fases. Las decisiones son irrevocables sin consulta
al usuario. §16 (preguntas abiertas) intencionalmente vacío: la propuesta §4
cierra todas.

---

## 2. Layout de repositorio afectado

Solo lo que este cambio agrega o modifica:

```
supabase/migrations/
  00066_zona_horaria_tenant.sql
  00067_ganancia_y_costo_consistentes.sql
  00068_inmutabilidad_ventas.sql
  00069_incobrables_sin_gasto.sql
  00070_reintegro_y_devolucion.sql
  00071_finanzas_lectura.sql
  0007x_limpieza_reportes_viejos.sql   ← número exacto en Fase 6

tests/db/
  integridad-ventas.test.ts            ← nuevo, Fase 1
  reversas.test.ts                     ← nuevo, Fase 2
  finanzas.test.ts                     ← nuevo, Fase 3 (escenario dorado)

lib/
  dal/
    reportes/
      finanzas.ts                      ← nuevo
    guard.ts                           ← agrega hasModuleAccess
  types/
    reportes.ts                        ← agrega tipos de finanzas; mantiene los actuales
  errores/
    mensajes.ts                        ← slugs nuevos
    mensajes.test.ts                   ← inventario actualizado
  utils/
    moneda.ts                          ← nuevo, puro
    moneda.test.ts                     ← nuevo
  reportes/
    bloques.ts                         ← nuevo, puro
    bloques.test.ts                    ← nuevo
    periodo.ts                         ← nuevo, puro
    periodo.test.ts                    ← nuevo
  validation/
    reportes.ts                        ← nuevo (valida searchParams)
    reportes.test.ts                   ← nuevo

app/(app)/reportes/
  layout.tsx                           ← sin cambios
  page.tsx                             ← reescrito
  loading.tsx                          ← actualizado (refleja nueva estructura)
  error.tsx                            ← nuevo
  ReportesPeriodoForm.tsx              ← reescrito

components/reportes/
  BloqueResumen.tsx                    ← nuevo
  BloqueGanancia.tsx                   ← nuevo
  BloqueMovimientoPlata.tsx            ← nuevo
  GraficoTendencia.tsx                 ← nuevo
  BloqueCobrar.tsx                     ← nuevo
  BloqueMercaderia.tsx                 ← nuevo
  BloqueProveedores.tsx                ← nuevo
  BloqueGastos.tsx                     ← nuevo
  BloqueRanking.tsx                    ← nuevo
  BloqueError.tsx                      ← nuevo
  VariacionBadge.tsx                   ← nuevo

# Archivos modificados en Ventas (Fase 2):
app/(app)/ventas/
  [id]/
    AnularVentaDialog.tsx              ← muestra total_reintegrado
    DevolucionDialog.tsx               ← flujo de reembolso
lib/dal/ventas/
  ventas.ts                            ← wrappers de sp_anular_venta y sp_registrar_devolucion
lib/validation/ventas.ts              ← schemas nuevos
```

---

## 3. Diseño por fase

### Fase 1 — Integridad del modelo (DB)

#### 3.1.1 Migración 00066: Zona horaria

```sql
-- UP
ALTER TABLE tenant ADD COLUMN zona_horaria text NOT NULL
  DEFAULT 'America/Argentina/Buenos_Aires'
  CHECK ((now() AT TIME ZONE zona_horaria) IS NOT NULL);

CREATE OR REPLACE FUNCTION fn_hoy_tenant()
  RETURNS date STABLE LANGUAGE sql SECURITY INVOKER AS $$
    SELECT (now() AT TIME ZONE (
      SELECT zona_horaria FROM tenant WHERE id_tenant = auth_tenant_id()
    ))::date
  $$;

CREATE OR REPLACE FUNCTION fn_rango_tenant(p_desde date, p_hasta date)
  RETURNS tstzrange STABLE LANGUAGE plpgsql SECURITY INVOKER AS $$
  DECLARE
    v_tz text;
    v_desde timestamptz;
    v_hasta timestamptz;
  BEGIN
    IF p_hasta < p_desde THEN
      RAISE EXCEPTION 'periodo-invalido';
    END IF;
    IF (p_hasta - p_desde) > 800 THEN
      RAISE EXCEPTION 'periodo-invalido';
    END IF;
    SELECT zona_horaria INTO v_tz FROM tenant WHERE id_tenant = auth_tenant_id();
    v_desde := (p_desde::text || ' 00:00:00')::timestamp AT TIME ZONE v_tz;
    v_hasta := ((p_hasta + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE v_tz;
    RETURN tstzrange(v_desde, v_hasta, '[)');
  END;
  $$;
```

Reemplazar `current_date` → `fn_hoy_tenant()` en `sp_registrar_venta`
(`fecha_acreditacion`) y `sp_calcular_costo_cobro` (vigencia del tarifario).

#### 3.1.2 Migración 00067: Ganancia correcta

Redefinir `sp_registrar_venta` (misma firma; `create or replace` o `drop`+`create`
si cambia la firma). El cambio mínimo: reemplazar el bloque que calcula
`monto_ganancia` para compras:
- Antes: `monto_ganancia = precio_venta` (sin restar costo).
- Después: `monto_ganancia = precio_venta - costo_snapshot` para TODOS los tipos.

Agregar los dos CHECKs en `detalle_venta` (REQ-DB-02). Sin `NOT VALID` porque
no hay datos.

Antes de escribir la migración: `rg monto_ganancia lib/ app/ supabase/` para
localizar todos los consumidores y verificar que ninguno asuma el significado viejo.

#### 3.1.3 Migración 00068: Inmutabilidad

Trigger `BEFORE UPDATE` en `venta`: columnas bloqueadas = `total`, `fecha`,
`id_cliente`, `forma_pago`, `financiacion`, `id_tenant`. Columnas libres =
`estado_venta`, `fecha_anulacion`, `motivo_anulacion`, `observaciones`, `updated_at`.

**Gotcha de sp_registrar_venta**: si el SP inserta con `total=0` y luego hace
`UPDATE total`, hay que reescribir el SP para calcular el total ANTES del insert.
Esto requiere leer la migración 00064 (líneas ≈393–412) para entender el flujo.
Si hay otra variable de sesión ya en uso para excepciones del trigger (como en
00065 para borrado de tenant), usarla; si no, cambiar el SP es preferible.

Trigger `BEFORE UPDATE` en `detalle_venta`: bloquea todo excepto `id_rendicion`
y `excluida_rendicion`.

`pago_venta`: policies `SELECT`/`INSERT` solo; trigger que bloquea `UPDATE`/`DELETE`.

Borrado de tenant: leer cómo `00065_borrar_tenant_con_ingresos_confirmados.sql`
exceptuó `ingreso_detalle_inmutable` (variable de sesión `utopia.bypass_immutable`)
y aplicar el mismo mecanismo para `venta`/`detalle_venta`/`pago_venta`.

Constraint diferida de pagos: trigger de constraint `DEFERRABLE INITIALLY DEFERRED`
que verifica la invariante al commit. Cubrir TODAS las combinaciones de
`financiacion × forma_pago` con tests antes de activarla.

#### 3.1.4 Migración 00069: Incobrables

Quitar la llamada a `sp_registrar_gasto` de `sp_marcar_cuota_incobrable`.
Agregar guard de `venta.estado_venta = 'anulada'` en `sp_cobrar_cuota` y
`sp_marcar_cuota_incobrable`.

### Fase 2 — Reversas (DB + UI)

#### 3.2.1 Migración 00070: Tablas + SPs

Las tablas `devolucion_venta` y `reintegro_cliente` (definidas en REQ-DB-06).

`sp_anular_venta`: refactored según REQ-DB-07. La firma existente se mantiene
`(p_id_venta, p_motivo, p_ip)` si es suficiente. Si se necesita un parámetro
de usuario para el reintegro, usar `auth.uid()` en el SP en vez de parámetro.

`sp_registrar_devolucion_cliente`: reemplaza la de 00023. Nueva firma:
```
(p_id_detalle_venta uuid,
 p_motivo text,
 p_id_cuenta_reintegro uuid DEFAULT NULL,
 p_medio_reintegro medio_pago DEFAULT NULL,
 p_ip inet)
```
Lógica de `reembolsable` (propuesta §2.3):
```
reembolsable = max(0,
  Σ pagos
  - (venta.total - Σ devoluciones_previas - monto_esta_linea)
  - Σ reintegros_previos
)
```

#### 3.2.2 Rendición excluyendo devueltos

Leer dónde `sp_generar_rendicion` filtra líneas a rendir. Agregar exclusión de
líneas con `devolucion_venta` en UN SOLO lugar. Leer si `v_perfil_proveedor`
consulta el mismo campo; sincronizar.

#### 3.2.3 DAL + Actions + UI

Wrappers en `lib/dal/ventas/ventas.ts` para los SPs nuevos/modificados.

Server Actions en `app/(app)/ventas/[id]/actions.ts` (si no existen, crearlas):
tres compuertas. Schemas Zod en `lib/validation/ventas.ts`.

UI en `AnularVentaDialog.tsx`: mostrar `total_reintegrado` del SP antes de confirmar
(dato de una función de lectura, no calculado en cliente).

UI en `DevolucionDialog.tsx`: si `reembolsable > 0`, preguntar cuenta y medio
(preseleccionados del último pago). Si no, explicar que no hay reembolso.

### Fase 3 — Capa de lectura única (DB)

#### 3.3.1 Migración 00071: rf_finanzas_* y v_linea_venta

Vista `v_linea_venta`: `security_invoker`, sin `security definer`.

Funciones `rf_finanzas_*`: `STABLE LANGUAGE SQL SECURITY INVOKER`.
`GRANT EXECUTE ON FUNCTION ... TO authenticated` para cada una.

`rf_finanzas_resultados`: filtrar `ventas_brutas` como Σ `venta.total` donde
`fecha` cae en `fn_rango_tenant(p_desde, p_hasta)` (todas las ventas del período,
incluyendo las que luego se anulen). Filtrar `anulaciones` como Σ `venta.total`
donde `fecha_anulacion` cae en el rango. Filtrar `devoluciones` como Σ
`devolucion_venta.monto` donde `fecha` cae en el rango.

`rf_finanzas_serie_mensual`: usar `generate_series` para generar los meses y
un `GROUP BY` sobre el resultado. Nunca una query por mes.

`rf_finanzas_posicion`: instantánea (sin parámetro de período). Usa estado actual
de ítems.

`rf_finanzas_ranking_productos`: parte de `v_linea_venta`, filtra `estado_venta = 'registrada'`,
`fecha_venta` en rango, `devuelta = false`. Lista blanca de `p_orden` en la función.

### Fase 4 — DAL, validación y lógica pura

Ver REQ-APP-01 a REQ-APP-06.

`lib/dal/reportes/finanzas.ts`: importar `'server-only'`. Un método por bloque.
Los tipos de retorno escritos a mano en `lib/types/reportes.ts`; los existentes
NO se eliminan todavía (se limpian en Fase 6).

`lib/validation/reportes.ts`: verificar comportamiento real de `zod 4` instalado
con `import zod; console.log(zod.version)` antes de asumir.

`lib/utils/moneda.ts`: no usar `Intl.NumberFormat` si no da el resultado esperado
en el entorno; verificar con un test concreto.

`lib/reportes/bloques.ts`: no reinventar `hasPermission`; importar de `lib/dal/guard.ts`.

### Fase 5 — UI de /reportes

Ver REQ-UI-01 a REQ-UI-10 y propuesta §5.

`page.tsx`: `searchParams` es `Promise` en Next.js 16 — hacer `await searchParams`.
Patrones del proyecto: ver `app/(app)/gastos/page.tsx` (patrón de página) y
`app/(app)/consignaciones/page.tsx` (patrón de fechas). No inventar componentes
que ya existen (`Kpi`, `Table`, `Badge`, `EmptyState`, `Skeleton`, `Pagination`,
`FilterBar`, `Select`, `Toast`).

`error.tsx`: usar `unstable_retry` (nueva en 16.2.0; ver docs de Next.js).

`GraficoTendencia`: SVG propio (DC-15). No librería de gráficos. Accesible
(REQ-UI-07).

### Fase 6 — Limpieza

Migración que elimina `rf_reporte_financiero`, `rf_reporte_caja`,
`rf_incobrables_periodo`, `rf_rotacion_por_producto`, `rf_dashboard_kpis`.
CONSERVAR `rf_cuentas_por_cobrar`, `rf_alertas_cuotas_vencidas`, `v_ganancia_por_producto`.

Antes de borrar cada función: `rg <nombre_funcion> lib/ app/ supabase/` y verificar
cero consumidores.

DAL: borrar `getDashboardKpis`, `getReporteFinanciero`, `getReporteCaja`,
`getIncobrablesPeriodo`, `getRotacion` y sus tipos.

---

## 4. Contratos de datos clave

### 4.1 Retorno de rf_finanzas_resultados

```typescript
// lib/types/reportes.ts
export interface FinanzasResultados {
  ventas_brutas: number
  anulaciones: number
  devoluciones: number
  ventas_netas: number
  costo_mercaderia: number
  ganancia_sobre_ventas: number
  costo_cobro: number
  incobrables: number
  bajas_inventario: number
  ganancia_despues_de_costos: number
  gastos: number | null      // null si módulo gastos no aplica
  ganancia_final: number | null
  cantidad_ventas: number
  ticket_promedio: number | null
}
```

### 4.2 Bloques visibles

```typescript
// lib/reportes/bloques.ts
export type NombreBloque =
  | 'resumen' | 'ganancia' | 'flujo' | 'serie' | 'cobrar'
  | 'mercaderia' | 'proveedores' | 'gastos' | 'ranking'

export function bloquesVisibles(session: Session): NombreBloque[]
```

### 4.3 Variación

```typescript
// lib/utils/moneda.ts
export type DireccionVariacion = 'sube' | 'baja' | 'igual' | 'sin-base'
export interface VariacionResult {
  texto: string
  direccion: DireccionVariacion
}
export function formatearVariacion(actual: number, anterior: number): VariacionResult
```

---

## 5. Decisiones de implementación abierta

Ninguna. La propuesta §4 cierra todas. Si durante apply aparece una situación
no cubierta, PARAR y consultar al usuario.

---

## 6. Riesgos y mitigaciones

Ver propuesta §9. El riesgo más crítico de implementación es el trigger de
inmutabilidad de `venta` si `sp_registrar_venta` hace `UPDATE total` después
del insert. Resolución: cambiar el SP para calcular el total antes. Verificar
leyendo la migración 00064 completa antes de tocarla.

---

## 7. Verificación

**Gate automático** (antes de decir "listo" en cada fase):
```
pnpm typecheck && pnpm lint && npx vitest run --exclude 'tests/db/**' && pnpm build
```

**Tests de DB** (requieren Docker + `supabase start`; si no disponibles, reportar
como NO VERIFICADO):
```
npx vitest run tests/db
```

**Tests e2e** (requieren dev server + DB):
```
pnpm test:e2e
```

**Escenario dorado**: los números de §7 de la propuesta son el contrato. Si
difieren, el error está en la implementación, no en el test.
