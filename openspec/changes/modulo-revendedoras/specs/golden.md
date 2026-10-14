# Escenario Dorado — Venta por Canal, Liquidación y Finanzas (Revendedoras)

**Change**: `modulo-revendedoras`
**Applies to**: REQ-RV-DB-06 (Slice 7a), REQ-RV-DB-08 (Slice 6b), DR-2, DR-3, DR-14

Este documento es el contrato de aceptación financiero para el módulo de revendedoras.
Las cifras esperadas fueron calculadas **a mano** con cifras redondas.
Si el resultado de los tests difiere, el error está en la implementación o en este documento; **MUST NOT ajustarse el test para que pase**.

---

## 1. Fixtures y Datos Base

- **Periodo M (Mayo 2026)**: del `2026-05-01` al `2026-05-31`.
- **Periodo M+1 (Junio 2026)**: del `2026-06-01` al `2026-06-30`.
- **Producto `P1`**:
  - `precio_venta`: $100.000
  - `costo`: $40.000
  - `tipo_ingreso`: `compra`
- **Stock inicial**: 4 ítems de `P1` comprados y confirmados en $M$ a $40.000 c/u (total compras: $160.000).
- **Revendedora `R1`**:
  - Activa en el tenant.
  - Regla de comisión por tramos en el tenant/revendedora:
    - **Tramo 1** ($0 a $100.000): **10%**
    - **Tramo 2** (>$100.000): **15%**
- **Cuentas**: Cuenta corriente bancaria activa en el tenant para cobro de liquidaciones.

---

## 2. Transacciones del Escenario Dorado

### A. Ocurridas en Mes M (Mayo 2026)

1. **V1 — Venta Canal Local** (`2026-05-10`)
   - 1 ítem `P1` (compra)
   - Canal: `local`
   - Precio: $100.000 / Costo: $40.000
   - Cobro: Efectivo ($100.000)
   - Estado: `registrada`
   - Comisión liquidada: $0 / Comisión estimada: $0

2. **V2 — Venta Canal Revendedora** (`2026-05-15`)
   - 1 ítem `P1` entregado previamente en consignación a `R1`
   - Canal: `revendedora` (`id_revendedora = R1.id`)
   - Precio: $100.000 / Costo: $40.000
   - Medio de pago: `cuenta_revendedora` ($100.000, imputación automática sin caja física)
   - **Snapshot preview: 10%** (al momento de la venta, el acumulado vendido previo en el período era $0, ubicándose en el Tramo 1)
   - Estado: `registrada`
   - En Mes $M$: queda sin liquidar (`id_liquidacion IS NULL`).

3. **V3 — Venta Canal Revendedora** (`2026-05-20`)
   - 1 ítem `P1` entregado previamente en consignación a `R1`
   - Canal: `revendedora` (`id_revendedora = R1.id`)
   - Precio: $100.000 / Costo: $40.000
   - Medio de pago: `cuenta_revendedora` ($100.000, imputación automática)
   - **Snapshot preview: 10%** (resolución base al momento de la venta, ubicándose en Tramo 1)
   - Estado: `registrada`
   - **Exclusión**: Marcada explícitamente con `sp_excluir_detalle_liquidacion` (`excluida_liquidacion = true`). No participa de la liquidación $L_1$.
   - Comisión liquidada: $0
   - Comisión pendiente estimada en M: $10.000 (10% sobre $100.000).

4. **V4 — Venta Canal Revendedora (Anulada en M)** (`2026-05-25`)
   - 1 ítem `P1` entregado previamente en consignación a `R1`
   - Canal: `revendedora` (`id_revendedora = R1.id`)
   - Precio: $100.000 / Costo: $40.000
   - Snapshot preview: 10%
   - Anulada en el mismo período $M$ vía `sp_anular_venta`:
     - Estado venta: `anulada`
     - Reintegro: no afecta caja física (era `cuenta_revendedora`).
     - Ítem transiciona de `vendido` a `en_revendedora` (DR-7).
   - Comisión liquidada: $0 / Comisión estimada: $0 (ventas anuladas no aportan comisión).

5. **G1 — Gasto Operativo en M** (`2026-05-28`)
   - Gasto general del local: $5.000 en efectivo.

---

### B. Ocurridas en Mes M+1 (Junio 2026)

6. **L1 — Liquidación del Período M** (`2026-06-05`)
   - Período liquidado: Mes $M$ (`2026-05-01` a `2026-05-31`).
   - Ejecución de `sp_generar_liquidacion`:
     - Como V3 fue excluida con `sp_excluir_detalle_liquidacion`, solo se sella V2.
     - Total vendido a liquidar: $100.000 (1 línea).
     - `fn_resolver_comision` resuelve sobre el total del período liquidado ($100.000), cayendo en Tramo 1 (10%).
     - `monto_vendido`: $100.000.
     - `monto_comision`: $10.000 (`porcentaje_aplicado`: 10.00).
     - `monto_a_cobrar`: $90.000 ($100.000 − $10.000).
     - Línea V2 sellada con `id_liquidacion = L1.id`.
     - Estado inicial de $L_1$: `pendiente`.

7. **PAGO_L1 — Pago de la Liquidación L1** (`2026-06-10`)
   - Ejecución de `sp_marcar_liquidacion_pagada`:
     - Monto: $90.000 (cuadre exacto con `monto_a_cobrar`).
     - Cuenta destino: cuenta bancaria activa del tenant.
     - Registro inmutable en `pago_revendedora`.
     - $L_1$ transiciona a `estado = 'pagada'`, `fecha_pago = 2026-06-10`.

---

## 3. Resultados Esperados (`rf_finanzas_resultados`)

### A. Período M (Mayo 2026) — Consultado tras liquidar V2 en M+1:

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| `ventas_brutas` | **400.000** | V1 (100.000) + V2 (100.000) + V3 (100.000) + V4 (100.000) |
| `anulaciones` | **100.000** | V4 anulada en M |
| `devoluciones` | **0** | Sin devoluciones directas de clientes en M |
| **`ventas_netas`** | **300.000** | 400.000 − 100.000 − 0 (V1 + V2 + V3) |
| `costo_mercaderia` | **120.000** | 3 × 40.000 (V1, V2, V3) |
| **`ganancia_sobre_ventas`** | **180.000** | `ventas_netas` (300.000) − `costo_mercaderia` (120.000) |
| `costo_cobro` | **0** | Efectivo sin arancel |
| `incobrables` | **0** | Sin cuotas |
| `bajas_inventario` | **0** | Sin bajas |
| **`ganancia_despues_de_costos`** | **180.000** | 180.000 − 0 − 0 − 0 |
| `gastos` | **5.000** | Gasto G1 |
| **`comision_liquidada`** | **0** | **DR-2**: Se devenga por fecha de liquidación (`2026-06-05` en M+1). No hubo liquidación en M. **No reescribe M**. |
| **`comision_pendiente_estimada`** | **10.000** | Línea V3 pendiente (10% sobre 100.000). V2 ya tiene liquidación asignada. |
| **`ganancia_final`** | **175.000** | 180.000 − 5.000 − 0 = **$175.000** |
| `cantidad_ventas` | **3** | V1, V2, V3 registradas (V4 anulada no suma) |
| `ticket_promedio` | **100.000** | `ventas_netas` (300.000) / `cantidad_ventas` (3) = 100.000 |

### B. Período M+1 (Junio 2026):

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| `ventas_netas` | **0** | Sin ventas en M+1 |
| `costo_mercaderia` | **0** | Sin costo en M+1 |
| `gastos` | **0** | Sin gastos en M+1 |
| **`comision_liquidada`** | **10.000** | **DR-2**: Devenga la comisión de $L_1$ ($10.000) en su fecha de liquidación (`2026-06-05`). |
| `comision_pendiente_estimada` | **0** | Sin ventas pendientes en M+1 |
| **`ganancia_final`** | **-10.000** | 0 − 0 − 10.000 = **-$10.000** |
| `cantidad_ventas` | **0** | Sin ventas en M+1 |
| `ticket_promedio` | **0** | Sin ventas en M+1 |

*Control consolidado M + (M+1)*: $175.000 + (-$10.000) = **$165.000**, resultado económico real acumulado del negocio.

---

## 4. Flujo de Caja Esperado (`rf_finanzas_flujo`)

### A. Período M (Mayo 2026):

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| `cobrado` | **100.000** | Solo cobro de V1 en canal local ($100.000 en efectivo). V2 y V3 en `cuenta_revendedora` se excluyen de caja física. |
| `devuelto_clientes` | **0** | V4 fue venta revendedora (`cuenta_revendedora`), no sale dinero de caja física. |
| `costo_cobro` | **0** | Sin aranceles |
| **`neto_cobros`** | **100.000** | 100.000 − 0 − 0 |
| `compras_mercaderia` | **160.000** | 4 ítems de compra a 40.000 confirmados en M |
| `pagos_proveedores` | **0** | Sin rendiciones pagadas |
| `gastos` | **5.000** | Gasto G1 |
| **`flujo_neto`** | **-65.000** | 100.000 − 160.000 − 5.000 = **-$65.000** |
| `por_acreditar` | **`{}`** | Sin cobros diferidos |

### B. Período M+1 (Junio 2026):

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| **`cobrado`** | **90.000** | **DR-3/DR-14**: Cobro de liquidación $L_1$ vía `pago_revendedora` ingresado a cuenta activa del tenant el `2026-06-10`. |
| `devuelto_clientes` | **0** | Sin devoluciones |
| `costo_cobro` | **0** | Sin aranceles |
| **`neto_cobros`** | **90.000** | Ingreso neto a cuenta bancaria del tenant |
| `compras_mercaderia` | **0** | Sin compras en M+1 |
| `pagos_proveedores` | **0** | Sin pagos a proveedores |
| `gastos` | **0** | Sin gastos en M+1 |
| **`flujo_neto`** | **+90.000** | Entran los $90.000 de la revendedora a caja. |

*Control consolidado de caja M + (M+1)*: -$65.000 + $90.000 = **+$25.000**, cuadre exacto de caja.

---

## 5. Posición Financiera Esperada (`rf_finanzas_posicion`)

Regla de cálculo para `por_cobrar.a_cobrar`:
$$\text{por\_cobrar.a\_cobrar} = \text{cuotas\_clientes} + \text{deuda\_revendedoras}$$
Donde la deuda de revendedoras se define como:
$$\text{deuda\_revendedoras} = \text{total\_vendido} - \text{comisiones\_liquidadas} - \text{total\_pagado}$$

### A. Foto 1 — Antes del pago de L1 (con L1 pendiente en M+1):

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| `capital_propio` | **40.000** | Ítem de V4 anulada, en estado `en_revendedora` (a su costo de ingreso: $40.000) |
| `mercaderia_terceros` | **0** | Sin mercadería de terceros |
| `devueltos_clientes` | **0** | Sin devoluciones de clientes |
| `valor_venta_potencial` | **100.000** | Ítem de V4 anulada en `en_revendedora` a precio de catálogo ($100.000) |
| `deuda_proveedores` | **0** | Sin compras a consignación |
| **`por_cobrar.a_cobrar`** | **190.000** | Cuotas de clientes ($0) + Deuda de revendedora ($190.000). Compuesto por: $90.000 de $L_1$ liquidada pendiente de cobro + $100.000 de V3 retenida y vendida aún no liquidada. ($200.000 vendido − $10.000 comisión liquidada − $0 pagado = **$190.000**). |

### B. Foto 2 — Después del pago de L1 (con L1 pagada en M+1):

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| `capital_propio` | **40.000** | Ítem de V4 anulada en `en_revendedora` ($40.000) |
| `valor_venta_potencial` | **100.000** | Ítem de V4 a precio de catálogo ($100.000) |
| **`por_cobrar.a_cobrar`** | **100.000** | Cuotas de clientes ($0) + Deuda de revendedora ($100.000). ($200.000 vendido − $10.000 comisión liquidada − $90.000 pagado = **$100.000** correspondiente a V3 que aún no fue liquidada ni pagada). |

---

## 6. Cuenta Corriente de Revendedora (`rf_cuenta_corriente_revendedora`)

Métrica `adeudado` para la revendedora $R_1$:
$$\text{adeudado} = \text{total\_vendido} - \text{comisiones\_liquidadas} - \text{total\_pagado}$$

### A. Foto 1 — Antes del pago de L1:
| Métrica | Esperado | Justificación |
|---|---|---|
| `items_en_poder` | **1** | Ítem de V4 anulada que volvió a consignación abierta |
| `monto_en_poder` | **100.000** | 1 ítem a precio de venta $100.000 |
| `total_vendido` | **200.000** | V2 ($100.000) + V3 ($100.000) |
| `total_devuelto` | **0** | Sin devoluciones al local |
| `total_comision_liquidada` | **10.000** | Comisión fijada en $L_1$ para V2 |
| `total_liquidado` | **90.000** | `monto_a_cobrar` de liquidaciones generadas ($L_1$) |
| `total_pagado` | **0** | Todavía no se registró pago |
| **`adeudado`** | **190.000** | $200.000 − $10.000 − $0 = **$190.000** |

### B. Foto 2 — Después del pago de L1:
| Métrica | Esperado | Justificación |
|---|---|---|
| `items_en_poder` | **1** | Ítem de V4 |
| `monto_en_poder` | **100.000** | 1 ítem a precio de venta $100.000 |
| `total_vendido` | **200.000** | V2 ($100.000) + V3 ($100.000) |
| `total_comision_liquidada` | **10.000** | Comisión de $L_1$ |
| `total_liquidado` | **90.000** | `monto_a_cobrar` de $L_1$ |
| `total_pagado` | **90.000** | Registrado en `pago_revendedora` |
| **`adeudado`** | **100.000** | $200.000 − $10.000 − $90.000 = **$100.000** (resta liquidar y cobrar V3) |

---

## 7. Comportamiento con Módulo Deshabilitado

- Con `tenant_modulo.habilitado = false` para `'revendedoras'`:
  - `comision_liquidada` y `comision_pendiente_estimada` devuelven 0 en `rf_finanzas_resultados`.
  - `rf_cuenta_corriente_revendedora`, `preview_liquidacion` y los `sp_*` de liquidación rechazan la operación con slug `modulo-revendedoras-deshabilitado`.
