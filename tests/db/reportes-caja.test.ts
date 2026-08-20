import { describe, expect, it } from 'vitest'
import { hasTestDb, unwrapFixture } from './_helpers'
import {
  cobrar,
  cuotasDe,
  venderContado,
  venderFinanciado,
  ventaFixture,
  type VentaFixture,
} from './_fixtures-ventas'

/**
 * Reportes de caja y deuda (00061).
 *
 * Las cuatro funciones `rf_*` son `stable` y leen con `auth_tenant_id()`, así
 * que se llaman con una SESIÓN REAL: con service_role el tenant es NULL y
 * todas devolverían cero, que es un resultado indistinguible de "no hay nada"
 * y haría pasar los tests por la razón equivocada.
 */

/** Un rango que cubre cualquier cosa creada durante el test. */
const AHORA = () => ({
  desde: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  hasta: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
})

/** Un rango del pasado: nada de lo que crea el test cae adentro. */
const PASADO = {
  desde: '2020-01-01T00:00:00Z',
  hasta: '2020-12-31T23:59:59Z',
}

async function caja(f: VentaFixture, rango: { desde: string; hasta: string }) {
  const { data, error } = await f.authenticated.rpc('rf_reporte_caja', {
    p_desde: rango.desde,
    p_hasta: rango.hasta,
  })
  expect(error, 'rf_reporte_caja').toBeNull()
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, string | number>
  return {
    cobrado_total: Number(r.cobrado_total),
    cobrado_contado: Number(r.cobrado_contado),
    cobrado_cuotas: Number(r.cobrado_cuotas),
    costo_cobro: Number(r.costo_cobro),
    neto_acreditado: Number(r.neto_acreditado),
    a_acreditar: Number(r.a_acreditar),
    cantidad_pagos: Number(r.cantidad_pagos),
  }
}

async function porCobrar(f: VentaFixture, hoy: string) {
  const { data, error } = await f.authenticated.rpc('rf_cuentas_por_cobrar', { p_hoy: hoy })
  expect(error, 'rf_cuentas_por_cobrar').toBeNull()
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, string | number>
  return {
    a_cobrar: Number(r.a_cobrar),
    vence_este_mes: Number(r.vence_este_mes),
    vencido: Number(r.vencido),
    cuotas_pendientes: Number(r.cuotas_pendientes),
    cuotas_vencidas: Number(r.cuotas_vencidas),
    clientes_con_deuda: Number(r.clientes_con_deuda),
    planes_activos: Number(r.planes_activos),
  }
}

async function incobrables(f: VentaFixture, rango: { desde: string; hasta: string }) {
  const { data, error } = await f.authenticated.rpc('rf_incobrables_periodo', {
    p_desde: rango.desde,
    p_hasta: rango.hasta,
  })
  expect(error, 'rf_incobrables_periodo').toBeNull()
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, string | number>
  return {
    monto_incobrable: Number(r.monto_incobrable),
    costo_no_cubierto: Number(r.costo_no_cubierto),
    cuotas_incobrables: Number(r.cuotas_incobrables),
    ventas_afectadas: Number(r.ventas_afectadas),
    clientes_afectados: Number(r.clientes_afectados),
  }
}

async function alertas(f: VentaFixture, hoy: string, limite = 20) {
  const { data, error } = await f.authenticated.rpc('rf_alertas_cuotas_vencidas', {
    p_hoy: hoy,
    p_limite: limite,
  })
  expect(error, 'rf_alertas_cuotas_vencidas').toBeNull()
  return ((data ?? []) as Record<string, string | number>[]).map((r) => ({
    id_cliente: String(r.id_cliente),
    cliente_nombre: String(r.cliente_nombre),
    cuotas_vencidas: Number(r.cuotas_vencidas),
    monto_vencido: Number(r.monto_vencido),
    dias_vencido: Number(r.dias_vencido),
  }))
}

describe.skipIf(!hasTestDb)('rf_reporte_caja — 00061', () => {
  it('cuenta la venta al contado como cobro del día, no como cuota', async () => {
    const f = await ventaFixture('caja-contado')
    const { error } = await venderContado(f)
    expect(error, 'sp_registrar_venta').toBeNull()

    const c = await caja(f, AHORA())
    expect(c.cobrado_total).toBeCloseTo(f.precio, 2)
    expect(c.cobrado_contado).toBeCloseTo(f.precio, 2)
    expect(c.cobrado_cuotas).toBe(0)
    expect(c.cantidad_pagos).toBe(1)
  })

  it('una venta financiada SIN anticipo no genera caja', async () => {
    // Es el punto de toda la separación devengado/percibido: se vendió, pero
    // no entró un peso. Si esto sumara, el panel de caja mentiría.
    const f = await ventaFixture('caja-sin-anticipo')
    const { error } = await venderFinanciado(f, {
      cuotas: 3,
      primerVencimiento: '2027-01-10',
    })
    expect(error).toBeNull()

    const c = await caja(f, AHORA())
    expect(c.cobrado_total).toBe(0)
    expect(c.cantidad_pagos).toBe(0)
  })

  it('el anticipo entra como contado y el cobro de una cuota como cuota', async () => {
    const f = await ventaFixture('caja-mixto')
    const anticipo = 20_000
    const { data: idVenta } = await venderFinanciado(f, {
      cuotas: 2,
      primerVencimiento: '2027-01-10',
      anticipo,
    })

    const cuotas = await cuotasDe(f, idVenta as string)
    await cobrar(f, cuotas[0].id_cuota_financiada, Number(cuotas[0].monto))

    const c = await caja(f, AHORA())
    expect(c.cobrado_contado).toBeCloseTo(anticipo, 2)
    expect(c.cobrado_cuotas).toBeCloseTo(Number(cuotas[0].monto), 2)
    expect(c.cobrado_total).toBeCloseTo(anticipo + Number(cuotas[0].monto), 2)
    expect(c.cantidad_pagos).toBe(2)
  })

  it('mide sobre la fecha del PAGO: fuera del rango no aparece nada', async () => {
    // La razón de ser de esta función. Una cuota cobrada hoy es caja de hoy
    // aunque la venta sea de hace meses.
    const f = await ventaFixture('caja-rango')
    await venderContado(f)

    expect((await caja(f, AHORA())).cobrado_total).toBeCloseTo(f.precio, 2)
    expect((await caja(f, PASADO)).cobrado_total).toBe(0)
  })

  it('EXCLUYE los pagos de una venta anulada', async () => {
    const f = await ventaFixture('caja-anulada', 2)
    const [itemA, itemB] = f.items

    await venderContado(f, { items: [itemA] })
    const { data: idVentaB } = await venderContado(f, { items: [itemB] })

    expect((await caja(f, AHORA())).cobrado_total).toBeCloseTo(f.precio * 2, 2)

    const { error } = await f.authenticated.rpc('sp_anular_venta', {
      p_id_venta: idVentaB as string,
      p_motivo: 'Error de carga',
    })
    expect(error, 'sp_anular_venta').toBeNull()

    // Queda sólo la venta que sigue viva.
    const c = await caja(f, AHORA())
    expect(c.cobrado_total).toBeCloseTo(f.precio, 2)
    expect(c.cantidad_pagos).toBe(1)
  })

  it('sin arancel el neto es igual al bruto y no hay nada por acreditar', async () => {
    const f = await ventaFixture('caja-sin-arancel')
    await venderContado(f)

    const c = await caja(f, AHORA())
    expect(c.costo_cobro).toBe(0)
    expect(c.neto_acreditado).toBeCloseTo(c.cobrado_total, 2)
    // Efectivo acredita el mismo día.
    expect(c.a_acreditar).toBe(0)
  })

  it('con arancel descuenta el costo y separa lo que todavía no acreditó', async () => {
    const f = await ventaFixture('caja-arancel')

    const banco = unwrapFixture(
      'cuenta banco',
      await f.serviceRole
        .from('cuenta_destino')
        .insert({ id_tenant: f.tenantId, nombre: 'Mercado Pago', tipo: 'billetera_virtual' })
        .select('id_cuenta_destino')
        .single(),
    ) as { id_cuenta_destino: string }

    unwrapFixture(
      'arancel insert',
      await f.serviceRole
        .from('arancel_cobro')
        .insert({
          id_tenant: f.tenantId,
          id_cuenta_destino: banco.id_cuenta_destino,
          medio: 'tarjeta_debito',
          arancel_pct: 10,
          iva_arancel_pct: 0,
          dias_acreditacion: 18,
        })
        .select('id_arancel_cobro')
        .single(),
    )

    const { error } = await f.authenticated.rpc('sp_registrar_venta', {
      p_lineas: f.items.map((id_item) => ({ id_item, descuentos: [] })),
      p_forma_pago: 'efectivo',
      p_id_cliente: f.idCliente,
      p_pagos: [
        {
          medio: 'tarjeta_debito',
          id_cuenta_destino: banco.id_cuenta_destino,
          monto: f.precio,
        },
      ],
    })
    expect(error, 'sp_registrar_venta').toBeNull()

    const c = await caja(f, AHORA())
    expect(c.cobrado_total).toBeCloseTo(f.precio, 2)
    expect(c.costo_cobro).toBeCloseTo(f.precio * 0.1, 2)
    expect(c.neto_acreditado).toBeCloseTo(f.precio * 0.9, 2)
    // 18 días de plazo: todavía no está en la cuenta.
    expect(c.a_acreditar).toBeCloseTo(f.precio * 0.9, 2)
  })
})

describe.skipIf(!hasTestDb)('rf_cuentas_por_cobrar — 00061', () => {
  it('suma el saldo de las cuotas abiertas y cuenta clientes y planes', async () => {
    const f = await ventaFixture('deuda-basica')
    await venderFinanciado(f, { cuotas: 4, primerVencimiento: '2027-06-10' })

    const r = await porCobrar(f, '2027-01-15')
    expect(r.a_cobrar).toBeCloseTo(f.precio, 2)
    expect(r.cuotas_pendientes).toBe(4)
    expect(r.clientes_con_deuda).toBe(1)
    expect(r.planes_activos).toBe(1)
  })

  it('de una cuota parcial cuenta el SALDO, no el monto entero', async () => {
    const f = await ventaFixture('deuda-parcial')
    const { data: idVenta } = await venderFinanciado(f, {
      cuotas: 2,
      primerVencimiento: '2027-06-10',
    })
    const cuotas = await cuotasDe(f, idVenta as string)
    await cobrar(f, cuotas[0].id_cuota_financiada, 10_000)

    const r = await porCobrar(f, '2027-01-15')
    expect(r.a_cobrar).toBeCloseTo(f.precio - 10_000, 2)
    // La parcial sigue abierta: todavía debe algo.
    expect(r.cuotas_pendientes).toBe(2)
  })

  it('vencido y vence_este_mes NO se solapan', async () => {
    // Si una cuota contara en los dos, el panel sumaría más de lo que existe.
    const f = await ventaFixture('deuda-solape')
    // Cuotas en enero, febrero y marzo de 2027.
    await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2027-01-10' })

    // Parada el 15/02: vencieron la del 10/01 y la del 10/02. La del 10/03 no.
    const r = await porCobrar(f, '2027-02-15')
    const cuota = f.precio / 3

    expect(r.vencido).toBeCloseTo(cuota * 2, 2)
    expect(r.cuotas_vencidas).toBe(2)
    // Ésta es la afirmación que importa: la del 10/02 cae en el mes en curso,
    // pero ya pasó. Cuenta como vencida y NO como "vence este mes" — si
    // contara en las dos, el panel sumaría más deuda de la que existe.
    expect(r.vence_este_mes).toBe(0)
    expect(r.a_cobrar).toBeCloseTo(f.precio, 2)
  })

  it('vence_este_mes toma lo que falta del mes en curso', async () => {
    const f = await ventaFixture('deuda-este-mes')
    await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2027-01-20' })

    // Parada el 5 de enero: la del 20/01 todavía no venció y cae en el mes.
    const r = await porCobrar(f, '2027-01-05')
    expect(r.vence_este_mes).toBeCloseTo(f.precio / 3, 2)
    expect(r.vencido).toBe(0)
  })

  it('EXCLUYE incobrables y anuladas del saldo a cobrar', async () => {
    const f = await ventaFixture('deuda-excluye', 2)
    const [itemA, itemB] = f.items

    const { data: ventaA } = await venderFinanciado(f, {
      cuotas: 2,
      primerVencimiento: '2027-01-10',
      items: [itemA],
    })
    const { data: ventaB } = await venderFinanciado(f, {
      cuotas: 2,
      primerVencimiento: '2027-01-10',
      items: [itemB],
    })

    expect((await porCobrar(f, '2027-01-05')).a_cobrar).toBeCloseTo(f.precio * 2, 2)

    // A: incobrable (arrastra las dos cuotas).
    const cuotasA = await cuotasDe(f, ventaA as string)
    await f.authenticated.rpc('sp_marcar_cuota_incobrable', {
      p_id_cuota: cuotasA[0].id_cuota_financiada,
      p_motivo: 'No responde',
    })
    // B: anulada.
    await f.authenticated.rpc('sp_anular_venta', {
      p_id_venta: ventaB as string,
      p_motivo: 'Error de carga',
    })

    const r = await porCobrar(f, '2027-01-05')
    expect(r.a_cobrar).toBe(0)
    expect(r.cuotas_pendientes).toBe(0)
    expect(r.clientes_con_deuda).toBe(0)
  })

  it('cuenta planes distintos cuando el cliente compró dos veces', async () => {
    const f = await ventaFixture('deuda-dos-planes', 2)
    const [itemA, itemB] = f.items
    await venderFinanciado(f, { cuotas: 2, primerVencimiento: '2027-01-10', items: [itemA] })
    await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2027-02-10', items: [itemB] })

    const r = await porCobrar(f, '2027-01-05')
    expect(r.planes_activos).toBe(2)
    // Una sola persona debe las dos compras.
    expect(r.clientes_con_deuda).toBe(1)
    expect(r.cuotas_pendientes).toBe(5)
  })
})

describe.skipIf(!hasTestDb)('rf_incobrables_periodo — 00061', () => {
  it('sin incobrables devuelve todo en cero', async () => {
    const f = await ventaFixture('inc-vacio')
    await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2027-01-10' })

    const r = await incobrables(f, AHORA())
    expect(r.monto_incobrable).toBe(0)
    expect(r.costo_no_cubierto).toBe(0)
    expect(r.cuotas_incobrables).toBe(0)
  })

  it('el costo NO cubierto es lo que falta para pagarle al proveedor', async () => {
    // Venta de 60.000 con costo 20.000, financiada en 6 sin anticipo. Nunca
    // pagó nada: el costo entero sale del bolsillo, porque al proveedor se le
    // paga igual.
    const f = await ventaFixture('inc-sin-cobrar')
    const { data: idVenta } = await venderFinanciado(f, {
      cuotas: 6,
      primerVencimiento: '2027-01-10',
    })
    const cuotas = await cuotasDe(f, idVenta as string)

    await f.authenticated.rpc('sp_marcar_cuota_incobrable', {
      p_id_cuota: cuotas[0].id_cuota_financiada,
      p_motivo: 'Se mudó',
    })

    const r = await incobrables(f, AHORA())
    expect(r.monto_incobrable).toBeCloseTo(f.precio, 2)
    expect(r.costo_no_cubierto).toBeCloseTo(f.costo, 2)
    expect(r.cuotas_incobrables).toBe(6)
    expect(r.ventas_afectadas).toBe(1)
    expect(r.clientes_afectados).toBe(1)
  })

  it('si lo cobrado ya superó el costo, el costo no cubierto es CERO', async () => {
    // Quien pagó 3 de 6 cuotas (30.000) ya cubrió los 20.000 de mercadería:
    // sólo se perdió margen, no plata del bolsillo. Un `greatest(0, ...)` mal
    // puesto acá daría un negativo que restaría pérdidas inexistentes.
    const f = await ventaFixture('inc-cubierto')
    const { data: idVenta } = await venderFinanciado(f, {
      cuotas: 6,
      primerVencimiento: '2027-01-10',
    })
    const cuotas = await cuotasDe(f, idVenta as string)

    for (const c of cuotas.slice(0, 3)) {
      await cobrar(f, c.id_cuota_financiada, Number(c.monto))
    }
    await f.authenticated.rpc('sp_marcar_cuota_incobrable', {
      p_id_cuota: cuotas[3].id_cuota_financiada,
      p_motivo: 'Dejó de pagar',
    })

    const r = await incobrables(f, AHORA())
    expect(r.monto_incobrable).toBeCloseTo(f.precio / 2, 2)
    expect(r.costo_no_cubierto).toBe(0)
  })

  it('cubre parcialmente: sólo se pone la diferencia', async () => {
    // Paga 1 de 6 (10.000) contra un costo de 20.000: faltan 10.000.
    const f = await ventaFixture('inc-parcialmente-cubierto')
    const { data: idVenta } = await venderFinanciado(f, {
      cuotas: 6,
      primerVencimiento: '2027-01-10',
    })
    const cuotas = await cuotasDe(f, idVenta as string)
    await cobrar(f, cuotas[0].id_cuota_financiada, Number(cuotas[0].monto))

    await f.authenticated.rpc('sp_marcar_cuota_incobrable', {
      p_id_cuota: cuotas[1].id_cuota_financiada,
      p_motivo: 'No contesta',
    })

    const r = await incobrables(f, AHORA())
    expect(r.costo_no_cubierto).toBeCloseTo(f.costo - f.precio / 6, 2)
  })

  it('recorta por período: fuera del rango no cuenta', async () => {
    const f = await ventaFixture('inc-rango')
    const { data: idVenta } = await venderFinanciado(f, {
      cuotas: 2,
      primerVencimiento: '2027-01-10',
    })
    const cuotas = await cuotasDe(f, idVenta as string)
    await f.authenticated.rpc('sp_marcar_cuota_incobrable', {
      p_id_cuota: cuotas[0].id_cuota_financiada,
      p_motivo: 'Perdido',
    })

    expect((await incobrables(f, AHORA())).cuotas_incobrables).toBe(2)
    expect((await incobrables(f, PASADO)).cuotas_incobrables).toBe(0)
    // El costo tampoco se arrastra a un período donde no hubo pérdidas.
    expect((await incobrables(f, PASADO)).costo_no_cubierto).toBe(0)
  })
})

describe.skipIf(!hasTestDb)('rf_alertas_cuotas_vencidas — 00061', () => {
  it('agrupa por CLIENTE, no por cuota', async () => {
    // A la persona se la llama una vez por todo lo que debe.
    const f = await ventaFixture('alerta-agrupa')
    await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2027-01-10' })

    const r = await alertas(f, '2027-06-01')
    expect(r).toHaveLength(1)
    expect(r[0].cuotas_vencidas).toBe(3)
    expect(r[0].monto_vencido).toBeCloseTo(f.precio, 2)
    expect(r[0].cliente_nombre).toBe('Ana Pérez')
  })

  it('cuenta los días desde el vencimiento MÁS VIEJO', async () => {
    const f = await ventaFixture('alerta-dias')
    await venderFinanciado(f, { cuotas: 2, primerVencimiento: '2027-01-10' })

    const r = await alertas(f, '2027-01-20')
    // 10/01 → 20/01. La segunda cuota (10/02) todavía no venció.
    expect(r[0].dias_vencido).toBe(10)
    expect(r[0].cuotas_vencidas).toBe(1)
  })

  it('NO incluye a quien no tiene nada vencido', async () => {
    const f = await ventaFixture('alerta-al-dia')
    await venderFinanciado(f, { cuotas: 3, primerVencimiento: '2027-06-10' })

    expect(await alertas(f, '2027-01-15')).toHaveLength(0)
  })

  it('ordena por monto adeudado, de mayor a menor', async () => {
    // Es el orden en el que conviene levantar el teléfono.
    const f = await ventaFixture('alerta-orden', 2)
    const [itemA, itemB] = f.items

    const chico = unwrapFixture(
      'cliente chico',
      await f.serviceRole
        .from('cliente')
        .insert({ id_tenant: f.tenantId, nombre: 'Beto', apellido: 'Sosa' })
        .select('id_cliente')
        .single(),
    ) as { id_cliente: string }

    // Ana debe la venta entera; Beto sólo un anticipo menos.
    await venderFinanciado(f, {
      cuotas: 1,
      primerVencimiento: '2027-01-10',
      items: [itemA],
    })
    await venderFinanciado(f, {
      cuotas: 1,
      primerVencimiento: '2027-01-10',
      anticipo: 50_000,
      idCliente: chico.id_cliente,
      items: [itemB],
    })

    const r = await alertas(f, '2027-02-01')
    expect(r).toHaveLength(2)
    expect(r[0].cliente_nombre).toBe('Ana Pérez')
    expect(r[0].monto_vencido).toBeGreaterThan(r[1].monto_vencido)
  })

  it('respeta el límite', async () => {
    const f = await ventaFixture('alerta-limite')
    await venderFinanciado(f, { cuotas: 2, primerVencimiento: '2027-01-10' })

    expect(await alertas(f, '2027-06-01', 1)).toHaveLength(1)
  })
})
