# Escenario Dorado — Venta por Canal y Finanzas (Revendedoras)

**Change**: `modulo-revendedoras`
**Applies to**: REQ-RV-DB-08 (Slice 6b), DR-2, DR-3, DR-14

Este documento es el contrato de aceptación financiero para el módulo de revendedoras.
Las cifras esperadas fueron calculadas **a mano** con cifras redondas.
Si el resultado de los tests difiere, el error está en la implementación o en este documento; **MUST NOT ajustarse el test para que pase**.

---

## 1. Fixtures y Datos Base

- **Periodo M**: todo transcurre dentro del mismo mes calendario $M$.
- **Producto `P1`**:
  - `precio_venta`: \$100.000
  - `costo`: \$40.000
  - `tipo_ingreso`: `compra`
- **Stock inicial**: 4 ítems de `P1` comprados y confirmados en $M$ a \$40.000 c/u (total compras: \$160.000).
- **Revendedora `R1`**:
  - Activa en el tenant.
- **Medio de pago**: Efectivo (costo de cobro 0).

---

## 2. Transacciones del Escenario Dorado

1. **V1 — Venta Canal Local**
   - 1 ítem `P1` (compra)
   - Canal: `local`
   - Precio: \$100.000 / Costo: \$40.000
   - Estado: `registrada`
   - Comisión liquidada: \$0
   - Comisión estimada: \$0

2. **V2 — Venta Canal Revendedora (Liquidada)**
   - 1 ítem `P1` entregado previamente en consignación a `R1`
   - Canal: `revendedora` (`id_revendedora = R1.id`)
   - Precio: \$100.000 / Costo: \$40.000
   - Estado: `registrada`
   - Snapshot preview: 10%
   - Línea liquidada: asociada a liquidación (`id_liquidacion IS NOT NULL`, `monto_comision = 10.000`)
   - Comisión liquidada: \$10.000
   - Comisión pendiente estimada: \$0 (ya está liquidada)

3. **V3 — Venta Canal Revendedora (Pendiente Estimada)**
   - 1 ítem `P1` entregado previamente en consignación a `R1`
   - Canal: `revendedora` (`id_revendedora = R1.id`)
   - Precio: \$100.000 / Costo: \$40.000
   - Estado: `registrada`
   - Snapshot preview: 15%
   - Línea no liquidada: `id_liquidacion IS NULL`, `monto_comision = 0`
   - Comisión liquidada: \$0
   - Comisión pendiente estimada: \$15.000 (15% sobre \$100.000)

4. **V4 — Venta Canal Revendedora (Anulada en M)**
   - 1 ítem `P1` entregado previamente en consignación a `R1`
   - Canal: `revendedora` (`id_revendedora = R1.id`)
   - Precio: \$100.000 / Costo: \$40.000
   - Snapshot preview: 10%
   - Anulada en el mismo período $M$ vía `sp_anular_venta`:
     - Estado venta: `anulada`
     - Reintegro al cliente: \$100.000 en efectivo
     - Ítem transiciona de `vendido` a `en_revendedora` (DR-7)
   - Comisión liquidada: \$0
   - Comisión pendiente estimada: \$0 (ventas anuladas no aportan comisión)

5. **G1 — Gasto Operativo del Periodo M**
   - Gasto de negocio: \$5.000

---

## 3. Resultados Esperados (`rf_finanzas_resultados`)

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| `ventas_brutas` | **400.000** | V1 (100.000) + V2 (100.000) + V3 (100.000) + V4 (100.000) |
| `anulaciones` | **100.000** | V4 anulada en M |
| `devoluciones` | **0** | Sin devoluciones directas de clientes en M |
| **`ventas_netas`** | **300.000** | 400.000 − 100.000 − 0 (V1 + V2 + V3) |
| `costo_mercaderia` | **120.000** | Costo bruto (160.000) − costo V4 anulada (40.000) = 3 × 40.000 (V1, V2, V3) |
| **`ganancia_sobre_ventas`** | **180.000** | `ventas_netas` (300.000) − `costo_mercaderia` (120.000) |
| `costo_cobro` | **0** | Efectivo sin arancel |
| `incobrables` | **0** | Sin cuotas |
| `bajas_inventario` | **0** | Sin bajas |
| **`ganancia_despues_de_costos`** | **180.000** | 180.000 − 0 − 0 − 0 |
| `gastos` | **5.000** | Gasto G1 |
| **`comision_liquidada`** | **10.000** | Línea de V2 liquidada (\$10.000). V1=0, V3=0, V4=0 |
| **`comision_pendiente_estimada`** | **15.000** | Línea de V3 pendiente (\$15.000). Informativa (DR-2, no se resta de ganancia) |
| **`ganancia_final`** | **165.000** | `ganancia_despues_de_costos` (180.000) − `gastos` (5.000) − `comision_liquidada` (10.000) |
| `cantidad_ventas` | **3** | V1, V2, V3 registradas (V4 anulada no suma) |
| `ticket_promedio` | **100.000** | `ventas_netas` (300.000) / `cantidad_ventas` (3) = 100.000 |

---

## 4. Flujo de Caja Esperado (`rf_finanzas_flujo`)

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| `cobrado` | **400.000** | Pagos de V1, V2, V3, V4 (4 × 100.000) |
| `devuelto_clientes` | **100.000** | Reintegro por anulación de V4 |
| `costo_cobro` | **0** | Sin aranceles |
| **`neto_cobros`** | **300.000** | 400.000 − 100.000 |
| `compras_mercaderia` | **160.000** | 4 ítems de compra a 40.000 confirmados en M |
| `pagos_proveedores` | **0** | Sin rendiciones a proveedores pagadas |
| `gastos` | **5.000** | G1 |
| **`flujo_neto`** | **135.000** | `neto_cobros` (300.000) − `compras` (160.000) − `gastos` (5.000) |
| `por_acreditar` | **`{}`** | Sin cobros diferidos |

*Nota sobre `pago_revendedora`*: La tabla `pago_revendedora` se crea en el Slice 7a (Liquidación). En el Slice 6b no se inventa la tabla ni se agregan pagos de revendedoras.

---

## 5. Posición Financiera Esperada (`rf_finanzas_posicion`)

| Métrica | Esperado | Cálculo / Justificación |
|---|---|---|
| `capital_propio` | **40.000** | Ítem de V4 anulada, en estado `en_revendedora` (cuenta a su costo de ingreso: \$40.000) |
| `mercaderia_terceros` | **0** | Solo mercadería propia |
| `devueltos_clientes` | **0** | Sin devoluciones directas de clientes |
| `valor_venta_potencial` | **100.000** | Ítem de V4 anulada en `en_revendedora` a precio de catálogo (\$100.000) |
| `deuda_proveedores` | **0** | Sin compras a consignación |

---

## 6. Comportamiento con Módulo Deshabilitado

- Con `tenant_modulo.habilitado = false` para `'revendedoras'`:
  - `comision_liquidada` no se muestra en la UI (o se muestra en 0 / se oculta según la matriz `REQ-RV-MOD`).
  - La RPC devuelve `comision_liquidada = 0` y `comision_pendiente_estimada = 0` si no hay filas o si no aplica comisiones.
