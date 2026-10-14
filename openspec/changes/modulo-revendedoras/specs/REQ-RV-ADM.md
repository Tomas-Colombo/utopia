# REQ-RV-ADM — Gestión de revendedoras en el local

**Change**: `modulo-revendedoras`
Pantalla de trabajo del administrador del local (y de quien tenga permisos). Todo lo de esta
spec es lectura `INVOKER` bajo RLS normal por tenant; las acciones pasan por Server Actions de
tres puertas y `sp_*`.

## Quién puede qué

| Acción | Permiso |
|---|---|
| Ver el panel, fichas, consignaciones, ventas, cuentas | `revendedoras/ver` |
| **Dar de alta** una revendedora, entregar mercadería, confirmar/rechazar declaraciones | `revendedoras/crear` |
| Editar datos, comisión propia, dar o quitar acceso | `revendedoras/editar` |
| Baja de revendedora | `revendedoras/eliminar` |
| Generar liquidación, marcar pagada | `revendedoras/liquidar` |

El local puede repartir estas acciones entre empleados con el editor de roles actual (por
ejemplo, quien confirma ventas y entrega mercadería pero no liquida).

## ADM-01 Panel principal (`/revendedoras`)

- **REQ-RV-ADM-01** Una fila por revendedora con: estado, **piezas en su poder** (cantidad y
  valor a precio de venta), **vendido** en el período, **comisión** del período (liquidada +
  estimada, rotuladas), **adeudado al local**, fecha de la última venta, **declaraciones
  pendientes de confirmar** y una marca de cuenta (*al día* / *con saldo* / *atrasada*, según
  el vencimiento de su última liquidación pendiente).
- **REQ-RV-ADM-02** Tarjetas de resumen arriba: total en poder de revendedoras vs. en el local,
  total adeudado por revendedoras, declaraciones pendientes, liquidaciones pendientes de cobro.
- **REQ-RV-ADM-03** Filtros del patrón unificado de listas del proyecto: período, estado,
  con saldo / atrasadas / con declaraciones pendientes, búsqueda por nombre. Orden por cualquier
  columna. Exportación CSV (con `csvNegative`).
- **REQ-RV-ADM-04** Los números salen de **una** función de lectura `rf_panel_revendedoras`
  (`INVOKER`), no de sumas en TypeScript. Paginada y con tope si hay muchas revendedoras
  (diseñar para N: una consulta, no una por fila).

## ADM-02 Ficha de la revendedora (`/revendedoras/[id]`)

- **REQ-RV-ADM-10** Pestañas: **Resumen** (datos, acceso, comisión vigente y su origen),
  **En su poder** (qué piezas tiene, desde cuándo, valor), **Ventas** (por período y canal),
  **Consignaciones** (entregas y devoluciones), **Cuenta** (corriente: entregado, vendido,
  devuelto, adeudado, pagado), **Liquidaciones**, **Declaraciones**.
- **REQ-RV-ADM-11** Desde la ficha: entregar mercadería, registrar devolución, confirmar o
  rechazar declaraciones, generar liquidación, dar o quitar acceso, editar comisión propia.
  Cada botón se oculta sin el permiso y la acción lo vuelve a validar.
- **REQ-RV-ADM-12** Vista inversa **"quién tiene qué"**: dada una pieza (por QR o búsqueda),
  muestra en poder de qué revendedora está y desde cuándo. Aparece también en la ficha del
  ítem de inventario, condicionada al módulo.

## ADM-03 Alta

- **REQ-RV-ADM-20** `revendedoras/nuevo`: nombre, apellido, teléfono, email, notas. Al crear
  se ofrece, opcionalmente, dar acceso en el mismo paso (DR-17) y definir su comisión propia
  (o dejar la general). Todo en una sola acción de servidor cuando se pide más de una cosa.
- **REQ-RV-ADM-21** No se permiten dos revendedoras activas con el mismo email en el tenant
  (índice único parcial). Baja con mercadería en poder se rechaza (`revendedora-con-stock`).

## ADM-04 Pruebas

- Aislamiento: el panel de un tenant nunca incluye revendedoras de otro.
- Cada acción de la tabla de permisos: rechazada sin el permiso, aceptada con él.
- Módulo apagado: la ruta responde `module-disabled`.
- Un caso con 200 revendedoras: una sola consulta para el panel (sin N+1).
