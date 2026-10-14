# Design: Remodelación del módulo Finanzas / Reportes

**Change**: `finanzas-panel`
**Status**: Pendiente de aprobación del usuario (decisiones CERRADAS — ver propuesta §4 DC-1 a DC-17)
**Mode**: openspec
**Covers**: Fases 1–6 de la propuesta fuente

---

## 1. Overview

Este design convierte la propuesta pendiente de aprobación en una implementación concreta sobre
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

## 2. Prohibiciones y arquitectura

Esta sección define las reglas innegociables del proyecto y de esta implementación (de §1 y §3 de la propuesta). Violar cualquiera es motivo de rechazo del PR.

### 2.1. Arquitectura común

1. **PostgreSQL es el motor de consistencia transaccional.** Toda invariante de negocio crítica (montos que cuadran, estados válidos, inmutabilidad de snapshots, aislamiento por tenant) vive en la base, no en TypeScript.
2. **La lógica de negocio crítica va en funciones PL/pgSQL y triggers.** Escrituras solo por `sp_*`, lecturas por `rf_*` o `v_*`. Invariantes con `CHECK`, `UNIQUE`, FKs y triggers.
3. **RLS activada en todas las tablas**, con policy `id_tenant = auth_tenant_id()`. Las funciones nuevas son `SECURITY INVOKER` (no se introduce `security definer`).
4. **Capas de la app**: `app/**` (rutas, actions, sin SQL), `components/**` (UI, sin SQL), `lib/dal/**` (ÚNICO lugar que consulta Supabase), `supabase/` (migraciones, sp). La clave service-role no se usa en la app.
5. **Toda mutación es una Server Action con tres compuertas**: (1) `requireModuleRole`, (2) validación zod `strictObject` y `safeParse`, (3) llamar al DAL con `parsed.data`. Devuelve `{ ok: true } | { ok: false, reason }` con slug kebab-case.
6. **Mensajes al operador en `lib/errores/mensajes.ts`**: español, voseo, punto final, sin jerga ni `res.reason` en la UI.
7. **Diseñá para N, no para 1**: acotar, deduplicar, no `await` dentro de un `for`.

### 2.2. Prohibiciones

**Base de datos:**
- No editar migraciones ya aplicadas (00001–00065). Todo va en nuevas, desde 00066.
- No tocar una base remota (nada de `db push` a prod ni escrituras con el MCP de Supabase).
- No cambiar la firma de un `sp_*` sin `DROP FUNCTION IF EXISTS` en la misma migración.
- No usar `current_date`, `now()::date` ni `date_trunc('day', now())` en SQL nuevo o modificado (usar `fn_hoy_tenant()`/`fn_rango_tenant()`).
- No calcular una cifra de negocio en dos lugares.

**Código de aplicación:**
- Cero SQL en `app/**` y `components/**`. Todo pasa por `lib/dal/**`.
- No sumar dinero en JavaScript: las sumas se hacen en SQL sobre `numeric`.
- No dependencias nuevas sin aprobación.
- No bajar umbrales de cobertura.
- Sin `Co-Authored-By` ni `--no-verify`.
- No leer `ingenieria/utopia-intructivo/Seguridad/`.

---

## 3. Layout de repositorio afectado

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
exceptuó el trigger con `not exists (select 1 from tenant where id_tenant = old.id_tenant)` en el DELETE,
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

## 5. Decisiones cerradas (DC-1 a DC-17)

Definición complementaria: "Cuota abierta" = estado `pendiente` o `parcial`.

| ID | Decisión | Por qué |
|---|---|---|
| DC-1 | Un solo criterio de costo: `costo de la línea = detalle_venta.costo_snapshot`, para compra **y** consignación. `monto_ganancia = precio_venta − costo_snapshot` para ambos, impuesto por `CHECK`. | Hoy hay dos criterios (D1/D2). En consignación `monto_proveedor == costo_snapshot`, así que para consignación el número no cambia; solo se corrige compra. |
| DC-2 | `monto_proveedor` pasa a significar únicamente "lo que se le debe al proveedor": `0` si compra, `= costo_snapshot` si consignación (`CHECK`). | Separa deuda de costo. |
| DC-3 | El estado de resultados se mide **por fecha del evento**, no reescribe el pasado: una venta cuenta en el período en que se hizo; su anulación o devolución resta en el período en que ocurrió. Las ventas anuladas **no desaparecen** del período original. | Cerrar un mes y que cambie al mes siguiente es inaceptable. |
| DC-4 | La plata devuelta al cliente se modela con una tabla propia `reintegro_cliente` (append-only). La anulación genera un reintegro espejo de cada pago; la devolución de línea genera uno con cuenta/medio elegidos por el operador. | Hace visible y auditable la salida de caja (D5). |
| DC-5 | Una devolución se modela con `devolucion_venta` (append-only), **no** muta `venta.total` ni `detalle_venta`. | Snapshots inmutables (D11). |
| DC-6 | **Devolución sobre venta con cuotas abiertas**: **se bloquea** con `devolucion-venta-con-cuotas-abiertas`. Para esos casos queda la anulación. | Reducir cuotas parcialmente es un problema aparte; se deja explícito como límite conocido. |
| DC-7 | **Anular una venta con cuotas incobrables se bloquea** (`venta-con-incobrables`). | Evita la doble penalización (D6) sin inventar reversos contables. |
| DC-8 | Incobrables: deja de crearse el `gasto_negocio` "Incobrables". La pérdida se calcula de `cuota_financiada` (saldo `monto − monto_pagado` de cuotas `incobrable`, por `fecha_incobrable`). | Una sola fuente, sin doble conteo con gastos. |
| DC-9 | Los aranceles/retenciones **no se recuperan** al anular o devolver: el costo de cobro se reconoce en el período del pago, incluso si la venta se anuló después. | Es plata realmente perdida; hoy se oculta (D5). |
| DC-10 | Zona horaria **por tenant**: `tenant.zona_horaria`. Todo rango/“hoy” se resuelve en la base con esa zona. Rangos semiabiertos `[desde 00:00, hasta+1 00:00)`. | Producto revendible; elimina D9 de raíz. |
| DC-11 | Las compras de mercadería (`ingreso_mercaderia` tipo `compra`, confirmado, no cancelado) **se asumen pagadas al recibirlas** (no hay cuentas por pagar). Se rotula así en la UI. | No existe estado de pago de compras; modelarlo es otro módulo. |
| DC-12 | La devolución de cliente asume que la mercadería vuelve al stock (recupera el costo). Si vuelve dañada, el operador la da de baja y la pérdida aparece como "mercadería dada de baja". El ítem queda en `devuelto_cliente` hasta que se reingrese. | Mantiene consistencia sin crear estados nuevos. |
| DC-13 | Devolver una línea ya rendida al proveedor se bloquea (`linea-ya-rendida`), igual que `sp_anular_venta` con `venta-ya-rendida`. | Coherencia con lo existente. |
| DC-14 | Un bloque del panel se muestra solo si el módulo está **habilitado en el tenant Y el usuario tiene permiso `ver`** sobre él. Los bloques ocultos **no se consultan** (no se llama a su RPC). | Evita exponer datos de módulos no contratados o sin permiso (D12). |
| DC-15 | No hay librería de gráficos: gráficos en SVG propio dentro de `components/reportes/`, accesibles. | No hay ninguna instalada; controla AA y tokens. |
| DC-16 | Se elimina "ganancia esperada / impacto de descuentos" del panel. | Estaba mal (D3). Reaparecería, si se quiere, como cambio aparte. |
| DC-17 | Convención de nombres: lecturas `rf_finanzas_*`, vistas `v_*`, escrituras `sp_*`, helpers `fn_*`. | Respeta `AGENTS.md` (`sp_*` es solo escritura). |

---

## 6. Contratos de datos clave

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
  gastos: number
  ganancia_final: number
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

### 6.3 Variación

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

## 7. Riesgos y mitigaciones

Ver propuesta §9. El riesgo más crítico de implementación es el trigger de
inmutabilidad de `venta` si `sp_registrar_venta` hace `UPDATE total` después
del insert. Resolución: cambiar el SP para calcular el total antes. Verificar
leyendo la migración 00064 completa antes de tocarla.

---

## 8. Verificación

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
