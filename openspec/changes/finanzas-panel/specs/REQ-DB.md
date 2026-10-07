# REQ-DB — Requisitos de base de datos

**Change**: `finanzas-panel`
**Applies to**: Fases 1–3 (migraciones 00066–00071)

Todos los IDs son estables. Las referencias a §6 son de la propuesta fuente.

---

## REQ-DB-01 — Zona horaria por tenant

**MUST**: La tabla `tenant` MUST tener una columna `zona_horaria text NOT NULL
DEFAULT 'America/Argentina/Buenos_Aires'` con un CHECK que rechace valores
inválidos: `CHECK ((now() AT TIME ZONE zona_horaria) IS NOT NULL)`.

**MUST**: Existir la función `fn_hoy_tenant() RETURNS date STABLE SECURITY INVOKER`
que devuelva la fecha de hoy en la zona horaria del tenant del JWT
(`auth_tenant_id()`).

**MUST**: Existir la función
`fn_rango_tenant(p_desde date, p_hasta date) RETURNS tstzrange STABLE SECURITY INVOKER`
que devuelva el rango semiabierto `[p_desde 00:00, p_hasta+1 00:00)` en la
zona del tenant. MUST levantar `periodo-invalido` si `p_hasta < p_desde` o si
el rango supera 800 días.

**MUST NOT**: Ninguna función nueva ni modificada usar `current_date`, `now()::date`
ni `date_trunc('day', now())`. Solo `fn_hoy_tenant()` / `fn_rango_tenant()`.

---

## REQ-DB-02 — Ganancia correcta y única

**MUST**: `detalle_venta.monto_ganancia = precio_venta - costo_snapshot` para
compra Y consignación, sin excepción.

**MUST**: Existir un CHECK en `detalle_venta`:
`CHECK (monto_ganancia = precio_venta - costo_snapshot)`.

**MUST**: Existir un CHECK en `detalle_venta` para `monto_proveedor`:
```
CHECK (
  (tipo_ingreso_snapshot = 'compra'        AND monto_proveedor = 0) OR
  (tipo_ingreso_snapshot = 'consignacion'  AND monto_proveedor = costo_snapshot)
)
```

**MUST NOT**: Calcularse `monto_ganancia` de dos formas distintas en dos lugares.

---

## REQ-DB-03 — Inmutabilidad de snapshots de venta

**MUST**: Existir un trigger `BEFORE UPDATE` en `venta` que prohíba cambios en
`total`, `fecha`, `id_cliente`, `forma_pago`, `financiacion`, `id_tenant`.
MUST permitir `estado_venta`, `fecha_anulacion`, `motivo_anulacion`,
`observaciones`, `updated_at`.

**MUST**: Existir un trigger `BEFORE UPDATE` en `detalle_venta` que prohíba
todo cambio salvo `id_rendicion` y `excluida_rendicion`.

**MUST**: `pago_venta` ser append-only: policy RLS `SELECT`/`INSERT` solamente,
más trigger que bloquea `UPDATE`/`DELETE`.

**MUST**: El mecanismo de borrado en cascada de tenant (equivalente al de
`00065`) funcionar aun con estos triggers activos. MUST existir un test que
borre un tenant con ventas y pagos y no falle.

---

## REQ-DB-04 — Invariante de cuadre de pagos

**MUST**: Existir un trigger de constraint `DEFERRABLE INITIALLY DEFERRED` sobre
`venta` que, al commit, verifique:
- Financiación `ninguna`/`externa`: `Σ pago_venta.monto = venta.total`.
- Financiación `propia`: `Σ pagos sin cuota + Σ cuota_financiada.monto = venta.total`.

MUST levantar los slugs `pagos-no-cuadran` / `financiacion-no-cuadra`.

---

## REQ-DB-05 — Incobrables sin doble conteo

**MUST**: `sp_marcar_cuota_incobrable` NO crear `gasto_negocio` al marcar incobrable.

**MUST**: `sp_cobrar_cuota` y `sp_marcar_cuota_incobrable` levantar `venta-anulada`
si `venta.estado_venta = 'anulada'`.

---

## REQ-DB-06 — Tablas append-only para reversas

**MUST**: Existir la tabla `devolucion_venta` con:
- `id_devolucion uuid PK`, `id_tenant`, FK a tenant, RLS `id_tenant = auth_tenant_id()`.
- `id_venta`, `id_detalle_venta` con constraint UNIQUE (una línea se devuelve una vez).
- `id_item`, `monto numeric(14,2)` (= `precio_venta` de la línea), `costo_recuperado numeric(14,2)` (= `costo_snapshot`).
- `fecha timestamptz DEFAULT now()`, `motivo text`, `id_usuario`.
- Solo policies `SELECT` e `INSERT`.
- Índice en `(id_tenant, fecha DESC)`.

**MUST**: Existir la tabla `reintegro_cliente` con:
- `id_reintegro uuid PK`, `id_tenant`, FK a tenant, RLS `id_tenant = auth_tenant_id()`.
- `id_venta`, `id_devolucion uuid NULL`, `id_pago_venta uuid NULL`.
- `id_cuenta_destino`, `medio media_pago` (tipo enum existente), `monto numeric(14,2) CHECK (monto > 0)`.
- `fecha timestamptz DEFAULT now()`, `origen text CHECK (origen IN ('anulacion', 'devolucion'))`.
- `motivo text`, `id_usuario`.
- Solo policies `SELECT` e `INSERT`.
- Índice en `(id_tenant, fecha DESC)`.

---

## REQ-DB-07 — sp_anular_venta con reintegros

**MUST**: `sp_anular_venta` rechazar con `venta-con-incobrables` si la venta
tiene cuotas en estado `incobrable`.

**MUST**: `sp_anular_venta` crear un `reintegro_cliente` espejo por cada
`pago_venta` de la venta (mismo `id_cuenta_destino`/`medio`, `monto` = lo
cobrado menos lo ya reintegrado).

**MUST**: `sp_anular_venta` retornar `{ total_reintegrado }` en su JSONB de respuesta.

---

## REQ-DB-08 — sp_registrar_devolucion_cliente reescrito

**MUST**: `sp_registrar_devolucion_cliente` rechazar con slugs:
`venta-anulada`, `linea-ya-devuelta`, `linea-ya-rendida`, `devolucion-venta-con-cuotas-abiertas`, `reintegro-requiere-cuenta`.

**MUST**: Si hay reembolso (`reembolsable > 0`), exigir `id_cuenta_reintegro` y
`medio_reintegro` y crear el `reintegro_cliente`.

**MUST**: Insertar `devolucion_venta` y transicionar el ítem a `devuelto_cliente`.

**MUST**: Retornar `{ reintegro }` en su JSONB.

---

## REQ-DB-09 — Rendición excluye ítems devueltos

**MUST**: `sp_generar_rendicion` y la definición de "pendiente de rendir"
excluir líneas con entrada en `devolucion_venta`.

**MUST**: La exclusión estar en UN solo lugar (vista o función auxiliar) que
usen también `v_perfil_proveedor` y la capa de lectura de Fase 3.

---

## REQ-DB-10 — Vista v_linea_venta como fuente única

**MUST**: Existir la vista `v_linea_venta` con `security_invoker` que una
`detalle_venta` con `venta`, `devolucion_venta` y exponga: `id_tenant`,
`id_venta`, `fecha_venta`, `estado_venta`, `fecha_anulacion`, `precio_venta`,
`costo` (= `costo_snapshot`), `margen` (= `monto_ganancia`), `tipo_ingreso_snapshot`,
`id_proveedor`, `monto_proveedor`, `id_rendicion`, `excluida_rendicion`,
`devuelta bool`, `fecha_devolucion timestamptz`.

**MUST**: Todas las `rf_finanzas_*` calcular costo y margen SOLO desde esta vista.

---

## REQ-DB-11 — rf_finanzas_resultados (§6.1)

**MUST**: Existir `rf_finanzas_resultados(p_desde date, p_hasta date)` que
devuelva UNA fila con los campos exactos de §6.1:
`ventas_brutas`, `anulaciones`, `devoluciones`, `ventas_netas`,
`costo_mercaderia`, `ganancia_sobre_ventas`, `costo_cobro`, `incobrables`,
`bajas_inventario`, `ganancia_despues_de_costos`, `gastos`, `ganancia_final`,
`cantidad_ventas`, `ticket_promedio`.

**MUST**: Cada campo seguir la definición EXACTA de §6.1 (fuente de verdad del contrato).

**MUST NOT**: Calcularse `gastos` si el módulo no es aplicable; la función SHOULD
devolver NULL para ese campo y el DAL lo omite si el bloque está deshabilitado.

---

## REQ-DB-12 — rf_finanzas_flujo (§6.2)

**MUST**: Existir `rf_finanzas_flujo(p_desde date, p_hasta date)` con los campos
exactos de §6.2: `cobrado`, `devuelto_clientes`, `costo_cobro`, `neto_cobros`,
`compras_mercaderia`, `pagos_proveedores`, `gastos`, `flujo_neto`, `por_acreditar`.

**MUST**: `compras_mercaderia` incluir solo ingresos de tipo `compra`, confirmados,
no cancelados (DC-11).

**MUST NOT**: Existir saldos por cuenta: solo desglose de cobrado.

---

## REQ-DB-13 — rf_finanzas_serie_mensual

**MUST**: Existir `rf_finanzas_serie_mensual(p_hasta date, p_meses int DEFAULT 12)`
que devuelva UNA FILA POR MES con `mes`, `ventas_netas`, `ganancia_sobre_ventas`,
`ganancia_final`, `cobrado_neto`.

**MUST**: Usar `generate_series` y UN SOLO escaneo agrupado. MUST NOT disparar
una query por mes.

**MUST**: `p_meses` entre 1 y 24; fuera de rango MUST levantar error.

---

## REQ-DB-14 — rf_finanzas_posicion (§6.3)

**MUST**: Existir `rf_finanzas_posicion()` con los campos exactos de §6.3:
`capital_propio`, `mercaderia_terceros`, `devueltos_clientes`, `valor_venta_potencial`,
`productos_sin_precio`, y los campos de por cobrar y deuda a proveedores.

---

## REQ-DB-15 — rf_finanzas_ranking_productos

**MUST**: Existir `rf_finanzas_ranking_productos(p_desde date, p_hasta date,
p_limite int DEFAULT 20, p_orden text DEFAULT 'ganancia')`.

**MUST**: `p_limite` acotado a 1–100. `p_orden` en lista blanca
(`ganancia`|`unidades`|`monto`); cualquier otro valor MUST levantar `orden-invalido`.

**MUST**: Partir de `v_linea_venta`, líneas de ventas `registrada` con
`fecha_venta` en el rango y sin devolución. Incluir productos inactivos.

---

## REQ-DB-16 — rf_finanzas_gastos_presupuesto y fn_contexto_periodo

**MUST**: `rf_finanzas_gastos_presupuesto(p_mes date)` devolver por categoría
activa: `gastado`, `presupuesto_mensual`, `consumido_pct` (mes calendario en
zona del tenant).

**MUST**: `fn_contexto_periodo()` devolver `{ hoy, mes_desde, mes_hasta }` en
la zona del tenant.

---

## REQ-DB-17 — Propiedades comunes de todas las rf_finanzas_*

**MUST**: Ser `STABLE LANGUAGE SQL SECURITY INVOKER`.

**MUST**: Tener `GRANT EXECUTE ON FUNCTION ... TO authenticated`.

**MUST**: Filtrar con `auth_tenant_id()` internamente (no parámetro de tenant).

**MUST NOT**: Usar `current_date` ni `now()::date`.

---

## REQ-DB-18 — Escenario dorado (§7)

**MUST**: `tests/db/finanzas.test.ts` verificar el escenario A y B de §7 con
los números calculados a mano. Si un número difiere, es un defecto en la
implementación o en el documento; MUST NOT ajustarse el test para que pase.

**MUST**: Cubrir todos los casos de borde del §7 (cada uno como test separado).
