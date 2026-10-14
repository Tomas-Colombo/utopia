# Escenario Dorado — Reportes y Finanzas

**Change**: `finanzas-panel`
**Applies to**: REQ-DB-18 (Fase 3)

Este documento es el contrato de aceptación. Las cifras esperadas fueron calculadas a mano. Si el resultado de los tests difiere, el error está en la implementación o en este documento; **MUST NOT ajustarse el test para que pase**.

## Fixtures

Usar `tests/db/_fixtures-ventas.ts` (`PRECIO=60_000`, `COSTO=20_000`).
Sesión: real `f.authenticated` (NO service-role).
Tiempo: todo en el mismo mes M.
Tarifario: Cuenta de efectivo **sin** tarifario (costo de cobro 0), salvo S5.

## Escenario A

- S1: venta contado de 1 ítem **compra** (60.000 / costo 20.000).
- S2: venta contado de 1 ítem **consignación** (60.000 / costo 20.000).
- S3: venta contado de 1 ítem compra (60.000 / 20.000), **anulada** en M.
- D1: devolución en M de la línea de S2 (reintegro 60.000 en efectivo).
- G1: gasto de 5.000 en M.
- Ingresos confirmados de mercadería: 2 ítems `compra` a 20.000 (S1 y S3) → compras 40.000.

| Métrica | Esperado | Cálculo |
|---|---|---|
| `ventas_brutas` | 180.000 | 60+60+60 |
| `anulaciones` | 60.000 | S3 |
| `devoluciones` | 60.000 | línea de S2 |
| **`ventas_netas`** | **60.000** | 180−60−60 |
| `costo_mercaderia` | 20.000 | 60 −20 (S3) −20 (S2) |
| **`ganancia_sobre_ventas`** | **40.000** | 60−20 |
| `costo_cobro`, `incobrables`, `bajas` | 0 | — |
| `gastos` | 5.000 | G1 |
| **`ganancia_final`** | **35.000** | 40−5 |
| `cobrado` | 180.000 | pagos de S1,S2,S3 |
| `devuelto_clientes` | 120.000 | S3 (anulación) + S2 (devolución) |
| **`neto_cobros`** | **60.000** | 180−120 |
| `compras_mercaderia` | 40.000 | 20+20 |
| **`flujo_neto`** | **15.000** | 60−40−0−5 |
| `capital_propio` | 20.000 | ítem de S3, vuelto a `disponible` |
| `devueltos_clientes` (stock) | 20.000 | ítem de S2 en `devuelto_cliente` |
| `deuda_proveedores` | 0 | la línea de S2 devuelta no se le debe al proveedor |

## Escenario B

= A + S5: venta de 1 ítem compra (60.000 / 20.000) pagada con tarjeta de crédito en 3 cuotas, arancel 3 % + IVA 21 % sobre el arancel (1.800 + 378 = **2.178**), sin retenciones; `neto_acreditado` 57.822. Compra de 20.000 adicionales.

| Métrica | Esperado |
|---|---|
| `ventas_netas` | 120.000 |
| `costo_mercaderia` | 40.000 |
| `ganancia_sobre_ventas` | 80.000 |
| `costo_cobro` | 2.178 |
| `ganancia_despues_de_costos` | 77.822 |
| `ganancia_final` (con gastos 5.000) | 72.822 |
| `cobrado` | 240.000 |
| `neto_cobros` | 117.822 (240−120−2.178) |
| `compras_mercaderia` | 60.000 |
| `flujo_neto` | 52.822 (117.822−60−5) |

## Casos de Borde (Obligatorios)

Cada uno debe tener su propio test en `tests/db/finanzas.test.ts`.

1. **Test**: `anulacion_mes_siguiente`
   Anulación en M+1 de una venta de M: M muestra la venta bruta completa; M+1 muestra la anulación y el reintegro.
2. **Test**: `venta_noche_fin_de_mes`
   Venta a las 23:30 (hora tenant) del último día del mes cae en ese mes, no en el siguiente.
3. **Test**: `periodo_sin_ventas`
   Período sin ventas: todo en 0, sin división por cero ni `null` inesperado.
4. **Test**: `venta_cuotas_propias`
   Venta con cuotas propias: `ventas_netas` cuenta el total; `cobrado` solo lo pagado; `incobrables` solo al marcar.
5. **Test**: `incobrable_no_suma_gastos`
   Marcar incobrable no genera `gasto_negocio`; el `gastos` del período no cambia.
6. **Test**: `producto_inactivo_ranking`
   Producto con venta y luego dado de baja (inactivo): sigue en el ranking.
7. **Test**: `tenant_sin_modulo_gastos`
   Tenant con módulo `gastos` deshabilitado pero con `gasto_negocio` cargados: el panel **no** los incluye (y la RPC sí los devuelve, siendo el DAL/UI quien los oculta).
