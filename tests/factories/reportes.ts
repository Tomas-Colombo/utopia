/**
 * Factories de las filas de reportes (lib/types/reportes.ts).
 *
 * Cada una devuelve una fila completa y coherente; el test pisa con
 * `overrides` solo los campos sobre los que afirma algo, así queda a la vista
 * qué dato importa. Cuando la fila cambia de forma, TypeScript rompe acá y no
 * en cada objeto armado a mano.
 */

import type {
  CuentasPorCobrar,
  CumplimientoObjetivosRow,
  FinanzasFlujoRow,
  FinanzasPosicion,
  FinanzasPresupuestoRow,
  FinanzasRankingRow,
  FinanzasResultadosRow,
  FinanzasSerieMensualRow,
  PerfilRevendedoraRow,
  ResumenCanalRow,
} from '@/lib/types/reportes'

export function crearFinanzasResultados(overrides: Partial<FinanzasResultadosRow> = {}): FinanzasResultadosRow {
  return {
    mes: '2026-10-01',
    ventas_brutas: 1000,
    anulaciones: 0,
    ventas_netas: 1000,
    costo_mercaderia: 400,
    ganancia_sobre_ventas: 600,
    gastos: 200,
    comision_liquidada: 0,
    comision_pendiente_estimada: 0,
    ganancia_final: 400,
    porcentaje_ganancia: 0.4,
    cantidad_ventas: 10,
    ticket_promedio: 100,
    ...overrides,
  }
}

export function crearFinanzasFlujo(overrides: Partial<FinanzasFlujoRow> = {}): FinanzasFlujoRow {
  return {
    mes: '2026-10-01',
    cobrado: 1000,
    devuelto_clientes: 0,
    costo_procesamiento: 50,
    neto_cobros: 950,
    compras_mercaderia: 300,
    pagos_proveedores: 100,
    gastos: 200,
    flujo_neto: 350,
    por_acreditar: null,
    ...overrides,
  }
}

export function crearFinanzasSerieMensual(overrides: Partial<FinanzasSerieMensualRow> = {}): FinanzasSerieMensualRow {
  return {
    mes: '2026-10-01',
    ventas_netas: 100,
    ganancia_sobre_ventas: 50,
    ganancia_final: 20,
    cobrado_neto: 80,
    ...overrides,
  }
}

export function crearCuentasPorCobrar(overrides: Partial<CuentasPorCobrar> = {}): CuentasPorCobrar {
  return {
    a_cobrar: 1500,
    vence_este_mes: 500,
    vencido: 1000,
    cuotas_pendientes: 5,
    cuotas_vencidas: 3,
    clientes_con_deuda: 2,
    planes_activos: 2,
    ...overrides,
  }
}

export function crearFinanzasPosicion(overrides: Partial<FinanzasPosicion> = {}): FinanzasPosicion {
  return {
    capital_propio: 1000,
    mercaderia_terceros: 0,
    devueltos_clientes: 0,
    valor_venta_potencial: 2000,
    productos_sin_precio: 0,
    por_cobrar: crearCuentasPorCobrar(),
    deuda_proveedores: 0,
    ...overrides,
  }
}

export function crearFinanzasRanking(overrides: Partial<FinanzasRankingRow> = {}): FinanzasRankingRow {
  return {
    id_producto: 'prod-1',
    nombre: 'Remera',
    unidades_vendidas: 10,
    monto_vendido: 1000,
    ganancia: 500,
    porcentaje_ventas: null,
    ...overrides,
  }
}

export function crearFinanzasPresupuesto(overrides: Partial<FinanzasPresupuestoRow> = {}): FinanzasPresupuestoRow {
  return {
    id_categoria_gasto: 'cat-1',
    nombre: 'Alquiler',
    gastado: 500,
    presupuesto_mensual: 1000,
    consumido_pct: 0.5,
    ...overrides,
  }
}

export function crearResumenCanal(overrides: Partial<ResumenCanalRow> = {}): ResumenCanalRow {
  return {
    ventas_local_monto: 30000,
    ventas_local_cant: 3,
    ventas_revendedora_monto: 50000,
    ventas_revendedora_cant: 5,
    comision_revendedora_monto: 5000,
    stock_central_cant: 20,
    stock_central_valor: 100000,
    stock_revendedoras_cant: 12,
    stock_revendedoras_valor: 30000,
    ...overrides,
  }
}

export function crearPerfilRevendedora(overrides: Partial<PerfilRevendedoraRow> = {}): PerfilRevendedoraRow {
  return {
    id_revendedora: 'rev-1',
    nombre: 'Lucía',
    apellido: 'Gómez',
    telefono: '11223344',
    email: 'lucia@example.com',
    estado: 'activo',
    piezas_en_poder: 6,
    valor_en_poder: 15000,
    total_vendido: 25000,
    comision_liquidada: 2500,
    comision_estimada: 1250,
    adeudado: 0,
    cantidad_ventas: 5,
    ticket_promedio: 5000,
    piezas_entregadas_historico: 10,
    rotacion_pct: 62.5,
    ...overrides,
  }
}

export function crearCumplimientoObjetivos(
  overrides: Partial<CumplimientoObjetivosRow> = {},
): CumplimientoObjetivosRow {
  return {
    id_revendedora: 'rev-1',
    nombre: 'Lucía',
    apellido: 'Gómez',
    vendido_periodo: 25000,
    id_regla: 'regla-1',
    tramo_actual_desde: 0,
    porcentaje_actual: 10,
    proximo_tramo_desde: 30000,
    proximo_porcentaje: 15,
    falta_para_proximo: 5000,
    ...overrides,
  }
}
