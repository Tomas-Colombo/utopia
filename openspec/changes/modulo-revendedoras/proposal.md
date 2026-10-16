# Proposal: Módulo Revendedoras

**Change**: `modulo-revendedoras`
**Status**: Pendiente de aprobación del usuario (decisiones cerradas en §4)
**Reemplaza a**: `ingenieria/changes/modulo-revendedoras/*` (borrador local, gitignored,
escrito cuando había 65 migraciones). Este documento es el que manda.
**Origen de requisitos**: `1. Relevamiento Inicial.docx` (RF-01…RF-57, RN-01…RN-08) y
`propuesta oficial.docx` (Glam Joyas). La numeración RF/RN es del cliente y se
conserva para que pueda auditar cobertura.
**Depende de**: `finanzas-panel` cerrado (ver §6). Ese cambio declara a Revendedoras
fuera de su alcance "ni tabla, ni texto, ni placeholder".

---

## 1. Intención

Agregar consignación a revendedoras y comisión por escala como **módulo habilitable
por tenant** (`revendedoras`), reutilizando inventario, ventas, rendiciones y la
capa de lectura de finanzas sin bifurcarlos.

Utopía es un producto multi-tenant revendido: nada de esto puede quedar prendido ni
visible para un tenant que no contrató el módulo. Eso es un requisito de primer
orden de este cambio, no un detalle de UI (ver `specs/REQ-RV-MOD.md`).

## 2. Por qué un módulo nuevo y no `consignaciones`

`consignaciones` ya existe pero con la dirección **invertida**:

| | `consignaciones` (existente) | `revendedoras` (este cambio) |
|---|---|---|
| Quién tiene la mercadería | el local | la revendedora |
| Quién debe plata | el local al proveedor | la revendedora al local |
| Entidad de cierre | `rendicion_proveedor` | `liquidacion_revendedora` |
| Monto por línea | `detalle_venta.monto_proveedor` | `detalle_venta.monto_comision` |
| Contraparte | `proveedor` | `revendedora` |

Sobrecargar `proveedor` corrompería `v_linea_venta` (el costo saldría restado como
costo de mercadería) y el perfil de proveedores (dos deudas distintas en una cifra).
**Tablas nuevas, mecánica espejada.** El patrón se reutiliza (monto por línea → FK a
lote → cabecera `pendiente|pagada`), las tablas no.

## 3. Alcance

### 3.1 Dentro

| ID | Requisito | Fuente |
|---|---|---|
| NR-10…13 | Entidad `revendedora`, módulo + flag por tenant, permisos | RF-13, RF-51 |
| NR-20…25 | Consignación de salida, estado `en_revendedora`, devoluciones, stock por tenencia | RF-11/12/14/24 |
| NR-30…34 | Motor de comisiones por escala (`revendedora` y `local`) | RF-18…22 |
| NR-40…46 | Venta por canal, comisión por línea, impacto en finanzas | RF-15, RF-23 |
| NR-50…55 | Liquidación por período, pagos, cuenta corriente | RF-16 |
| NR-60…63 | Cambios de producto sin doble comisión | RF-24/25/26 |
| NR-80…83 | Reportes y bloque de finanzas de revendedoras | RF-27, RF-29 |
| NR-85 | Panel de gestión de revendedoras para el local | pedido del dueño |
| NR-90…95 | **Acceso de la revendedora con login real**: ve su stock y su deuda, declara ventas; aislamiento por usuario en la base | RF-54, RF-57 |

### 3.2 Fuera de este cambio

Todo lo que no sea el módulo `revendedoras` **no se toca ni se planifica acá**. Si durante la
implementación aparece algo ajeno, se anota y no se hace.

## 4. Decisiones cerradas

Las preguntas abiertas del borrador se cierran así. Cambiarlas requiere consulta.

| # | Decisión | Razón |
|---|---|---|
| DR-1 | **La comisión del vendedor del local (`ámbito local`) vive en el mismo módulo `revendedoras`** y se habilita con él. Un tenant sin el módulo no tiene comisión de vendedor | Un solo flag; evita un segundo módulo para un porcentaje. `finanzas-panel` excluyó comisiones de vendedor, así que no hay solapamiento |
| DR-2 | **La comisión se devenga al liquidar** (evento = fecha de la liquidación, coherente con DC-3 de finanzas: el evento no reescribe el pasado). `ganancia_final` resta solo la comisión **liquidada**. La no liquidada se muestra aparte como `comision_pendiente_estimada`, con aviso, y no se resta | El tramo depende del total del período, desconocido al vender. Restar una estimación obligaría a reescribir períodos ya mostrados cuando una venta posterior cruza un tramo |
| DR-3 | La plata que paga la revendedora (`monto_a_cobrar`) entra al **flujo** como cobro en una cuenta, vía `pago_revendedora` con `id_cuenta`. La venta cuenta como ingreso completo (`precio_venta`) y la comisión como costo | La revendedora retiene su comisión: el local cobra `vendido − comisión`. Sin `id_cuenta` el flujo de caja no cuadra |
| DR-4 | Período de liquidación: **corte configurable, por defecto 1 mes**, calculado con `fn_rango_tenant` (rangos semiabiertos, zona horaria del tenant) | Fallback ya previsto en el borrador; respeta DC-10 |
| DR-5 | La diferencia de precio en un cambio **no genera comisión** | Fallback del borrador; evita doble comisión (RN-07). Se puede habilitar después con una columna |
| DR-6 | Comisión del vendedor del local: regla configurable, **semilla 0** | El cliente nunca cerró 1 % vs 1,5 % |
| DR-7 | Anular una venta de revendedora **no liquidada** devuelve el ítem a `en_revendedora`. Si ya está liquidada se rechaza (`venta-liquidada`). `sp_registrar_devolucion_cliente` sobre canal revendedora se **bloquea** en v1 (`devolucion-venta-revendedora`) | La devolución del cliente final pasa por la revendedora y se resuelve con el flujo de cambio/devolución de revendedora. Mismo criterio que DC-6/DC-7 |
| DR-8 | Acciones de permiso: `ver`, `crear`, `editar`, `eliminar`, `liquidar` (esta última nueva) | Mantiene el vocabulario del catálogo; `baja` pasa a `eliminar` |
| DR-10 | **La revendedora tiene login real** (usuario y contraseña) y ve solo lo suyo: piezas en su poder, vendido, comisión, cuánto le debe al local. Specs en `specs/REQ-RV-ACC.md` | Pedido del dueño: quiere saber qué stock hay y dónde está sin que lo cargue el local |
| DR-11 | **Ella declara, el local confirma.** La declaración no mueve stock, plata ni comisión hasta que el local la confirma (llama a `sp_registrar_venta`) | Los números del negocio nunca dependen de lo que escribe una tercera parte sin control. Además ella no informa precio ni medio de pago |
| DR-12 | **Aislamiento por usuario con policies `RESTRICTIVE` en las 36 tablas** (denegar por defecto) más un test que falla si una tabla futura no la tiene. No se reescriben las policies existentes | Una restrictiva solo puede cerrar, no abrir por error; el operador (sin claim) no cambia de comportamiento |
| DR-13 | **Lecturas de la revendedora por funciones `rvp_*` `SECURITY DEFINER`** con identidad solo del claim y columnas listadas. Es una **excepción a la regla "lecturas INVOKER"** de AGENTS.md. **APROBADA por el usuario el 2026-10-09**, acotada a este alcance | RLS filtra filas, no columnas; las tablas de ítems y ventas tienen costos |
| DR-14 | **Pago de venta de revendedora**: nuevo `medio_pago = 'cuenta_revendedora'` ("a rendir por la revendedora"). No entra a caja; el efectivo entra cuando ella paga la liquidación (`pago_revendedora`) | El trigger de cuadre de pagos exige que los pagos sumen el total, y la plata la tiene ella, no el local |
| DR-15 | **Panel de gestión de revendedoras para el local** como pantalla principal de `/revendedoras`: quién tiene qué, quién vendió, quién debe, quién está atrasada. Spec en `specs/REQ-RV-ADM.md` | El administrador del local necesita ver y gestionar todo el negocio de revendedoras desde un solo lugar, no solo una lista |
| DR-16 | **Quien tenga `revendedoras/crear` da de alta a las revendedoras.** La comisión es **propia de cada revendedora**: escala por tramos o porcentaje fijo, con vigencia, y cae a la regla general si no tiene una | Pedido: el porcentaje por revendedora es personalizable |
| DR-17 | **El acceso de una revendedora se crea igual que el de cualquier usuario limitado del local**: desde Administración → Usuarios, eligiendo el rol `Revendedora` y la revendedora a la que corresponde (o con el atajo "Dar acceso" en su ficha). Ambos caminos usan la misma acción | Es el modelo mental que ya usa el local. Lo único distinto es el enlace a la revendedora, que activa el aislamiento de datos |
| DR-9 | Grupo del Sidebar: **OPERACIONES**, un solo ítem "Revendedoras". Liquidaciones y comisiones son subrutas | Un módulo, un ítem; liquidar se controla por acción, no por otro módulo |
| DR-18 | **Finanzas del cambio de producto**: (1) Rechazo de diferencia negativa (`diferencia-negativa-no-permitida`); (2) Congelamiento de `precio_venta` en la línea nueva de reemplazo al precio original (DR-5, base de comisión inmutable); (3) Las diferencias positivas se cobran y reconocen como ingreso en `rf_finanzas_resultados` (en la fecha del cambio) y en `pago_venta`/`cambio_venta`, sin alterar `venta.total` (preservando la invariante `tg_venta_cuadre_pagos`); (4) Al anular una venta con cambios, `v_anulaciones` suma el total de la venta más las diferencias de cambio, y se bloquea la devolución de una línea ya cambiada con `detalle-ya-cambiado`; (5) Motivo de 00100/00101: actualizar vistas y funciones de lectura (`v_linea_venta`, `rf_cuenta_corriente_revendedora`, paneles) para reflejar las transiciones de ítems y diferencias de `cambio_venta` | Coherencia contable entre caja, resultados y tenencia sin reescribir cabeceras históricas |
| DR-19 | **sp_registrar_devolucion_cliente excluye cuenta_revendedora**: Al calcular la suma del reintegro al cliente (`sp_registrar_devolucion_cliente`, migración 00110), se excluyen los pagos con `medio_pago = 'cuenta_revendedora'`, ya que representan fondos a rendir por la revendedora y no ingresos de caja del local. | Integridad de reintegros de caja física en devoluciones |

## 5. Decisiones de diseño heredadas del borrador (siguen vigentes)

- **Comisión resuelta al liquidar**, no al vender. `porcentaje_comision_preview` en la línea
  es solo informativo. `monto_comision` lo escribe una sola vez `sp_generar_liquidacion`.
- **`estado_item` gana `en_revendedora`**. `ALTER TYPE … ADD VALUE` va en su propia migración
  y nada la usa en el mismo archivo. Hay que auditar los **19 archivos** que leen `estado_item`
  / `EstadoItem` (el borrador decía 16).
- **Resolutor en dos lugares** (TS para preview, SQL como autoridad) con **una tabla de
  fixtures que maneja ambos tests**, igual que `resolver-recargo.ts`.
- **Sin SQL en `app/` ni `components/`**; escrituras por `sp_*`; lecturas `rf_*` y vistas
  `SECURITY INVOKER`, nunca `DEFINER`.

## 6. Orden respecto de otros cambios

1. **`finanzas-panel` debe estar cerrado** antes de la primera migración de este cambio.
   Este cambio modifica `v_linea_venta`, `rf_finanzas_resultados` y el trigger de
   inmutabilidad creados por ese. Las migraciones llegan hasta `00074`; **este cambio
   arranca en `00076`**.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `sp_registrar_venta` es el objeto de mayor radio de impacto (`00046`, `00057`, `00064`, `00067`, `00068`) | Una regresión rompe toda venta | Partir de su **última** definición (`00068`). Tests existentes en verde con `canal` por defecto **antes** de agregar la rama de canal. Revisión con `/judgment-day` |
| El trigger `tg_detalle_venta_inmutable` (`00068`) solo permite tocar `id_rendicion` y `excluida_rendicion` | La liquidación falla con `detalle-venta-inmutable` | Se extiende el allowlist en la misma migración que agrega las columnas (REQ-RV-DB-05) y se prueba |
| Comisión fuera de `v_linea_venta` | Ganancia sobrestimada para siempre | Slice propio con el escenario dorado ampliado (REQ-RV-FIN) |
| Módulo apagado pero accesible por un punto que olvidamos (selector de canal, bloque, canal en acción de ventas) | Un tenant ve o usa lo que no contrató | Matriz de bloqueo en `specs/REQ-RV-MOD.md` con test por cada punto |
| Estado nuevo mal contado en finanzas (capital propio, mercadería) | Cifras de posición erróneas | Auditar `rf_finanzas_posicion` / mercadería por enumeraciones de `estado_item` |
| Datos de costo expuestos a una sesión de revendedora | Fuga de márgenes y proveedores | DR-12/13: denegar por defecto, guardia anti-olvido, snapshot de payload por función `rvp_*` |
| Resolutor TS/SQL se desvían | Se cotiza un monto y se liquida otro | Fixtures compartidos |
| Alcance vs. estimación comercial del cliente | Comercial | Este módulo ya es ~13 PRs. Recotizar antes de fijar fecha |

## 8. Criterios de aceptación del cliente (mapeados)

1. Crear producto y QR — ya cumplido (`item_producto.qr_code`).
2. Escanear y ver costo/precio/estado/stock — ya cumplido (`inventario/ficha/[qr]`).
3. Entregar a revendedora y ver que sale de disponibilidad central — NR-20/21.
4. Registrar venta de revendedora y calcular deuda y comisión — NR-44/52.
5. Venta del local con comisión del vendedor — NR-33/46 (semilla 0, DR-6).
6. Cambio sin romper stock ni duplicar comisión — NR-60/61.
7. Dashboard por canal, por cobrar, stock disponible y consignado — NR-82/83.
