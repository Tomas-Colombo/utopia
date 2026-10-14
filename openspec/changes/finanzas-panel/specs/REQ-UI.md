# REQ-UI — Requisitos de interfaz de usuario

**Change**: `finanzas-panel`
**Applies to**: Fase 5

---

## REQ-UI-01 — Estructura de archivos

**MUST**: La ruta `/reportes` tener la estructura:
```
app/(app)/reportes/
  layout.tsx              (se mantiene: requireModuleRole 'reportes' 'ver')
  page.tsx                (Server Component; parsea, decide bloques, orquesta, NO calcula)
  loading.tsx             (skeleton con la misma estructura que la página real)
  error.tsx               ('use client'; mensaje en voseo + botón "Reintentar" vía unstable_retry)
  ReportesPeriodoForm.tsx (Client Component; reescrito)
components/reportes/
  BloqueResumen.tsx  BloqueGanancia.tsx  BloqueMovimientoPlata.tsx
  GraficoTendencia.tsx  BloqueCobrar.tsx  BloqueMercaderia.tsx
  BloqueProveedores.tsx  BloqueGastos.tsx  BloqueRanking.tsx
  BloqueError.tsx  VariacionBadge.tsx
```

---

## REQ-UI-02 — page.tsx (orquestación)

**MUST**: `page.tsx` recibir `searchParams` como `Promise` (Next.js 16) y
hacer `await searchParams` antes de leer sus valores.

**MUST**: Llamar a `getContextoPeriodo()` primero para obtener `hoy` y el
período por defecto en la zona del tenant.

**MUST**: Parsear `searchParams` con el schema de `lib/validation/reportes.ts`;
si inválido, usar período por defecto + aviso visible (MUST NOT redirigir a 500).

**MUST**: Calcular `bloquesVisibles(session)` y lanzar SOLO las queries de
bloques visibles (DC-14 — bloques invisibles MUST NOT generar queries).

**MUST**: Cada query estar envuelta para que su fallo devuelva `{ ok: false }` y
renderice `BloqueError`. Un bloque roto MUST NOT tumbar la página entera.

**MUST**: Las queries de período actual y período anterior lanzarse en paralelo
(`Promise.all` o `allSettled`). MUST NOT hacerse en serie.

**MUST NOT**: Sumar, restar ni formatear dinero inline. MUST NOT contener SQL.

---

## REQ-UI-03 — error.tsx

**MUST**: Ser Client Component (`'use client'`).

**MUST**: Usar la prop `unstable_retry` (API de Next.js 16.2.0+) para el botón
de reintento.

**MUST**: Mostrar mensaje en español, voseo, sin términos técnicos.

---

## REQ-UI-04 — ReportesPeriodoForm (selector de período)

**MUST**: Usar `<input type="date">` con `<label>` reales para `Desde` / `Hasta`.

**MUST**: Ofrecer presets **Hoy / Este mes / Mes pasado / Este año** calculados
con el `hoy` que manda el servidor como prop. MUST NOT usar `new Date()` del
navegador para calcular presets.

**MUST**: Validar `desde <= hasta` y tope de 366 días antes de navegar.
MUST NOT navegar con fechas inválidas.

**MUST**: Actualizar la URL con `?desde=&hasta=` (sin page reload completo).

**MUST**: Ser accesible: labels reales, foco visible, errores con `role="alert"`.

**MUST**: Emitir `aria-live="polite"` al cambiar el período.

---

## REQ-UI-05 — Bloques: visibilidad y estados

**MUST**: Cada bloque cubrir cuatro estados: carga (skeleton igual al layout
real), vacío (`EmptyState` con CTA obligatorio), error (`BloqueError` con
texto "No pudimos cargar esto. Probá de nuevo en un momento." + reintento),
datos.

**MUST**: `EmptyState` tener `cta` en todos los casos (REQ-DS-12 heredado;
p. ej. "Registrá una venta" con ruta de nueva venta).

**MUST NOT**: Un bloque visible generar queries cuando su módulo no está
habilitado o el usuario no tiene permiso `ver`.

---

## REQ-UI-06 — Contenido de cada bloque (de arriba hacia abajo)

**MUST**: El bloque **Resumen** (módulo `ventas`) mostrar cuatro `Kpi`:
*Vendiste* (ventas_netas), *Te quedó de ganancia* (ganancia_final si hay
módulo gastos; *ganancia antes de gastos* si no), *Entró a caja* (neto_cobros),
*Te deben* (por_cobrar). Cada uno con `VariacionBadge` frente al período anterior.

**MUST**: El bloque **Cómo se arma tu ganancia** (`resultados`) mostrar tabla
de cascada desde *Vendiste* hasta *Ganancia final* con cada resta visible y una
línea explicativa por fila.

**MUST**: El bloque **Movimiento de plata** (`flujo`) mostrar cobrado, devuelto
a clientes, comisiones, compras de mercadería (rotuladas "se asumen pagadas al
recibirlas"), pagos a proveedores, gastos (si módulo), neto del período, y
*Por acreditar* con desglose por tipo de cuenta.

**MUST**: El bloque **Tendencia** (`serie`) mostrar `GraficoTendencia` de 12 meses.

**MUST**: El bloque **Lo que te deben** (`cobrar`) mostrar a_cobrar, vence_este_mes,
vencido, clientes_con_deuda. Si hay vencido Y usuario tiene permiso `ventas`,
MUST mostrar link a `/cuotas?estado=vencidas`.

**MUST**: Los bloques **Mercadería** (`inventario`) y **Proveedores** (`rendiciones`)
mostrar los campos de §6.3 según disponibilidad del módulo.

**MUST**: El bloque **Gastos vs. presupuesto** mostrar el mes calendario de
`hasta` (independiente del período elegido). MUST rotular que corresponde al
mes, no al período.

**MUST**: El bloque **Ranking de productos** (`inventario`) usar `rf_finanzas_ranking_productos`,
tener selector de orden client-side y mostrar tabla con `Table` existente.

---

## REQ-UI-07 — GraficoTendencia (SVG accesible)

**MUST**: Estar en `<figure>` con `<figcaption>`, `role="img"` y `aria-label`
que resuma la serie.

**MUST**: Tener tabla de datos equivalente alcanzable (botón "Ver como tabla").

**MUST**: Tener ejes con etiquetas de texto y barras distinguibles sin depender
del color (etiqueta de valor o patrón).

**MUST**: Usar colores SOLO vía tokens (`--rosa`, `--ok`, `--alerta-*`, `--ink`,
`--muted`). MUST NOT usar colores literales.

**MUST**: Respetar `prefers-reduced-motion` y el modo oscuro (tema platino).

---

## REQ-UI-08 — Diseño, tema y accesibilidad

**MUST**: Usar Tailwind 4 con variables de `app/globals.css` (`bg-card`,
`border-border`, `text-muted`, `font-display`, `tabular-nums`).
MUST NOT usar colores literales.

**MUST**: Funcionar en modo claro, oscuro y 375 px sin scroll horizontal.
Las tablas MUST tener scroll interno.

**MUST**: Nada comunicarse solo con color: `VariacionBadge` MUST llevar flecha
Y texto "más/menos que el período anterior". `Badge` ya incluye texto `sr-only`.

**MUST**: Todos los elementos interactivos tener `focus-visible:ring-2`.

**MUST**: `aria-busy` en estados de carga.

**MUST**: Una jerarquía de headings correcta: un `h1` vía Topbar, `h2` por bloque.

**MUST**: Todo el copy estar en español, voseo, sin jerga contable (glosario §8.1
de la propuesta).

---

## REQ-UI-09 — Exportación CSV

**MUST**: El ranking y el cuadro de ganancia ser exportables a CSV.

**MUST**: La exportación generarse en el cliente a partir de datos ya cargados
(sin endpoint nuevo).

**SHOULD**: Confirmarse con el usuario si se requiere Excel/PDF; si no responde,
solo CSV.

---

## REQ-UI-10 — e2e

**MUST**: Los tests e2e existentes conservar `shell.titulo = "Reportes"`, labels
`/^Desde/`, `/^Hasta/`, botón "Aplicar" y verificación de URL con `desde=`/`hasta=`.

**MUST**: Los textos de encabezados que cambien actualizarse en el mismo commit.

**MUST**: Agregar casos:
- Período inválido no rompe (no 500).
- Tenant sin módulo `gastos` no ve el bloque de gastos.
- Usuario sin permiso `inventario` no ve mercadería.
