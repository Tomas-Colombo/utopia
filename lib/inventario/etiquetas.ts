import { ETIQUETAS_MAX } from './limites'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OrigenEtiquetasParsed =
  | {
      tipo: 'ingreso'
      idIngreso: string
      tanda: number
    }
  | {
      tipo: 'producto'
      idProducto: string
      talle: string | null
      incluirReservados: boolean
      tanda: number
    }
  | {
      tipo: 'qrs'
      pedidos: string[]
      recortado: boolean
      aBuscar: string[]
    }
  | {
      tipo: 'vacio'
    }
  | {
      tipo: 'invalido'
    }

export function parsearTanda(rawTanda?: string | null): number | null {
  if (!rawTanda || rawTanda.trim() === '') return 1
  const t = rawTanda.trim()
  if (!/^\d+$/.test(t)) return null
  const num = Number(t)
  if (!Number.isSafeInteger(num) || num < 1 || num > 1000) return null
  return num
}

export function parsearParamsEtiquetas(
  raw: {
    qrs?: string
    ingreso?: string
    producto?: string
    talle?: string
    incluir_reservados?: string
    tanda?: string
  } = {},
): OrigenEtiquetasParsed {
  const tieneIngreso = Boolean(raw.ingreso?.trim())
  const tieneProducto = Boolean(raw.producto?.trim())
  const tieneQrs = Boolean(raw.qrs && raw.qrs.trim())

  const origenesCount = (tieneIngreso ? 1 : 0) + (tieneProducto ? 1 : 0) + (tieneQrs ? 1 : 0)
  if (origenesCount > 1) {
    return { tipo: 'invalido' }
  }

  if (raw.ingreso !== undefined && !tieneIngreso) {
    return { tipo: 'invalido' }
  }
  if (raw.producto !== undefined && !tieneProducto) {
    return { tipo: 'invalido' }
  }

  if (tieneIngreso) {
    const idIngreso = raw.ingreso!.trim()
    if (!UUID_RE.test(idIngreso)) {
      return { tipo: 'invalido' }
    }
    const tanda = parsearTanda(raw.tanda)
    if (tanda === null) {
      return { tipo: 'invalido' }
    }
    return { tipo: 'ingreso', idIngreso, tanda }
  }

  if (tieneProducto) {
    const idProducto = raw.producto!.trim()
    if (!UUID_RE.test(idProducto)) {
      return { tipo: 'invalido' }
    }
    const tanda = parsearTanda(raw.tanda)
    if (tanda === null) {
      return { tipo: 'invalido' }
    }

    let talle: string | null = null
    if (raw.talle !== undefined) {
      const t = raw.talle.trim()
      if (t === '' || t.length > 40) {
        return { tipo: 'invalido' }
      }
      talle = t
    }

    const incluirReservados = raw.incluir_reservados === '1'
    return { tipo: 'producto', idProducto, talle, incluirReservados, tanda }
  }

  if (raw.qrs !== undefined) {
    const pedidos = [...new Set(raw.qrs.split(',').map((q) => q.trim()).filter(Boolean))]
    if (pedidos.length === 0) return { tipo: 'vacio' }
    const recortado = pedidos.length > ETIQUETAS_MAX
    const aBuscar = pedidos.slice(0, ETIQUETAS_MAX)
    return { tipo: 'qrs', pedidos, recortado, aBuscar }
  }

  return { tipo: 'vacio' }
}

export interface PaginacionTanda {
  tandaActual: number
  totalTandas: number
  desde: number
  hasta: number
  tieneAnterior: boolean
  tieneSiguiente: boolean
}

export function calcularPaginacionTanda(
  totalItems: number,
  tandaPedida: number,
  tamanoTanda = ETIQUETAS_MAX,
): PaginacionTanda {
  const totalTandas = Math.max(1, Math.ceil(totalItems / tamanoTanda))
  const tandaActual = Math.max(1, Math.min(tandaPedida, totalTandas))
  const desde = (tandaActual - 1) * tamanoTanda
  const hasta = desde + tamanoTanda - 1

  return {
    tandaActual,
    totalTandas,
    desde,
    hasta,
    tieneAnterior: tandaActual > 1,
    tieneSiguiente: tandaActual < totalTandas,
  }
}

export function buildEtiquetasIngresoHref(idIngreso: string, tanda = 1): string {
  const qs = new URLSearchParams({ ingreso: idIngreso })
  if (tanda > 1) qs.set('tanda', tanda.toString())
  return `/inventario/imprimir-etiquetas?${qs.toString()}`
}

export function buildEtiquetasProductoHref(opts: {
  idProducto: string
  talle?: string | null
  incluirReservados?: boolean
  tanda?: number
}): string {
  const qs = new URLSearchParams({ producto: opts.idProducto })
  if (opts.talle) qs.set('talle', opts.talle)
  if (opts.incluirReservados) qs.set('incluir_reservados', '1')
  if (opts.tanda && opts.tanda > 1) qs.set('tanda', opts.tanda.toString())
  return `/inventario/imprimir-etiquetas?${qs.toString()}`
}
