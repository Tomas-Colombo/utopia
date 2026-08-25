import 'server-only'
import { createServerClient } from '@/lib/dal/supabase'
import { hoyISO } from '@/lib/utils/hoy'
import type {
  CuotaFinanciadaRow,
  CuotaListada,
  EstadoCuota,
  FiltroEstadoCuotas,
  MedioPago,
  OrdenCuotas,
  PerdidaIncobrable,
  ResultadoIncobrable,
} from '@/lib/types/ventas'

// Los enums de filtro y sus labels viven en `lib/types/ventas` y no acá: el
// panel es un componente CLIENTE y este módulo es `server-only`. Importarlos
// desde el DAL arrastraría el cliente de Supabase al bundle del navegador.
export type { FiltroEstadoCuotas, OrdenCuotas } from '@/lib/types/ventas'

/**
 * Cuotas financiadas por el comercio (00059).
 *
 * `cuota_financiada` es CUENTAS POR COBRAR; `pago_venta` sigue siendo CAJA.
 * Cobrar una cuota va por `sp_cobrar_cuota`, que genera el pago — nunca se
 * escribe `monto_pagado` a mano desde acá.
 */

export interface FiltroCuotas {
  estado?: FiltroEstadoCuotas
  /** Texto libre sobre el cliente (nombre, apellido, nombre completo). */
  search?: string
  orden?: OrdenCuotas
  /** `YYYY-MM-DD`. Recorta por fecha de vencimiento. */
  desde?: string
  hastaInclusivo?: string
}

/** Filas por request al recorrer el conjunto filtrado completo (KPIs). */
const CHUNK = 1000

const SELECT_LISTADO = `
  *,
  cliente:cliente!inner(id_cliente, nombre, apellido, nombre_completo, telefono),
  venta:venta(id_venta, fecha, total)
`

type CuotaCruda = CuotaFinanciadaRow & {
  cliente: CuotaListada['cliente']
  venta: CuotaListada['venta']
}

/**
 * El subconjunto del builder de PostgREST que usa el filtro. Se declara
 * explícito en vez de tomar el tipo entero porque las consultas de este
 * módulo difieren entre sí y no comparten un tipo nombrable.
 */
interface FiltrableCuotas<Self> {
  eq(columna: string, valor: unknown): Self
  in(columna: string, valores: readonly unknown[]): Self
  lt(columna: string, valor: unknown): Self
  gte(columna: string, valor: unknown): Self
  lte(columna: string, valor: unknown): Self
  or(filtros: string, opts?: { referencedTable?: string }): Self
}

/**
 * Aplica el recorte de estado y de fechas.
 *
 * `hoy` entra por parámetro y no se lee de `new Date()` acá adentro para que
 * "vencida" signifique lo mismo en el listado, en los KPIs y en la ficha del
 * cliente: dos llamadas a `now()` a caballo de la medianoche darían conjuntos
 * distintos y los totales no cerrarían contra las filas.
 */
function aplicarFiltro<T extends FiltrableCuotas<T>>(q: T, f: FiltroCuotas, hoy: string): T {
  let b = q

  switch (f.estado ?? 'con_deuda') {
    case 'todas':
      break
    case 'con_deuda':
      b = b.in('estado', ['pendiente', 'parcial'])
      break
    case 'vencidas':
      b = b.in('estado', ['pendiente', 'parcial']).lt('fecha_vencimiento', hoy)
      break
    case 'vence_este_mes':
      b = b
        .in('estado', ['pendiente', 'parcial'])
        .gte('fecha_vencimiento', inicioDeMes(hoy))
        .lte('fecha_vencimiento', finDeMes(hoy))
      break
    case 'parciales':
      b = b.eq('estado', 'parcial')
      break
    case 'pagadas':
      b = b.eq('estado', 'pagada')
      break
    case 'incobrables':
      b = b.eq('estado', 'incobrable')
      break
  }

  if (f.desde) b = b.gte('fecha_vencimiento', f.desde)
  if (f.hastaInclusivo) b = b.lte('fecha_vencimiento', f.hastaInclusivo)

  if (f.search && f.search.trim().length > 0) {
    const pat = `%${f.search.trim()}%`
    b = b.or(
      `nombre.ilike.${pat},apellido.ilike.${pat},nombre_completo.ilike.${pat}`,
      { referencedTable: 'cliente' },
    )
  }
  return b
}

function ordenCuotas(
  orden: OrdenCuotas,
): Array<{ columna: string; ascending: boolean; referencedTable?: string }> {
  switch (orden) {
    case 'vencimiento_desc':
      return [{ columna: 'fecha_vencimiento', ascending: false }]
    case 'apellido_asc':
      return [
        { columna: 'apellido', ascending: true, referencedTable: 'cliente' },
        { columna: 'fecha_vencimiento', ascending: true },
      ]
    case 'monto_desc':
      return [{ columna: 'monto', ascending: false }]
    default:
      return [{ columna: 'fecha_vencimiento', ascending: true }]
  }
}

export async function listCuotasPaginado(
  opts: FiltroCuotas & { page: number; pageSize: number; hoy: string },
): Promise<{ rows: CuotaListada[]; total: number }> {
  const supabase = await createServerClient()
  const from = (Math.max(1, opts.page) - 1) * opts.pageSize
  const to = from + opts.pageSize - 1

  let q = supabase.from('cuota_financiada').select(SELECT_LISTADO, { count: 'exact' })
  q = aplicarFiltro(q, opts, opts.hoy)
  for (const o of ordenCuotas(opts.orden ?? 'vencimiento_asc')) {
    q = q.order(o.columna, { ascending: o.ascending, referencedTable: o.referencedTable })
  }
  q = q.range(from, to)

  const { data, count, error } = await q
  if (error) throw new Error(`listCuotasPaginado: ${error.message}`)
  return {
    rows: ((data ?? []) as unknown as CuotaCruda[]),
    total: count ?? 0,
  }
}
/**
 * Estado de cuenta de un cliente. Acepta el MISMO filtro que el panel para
 * que "vencidas" signifique lo mismo en las dos pantallas: si divergieran,
 * el numero del panel no cerraria contra la ficha del cliente.
 */
export async function listCuotasPorCliente(
  idCliente: string,
  f: FiltroCuotas & { hoy: string } = { estado: 'todas', hoy: hoyISO() },
): Promise<CuotaListada[]> {
  const supabase = await createServerClient()
  let q = supabase
    .from('cuota_financiada')
    .select(SELECT_LISTADO)
    .eq('id_cliente', idCliente)
  q = aplicarFiltro(q, f, f.hoy)
  for (const o of ordenCuotas(f.orden ?? 'vencimiento_asc')) {
    q = q.order(o.columna, { ascending: o.ascending, referencedTable: o.referencedTable })
  }
  const { data, error } = await q
  if (error) throw new Error(`listCuotasPorCliente: ${error.message}`)
  return ((data ?? []) as unknown as CuotaCruda[])
}

/** Las cuotas de una venta, para el detalle. */
export async function listCuotasPorVenta(idVenta: string): Promise<CuotaFinanciadaRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('cuota_financiada')
    .select('*')
    .eq('id_venta', idVenta)
    .order('numero', { ascending: true })
  if (error) throw new Error(`listCuotasPorVenta: ${error.message}`)
  return (data ?? []) as CuotaFinanciadaRow[]
}

// ─── RPCs ────────────────────────────────────────────────────────────

/** Devuelve el id del `pago_venta` generado. */
export async function spCobrarCuota(input: {
  idCuota: string
  monto: number
  medio: MedioPago
  idCuentaDestino: string
  referencia?: string | null
}): Promise<string> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_cobrar_cuota', {
    p_id_cuota: input.idCuota,
    p_monto: input.monto,
    p_medio: input.medio,
    p_id_cuenta_destino: input.idCuentaDestino,
    p_referencia: input.referencia ?? null,
  })
  if (error) throw new Error(`sp_cobrar_cuota: ${error.message}`)
  return data as string
}

/**
 * Da por perdida la cuota Y todas las posteriores del mismo plan que sigan
 * abiertas, y registra UN gasto por el total impago.
 *
 * El arrastre lo hace el SP (00060), no este módulo: tiene que pasar dentro
 * de la misma transacción que el gasto, o una caída a mitad de camino dejaría
 * cuotas perdidas sin asiento — o al revés.
 */
export async function spMarcarCuotaIncobrable(
  idCuota: string,
  motivo: string,
): Promise<ResultadoIncobrable> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_marcar_cuota_incobrable', {
    p_id_cuota: idCuota,
    p_motivo: motivo,
  })
  if (error) throw new Error(`sp_marcar_cuota_incobrable: ${error.message}`)
  return data as unknown as ResultadoIncobrable
}

/**
 * Los dos números de la pérdida más el reparto por producto. El reparto es
 * una ATRIBUCIÓN proporcional al costo — ver el comentario del SP.
 */
export async function getPerdidaIncobrableVenta(
  idVenta: string,
): Promise<PerdidaIncobrable> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('sp_perdida_incobrable_venta', {
    p_id_venta: idVenta,
  })
  if (error) throw new Error(`sp_perdida_incobrable_venta: ${error.message}`)
  return data as unknown as PerdidaIncobrable
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** `2026-08-20` → `2026-08-01`. Trabaja sobre el string: sin husos de por medio. */
export function inicioDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/**
 * `2026-08-20` + 1 → `2026-08-21`. Suma en UTC y devuelve el ISO local del
 * calendario: la fecha de vencimiento es una FECHA, no un instante, y pasarla
 * por un huso la corre un dia en media Argentina.
 */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d + dias))
  return t.toISOString().slice(0, 10)
}

/** `2026-08-20` → `2026-08-31`. */
export function finDeMes(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${iso.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`
}

function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ─── Deudores: una fila por cliente ──────────────────────────────────

/** KPIs del conjunto filtrado completo, no de la página visible. */
export interface ResumenCuotas {
  aCobrar: number
  /** Vence HOY. No está vencido todavía, pero es lo que hay que llamar hoy. */
  venceHoy: number
  /** Vence mañana: el aviso que llega a tiempo para poder hacer algo. */
  venceManana: number
  venceEsteMes: number
  vencido: number
  incobrable: number
  clientesConDeuda: number
  /** Clientes con al menos una cuota vencida. */
  clientesVencidos: number
  filas: number
}

/**
 * Un cliente con deuda, con sus cuotas ya agregadas.
 *
 * El panel muestra CLIENTES, no cuotas: alguien que compro tres veces en
 * cuotas ocupaba dieciocho filas y no habia forma de ver cuanto debe en
 * total, que es la pregunta que se le hace a esa pantalla.
 */
export interface DeudorRow {
  id_cliente: string
  cliente: CuotaListada['cliente']
  /** Cuotas en `pendiente` o `parcial`. */
  pendientes: number
  vencidas: number
  adeudado: number
  vencido: number
  /** La proxima que vence sin estar vencida. `null` si todas vencieron. */
  proximo_vencimiento: string | null
  /**
   * La cuota vencida MAS VIEJA. `null` si no debe nada atrasado.
   *
   * Es el dato que decide la gestion: dos dias de atraso es un recordatorio,
   * noventa es una llamada de cobranza. Sin esto, "vencido $50.000" se lee
   * igual en los dos casos.
   */
  vencida_desde: string | null
  /** Ventas financiadas distintas: dos compras en cuotas son dos planes. */
  planes: number
}

/**
 * Deudores + KPIs en UNA sola pasada.
 *
 * PostgREST no agrupa, asi que se recorre el conjunto filtrado en chunks y se
 * agrega en TS — mismo criterio que `resumenVentasPeriodo`. Se devuelven las
 * dos cosas juntas porque salen del mismo recorrido: separarlas costaba dos
 * consultas para leer exactamente las mismas filas.
 *
 * La paginacion es sobre los CLIENTES ya agrupados, no sobre las cuotas: con
 * `range()` en la consulta, un cliente podria quedar partido entre paginas y
 * sus totales saldrian mal en las dos.
 */
export async function listDeudores(
  f: FiltroCuotas & { hoy: string },
): Promise<{ rows: DeudorRow[]; resumen: ResumenCuotas }> {
  const supabase = await createServerClient()
  type Fila = {
    id_cliente: string
    id_venta: string
    estado: EstadoCuota
    monto: number | string
    monto_pagado: number | string
    fecha_vencimiento: string
    cliente: CuotaListada['cliente']
  }

  const acc: Fila[] = []
  for (let offset = 0; ; offset += CHUNK) {
    let q = supabase
      .from('cuota_financiada')
      .select(
        `id_cliente, id_venta, estado, monto, monto_pagado, fecha_vencimiento,
         cliente:cliente!inner(id_cliente, nombre, apellido, nombre_completo, telefono)`,
      )
      .order('fecha_vencimiento', { ascending: true })
      .range(offset, offset + CHUNK - 1)
    q = aplicarFiltro(q, f, f.hoy)

    const { data, error } = await q
    if (error) throw new Error(`listDeudores: ${error.message}`)
    const chunk = (data ?? []) as unknown as Fila[]
    acc.push(...chunk)
    if (chunk.length < CHUNK) break
  }

  const inicio = inicioDeMes(f.hoy)
  const fin = finDeMes(f.hoy)
  const manana = sumarDias(f.hoy, 1)
  const porCliente = new Map<string, DeudorRow & { _planes: Set<string> }>()

  let aCobrar = 0
  let venceHoy = 0
  let venceManana = 0
  let venceEsteMes = 0
  let vencido = 0
  let incobrable = 0
  let clientesVencidos = 0

  for (const c of acc) {
    const saldo = Number(c.monto) - Number(c.monto_pagado)

    if (c.estado === 'incobrable') {
      incobrable += saldo
      continue
    }
    if (c.estado !== 'pendiente' && c.estado !== 'parcial') continue

    aCobrar += saldo
    // Vencer HOY no es estar vencida: el cliente tiene todo el dia para
    // pagar. Por eso hoy suma a su propio contador y no a `vencido` — meterla
    // ahi inflaria la mora con plata que todavia nadie debe.
    const estaVencida = c.fecha_vencimiento < f.hoy
    if (estaVencida) vencido += saldo
    else {
      if (c.fecha_vencimiento === f.hoy) venceHoy += saldo
      else if (c.fecha_vencimiento === manana) venceManana += saldo
      if (c.fecha_vencimiento >= inicio && c.fecha_vencimiento <= fin) {
        venceEsteMes += saldo
      }
    }

    let d = porCliente.get(c.id_cliente)
    if (!d) {
      d = {
        id_cliente: c.id_cliente,
        cliente: c.cliente,
        pendientes: 0,
        vencidas: 0,
        adeudado: 0,
        vencido: 0,
        proximo_vencimiento: null,
        vencida_desde: null,
        planes: 0,
        _planes: new Set<string>(),
      }
      porCliente.set(c.id_cliente, d)
    }
    d.pendientes++
    d.adeudado = redondear2(d.adeudado + saldo)
    d._planes.add(c.id_venta)
    if (estaVencida) {
      d.vencidas++
      d.vencido = redondear2(d.vencido + saldo)
      if (d.vencida_desde === null || c.fecha_vencimiento < d.vencida_desde) {
        d.vencida_desde = c.fecha_vencimiento
      }
    } else if (
      d.proximo_vencimiento === null ||
      c.fecha_vencimiento < d.proximo_vencimiento
    ) {
      d.proximo_vencimiento = c.fecha_vencimiento
    }
  }

  for (const d of porCliente.values()) if (d.vencidas > 0) clientesVencidos++

  const rows = [...porCliente.values()].map(({ _planes, ...d }) => ({
    ...d,
    planes: _planes.size,
  }))

  // Lo vencido primero, y dentro de eso lo que mas debe: es el orden en el
  // que hay que levantar el telefono.
  rows.sort((a, b) => {
    if (a.vencido !== b.vencido) return b.vencido - a.vencido
    return b.adeudado - a.adeudado
  })

  return {
    rows,
    resumen: {
      aCobrar: redondear2(aCobrar),
      venceHoy: redondear2(venceHoy),
      venceManana: redondear2(venceManana),
      venceEsteMes: redondear2(venceEsteMes),
      vencido: redondear2(vencido),
      incobrable: redondear2(incobrable),
      clientesConDeuda: porCliente.size,
      clientesVencidos,
      filas: acc.length,
    },
  }
}
