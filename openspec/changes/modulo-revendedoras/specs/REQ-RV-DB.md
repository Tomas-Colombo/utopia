# REQ-RV-DB — Modelo de datos, SPs y finanzas

**Change**: `modulo-revendedoras`
Todas las migraciones: numeradas desde **`00076`**, con bloque `-- DOWN:` completo y
**probado** sobre una base recién migrada. Cualquier slug que levante un `sp_*` entra en
`lib/errores/mensajes.ts` y en el inventario de `lib/errores/mensajes.test.ts`
(`slugs-migraciones.test.ts` lo exige). Montos `numeric`, sin aritmética de dinero en TS.

> Nota DOWN: `ALTER TYPE … ADD VALUE` no se revierte en Postgres. El DOWN de esa migración
> documenta que el valor queda inerte y explica cómo recrear el tipo si hiciera falta.

## DB-01 Entidad

- `revendedora`: `id_revendedora`, `id_tenant`, `nombre`, `apellido`, `telefono`, `email`,
  `id_usuario` null (enlace al login de la revendedora, único parcial; ver `REQ-RV-ACC-01`), `fecha_alta`,
  `notas`, `activo`, timestamps, trigger `updated_at`.
- `sp_crear_revendedora`, `sp_editar_revendedora`, `sp_baja_revendedora` (baja lógica; se
  rechaza con mercadería en poder: `revendedora-con-stock`). Cada uno escribe `auditoria`
  en la misma transacción.

## DB-02 Estado de ítem

- Migración A: solo `alter type estado_item add value 'en_revendedora'`.
- Migración B: `is_transicion_item_valida` partiendo de su **última** definición
  (`rg -l "function is_transicion_item_valida" supabase/migrations | sort | tail -1`).
  Aristas nuevas: `disponible → en_revendedora`; `en_revendedora → disponible | vendido |
  devuelto | baja`; `vendido → en_revendedora` (anulación de venta canal revendedora sin liquidar, DR-7, migración `00090`). `reservado → en_revendedora` rechazada. Todo lo demás, rechazado.
- Test de matriz tabla-manejada, incluidas todas las aristas rechazadas.
- **Auditar los 19 archivos** que leen `EstadoItem` y agregar guardia `never` en el mapeo de
  badges para que el próximo estado rompa el build y no renderice en blanco.
- **Auditar finanzas**: `rf_finanzas_posicion`, mercadería y capital propio. Un ítem
  `en_revendedora` sigue siendo capital del local; decidir y testear dónde se cuenta.

## DB-03 Consignación de salida

Espejo de `00024`/`00025`/`00054` con la contraparte cambiada.
- `consignacion_revendedora` (revendedora, `periodo_desde`, `periodo_hasta`, `estado`
  `abierta|cerrada`, `confirmada`, `observaciones`, auditoría) y
  `consignacion_revendedora_detalle` (`id_item`, `id_producto`, `estado_detalle`,
  `fecha_entrega`, `fecha_devolucion`, `motivo`). Índice único parcial: un ítem no puede
  estar en dos consignaciones abiertas.
- SPs: `sp_crear_consignacion_revendedora_con_items`, `sp_editar_…`, `sp_confirmar_…`
  (mueve a `en_revendedora`), `sp_registrar_devolucion_revendedora` (→ `disponible`, o
  `devuelto`/`baja` si vuelve dañado), `sp_cerrar_…` (rechaza con ítems en poder),
  `sp_eliminar_…` (solo borrador).
- Rechazos: ítem `reservado`, `vendido` o ya `en_revendedora` (`item-no-entregable`).
- `rf_stock_por_tenencia` (`SECURITY INVOKER`): central / por revendedora / disponible.

## DB-04 Comisiones

- Enums `ambito_comision (revendedora|local)`. `regla_comision` (`ambito`, `id_revendedora`
  null = todas, `vigente_desde`, `vigente_hasta` null = vigente, `activo`) y
  `escala_comision` (`objetivo_desde`, `porcentaje` 0–100, único `(id_regla, objetivo_desde)`).
- Exclusión de ventanas de vigencia solapadas para el mismo `(tenant, ámbito, revendedora)`
  (constraint `EXCLUDE` o trigger) — hoy el borrador no lo impedía.
- `fn_resolver_comision(p_id_revendedora, p_fecha, p_monto_periodo)`: regla específica de la
  revendedora → regla general del tenant → 0 con marca `sin_regla`. Nunca excepción (NR-34).
- **Comisión propia por revendedora (DR-16).** Cada revendedora puede tener su **propia regla**
  (`regla_comision.id_revendedora` = ella) con su escala de tramos, o un **porcentaje fijo**
  (un único tramo `objetivo_desde = 0`). Si no tiene regla propia vigente, rige la general del
  tenant. La ficha de la revendedora muestra qué regla le aplica hoy y de dónde viene
  ("propia" o "general"), y permite crear, editar o terminar su regla (acción `editar`).
  Cambiar la regla de una revendedora no toca períodos ya liquidados (las líneas guardan
  `porcentaje_aplicado`). La revendedora ve su propio porcentaje y sus tramos en `rvp_mi_cuenta`.
- Semilla de regla general (porcentaje 0 para `local`, DR-6) al habilitar el módulo: en
  `sp_toggle_tenant_modulo` o por función idempotente invocada desde él; **no** depende de
  `provision-tenant`.
- `lib/comisiones/resolver-comision.ts` + `lib/comisiones/__fixtures__/escalas.ts`: **una
  tabla de fixtures** alimenta el test unitario y el test de DB. Casos: monto justo en el
  borde de un tramo, debajo del primero, vigencias, fallback sin regla.

## DB-05 Venta por canal

- `canal_venta (local|revendedora|online)`; `venta.canal not null default 'local'`;
  `venta.id_revendedora` null con `check (canal <> 'revendedora' or id_revendedora is not null)`.
  `online` queda reservado: ningún flujo lo escribe en v1.
- `detalle_venta`: `porcentaje_comision_preview numeric(5,2) not null default 0`,
  `monto_comision numeric(14,2) not null default 0 check (>= 0)`, `id_liquidacion uuid`
  (FK al crearse la liquidación, mismo patrón que el cierre circular de `00026`),
  `excluida_liquidacion boolean not null default false`.
- **Trigger de inmutabilidad** (`tg_detalle_venta_inmutable`, `00068`): partir de su
  definición vigente y permitir modificar `monto_comision`, `id_liquidacion` y
  `excluida_liquidacion` **solo** si la fila aún no tiene `id_liquidacion` (o se la está
  asignando/quitando por `sp_*`); `porcentaje_comision_preview`, `precio_venta`,
  `costo_snapshot`, `monto_ganancia` siguen congelados. Test: UPDATE directo rechazado,
  UPDATE vía SP aceptado, UPDATE sobre línea ya liquidada rechazado.
- **`sp_registrar_venta`**: copiar la última definición (`rg -l "function sp_registrar_venta"
  supabase/migrations | sort | tail -1` → hoy `00068`). Agregar `p_canal default 'local'` y
  `p_id_revendedora default null`. Con `canal='revendedora'`: validar módulo habilitado, que
  cada ítem esté `en_revendedora` **de esa revendedora** (vía detalle de consignación abierta)
  y pasarlo a `vendido` marcando el detalle de consignación. Snapshot de
  `porcentaje_comision_preview`. La firma vieja sigue funcionando (todo el set existente en
  verde antes de tocar nada).
- **Anulación/devolución** (DR-7): `sp_anular_venta` (`00070`) — canal revendedora sin
  liquidar → ítem vuelve a `en_revendedora`, detalle de consignación se reabre; liquidada →
  `venta-liquidada`. `sp_registrar_devolucion_cliente` (`00071`) — canal revendedora →
  `devolucion-venta-revendedora`. Partir de las definiciones de `00070`/`00071`.

## DB-05b Pago de la venta de revendedora (DR-14)

- Migración con `alter type medio_pago add value 'cuenta_revendedora'` (sola, como DB-02).
- `sp_registrar_venta` con `canal='revendedora'` registra el pago por el total con ese medio,
  sin `id_cuenta` destino, para que `tr_venta_cuadre_pagos` cuadre. Con otro canal ese medio se
  rechaza (`medio-solo-revendedora`).
- Finanzas: `cobrado`/`neto_cobros` y el flujo **excluyen** ese medio; entra a caja recién con
  `pago_revendedora` (DB-06). `rf_cuentas_por_cobrar`/posición lo cuentan como por cobrar.
- Test: venta de revendedora no suma a caja; su liquidación pagada sí, una sola vez.

## DB-06 Liquidación

Espejo de `00026`/`00027`. Partir de la **última** definición de `sp_generar_rendicion`
(incluye la exclusión de devueltos de `finanzas-panel`).
- `estado_liquidacion (pendiente|pagada)`. `liquidacion_revendedora` (revendedora, período,
  `monto_vendido`, `monto_comision`, `monto_a_cobrar`, `cantidad_lineas`,
  `porcentaje_aplicado`, estado, `fecha_pago`, observaciones). `pago_revendedora`
  (`id_liquidacion`, `fecha`, `monto`, `metodo`, `referencia`, **`id_cuenta`** destino, DR-3);
  inmutable una vez registrado (append-only).
- `preview_liquidacion` (lectura, `INVOKER`). `sp_generar_liquidacion`: suma el período
  con `fn_rango_tenant`, llama a `fn_resolver_comision` **una sola vez** con el total,
  escribe `monto_comision` por línea, sella `id_liquidacion` y **recalcula la cabecera desde
  las filas realmente selladas** (guarda de concurrencia de `sp_generar_rendicion`).
- `sp_excluir_detalle_liquidacion` / `sp_reincluir_…`, `sp_marcar_liquidacion_pagada`
  (requiere acción `liquidar`; valida `id_cuenta` del tenant; cuadre de monto).
- Una línea no puede liquidarse dos veces; una venta liquidada no se anula.
- `rf_cuenta_corriente_revendedora`: en poder, vendido, devuelto, adeudado, pagado.

## DB-07 Cambios de producto

Se apoya en `devolucion_venta` / `reintegro_cliente` de `finanzas-panel`.
- `cambio_venta` (`id_venta_original`, `id_detalle_original`, `id_item_entregado`,
  `diferencia`, `motivo`, `origen` `local|revendedora`, `id_usuario_alta`).
- `sp_registrar_cambio`, en una transacción: ítem original → `disponible` (o
  `en_revendedora` si el cambio es de canal revendedora no liquidado), ítem entregado →
  `vendido`, línea original con `excluida_liquidacion = true`, **sin comisión sobre la
  diferencia** (DR-5). Cambio sobre venta liquidada → rechazado.
- Invariante testeada: comisión total después del cambio = comisión antes del cambio.

## DB-08 Finanzas (lo que el borrador apuntaba a funciones ya borradas)

`rf_reporte_financiero`/`rf_reporte_caja`/`rf_rotacion_por_producto` ya no existen (`00074`).
- `v_linea_venta` gana `comision` (= `monto_comision` de líneas liquidadas, 0 en el resto) y
  `comision_estimada` (= `porcentaje_comision_preview × precio_venta` de las no liquidadas).
- `rf_finanzas_resultados` expone `comision_liquidada` (se resta en `ganancia_final`) y
  `comision_pendiente_estimada` (informativa, **no** se resta, DR-2). Las líneas de ventas
  anuladas/devueltas no aportan comisión.
- `rf_finanzas_flujo` suma `pago_revendedora` como cobro; `rf_finanzas_posicion` suma el
  saldo adeudado por revendedoras a "por cobrar".
- Se parte de la última definición de cada una (`00072`/`00073` y posteriores) y se agrega un
  **escenario dorado de revendedoras** en `specs/golden.md` con cifras calculadas a mano
  antes de implementar. Prohibido ajustar el test para que pase.
- Bloque `revendedoras` en `/reportes`: `rf_perfil_revendedora`, `rf_cumplimiento_objetivos`
  (`INVOKER`), canal en el resumen de ventas, stock en poder vs. central.

## DB-09 Acceso y declaración

Definido en `specs/REQ-RV-ACC.md`: claim `id_revendedora` en el hook, `auth_revendedora_id()`,
policies restrictivas en todas las tablas, `declaracion_venta_revendedora`, `sp_declarar_…`,
`sp_confirmar_…`, `sp_rechazar_…`, funciones `rvp_*`. Mismas reglas de migración: `-- DOWN:`
probado, slugs en `mensajes.ts`.
