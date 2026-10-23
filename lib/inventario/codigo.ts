/**
 * Interpretación de lo que el operador escanea o tipea en un buscador de ítem.
 *
 * Un código puede ser tres cosas: el QR de una unidad física (24 hex, generado
 * por la base), el SKU de un producto (`PREFIJO-####`, ver `sp_gen_sku`) con
 * un talle opcional pegado (`REM-0007-M`), o texto libre. Antes cada buscador
 * tenía su propia regex de SKU y no coincidían: la de revendedoras aceptaba
 * guiones dentro del SKU, así que `REM-0007-M` nunca separaba el talle.
 */

export interface SkuParseado {
  /** SKU del producto, en mayúsculas (así lo guarda `sp_gen_sku`). */
  baseSku: string
  /** Talle pegado al SKU, o `null` si no vino. */
  talle: string | null
}

const SKU_CON_TALLE = /^([A-Z]+-\d+)(?:-(.+))?$/

/**
 * Separa `REM-0007-M` en `{ baseSku: 'REM-0007', talle: 'M' }`. Un texto que
 * no tiene forma de SKU autogenerado se devuelve entero como `baseSku`: los
 * SKU cargados a mano no siguen el patrón y igual tienen que encontrarse.
 */
export function parsearSku(codigo: string): SkuParseado {
  const upper = codigo.trim().toUpperCase()
  const m = upper.match(SKU_CON_TALLE)
  return { baseSku: m?.[1] ?? upper, talle: m?.[2] ?? null }
}

/**
 * Escapa los comodines de LIKE para buscar el texto tal cual. Sin esto, un
 * `%` o un `_` tipeado matchea cualquier cosa.
 */
export function escaparPatronLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export type DecisionLookupPorTalle =
  | { modo: 'desambiguar' }
  | {
      modo: 'filtrar'
      /**
       * `string` = filtrar por ese talle exacto;
       * `null` = filtrar por `talle IS NULL` (unidades sin talle explícitamente pedidas);
       * `undefined` = no filtrar por talle (categoría sin talles y sin talle explícito).
       */
      filtroTalle: string | null | undefined
    }

/**
 * Decide si la búsqueda de un producto requiere desambiguación de talle
 * (`elegir-talle`) o si puede ir directo a buscar la primera unidad FIFO.
 *
 * - Si el operador indicó un talle explícito (ej. `REM-0007-M` o `?talle=M`),
 *   filtra por ese talle.
 * - Si pidió explícitamente unidades sin talle (`?sin_talle=1`), filtra por
 *   `talle IS NULL` (`filtroTalle: null`).
 * - Si la categoría maneja talles (`tallesCategoria.length > 0`), pide
 *   desambiguar (`modo: 'desambiguar'`).
 * - Si la categoría no maneja talles, busca cualquier unidad disponible sin
 *   filtrar por talle (`filtroTalle: undefined`).
 */
export function decidirLookupPorTalle(params: {
  tallesCategoria: string[]
  talleExplicito?: string | null
  sinTalleExplicito?: boolean
}): DecisionLookupPorTalle {
  const talle = params.talleExplicito?.trim() || null
  if (talle) {
    return { modo: 'filtrar', filtroTalle: talle }
  }
  if (params.sinTalleExplicito) {
    return { modo: 'filtrar', filtroTalle: null }
  }
  if (params.tallesCategoria.length > 0) {
    return { modo: 'desambiguar' }
  }
  return { modo: 'filtrar', filtroTalle: undefined }
}

export interface RespuestaElegirTalle {
  ok: false
  reason: 'elegir-talle'
  id_producto: string
  producto_nombre: string
  talles: Array<{ talle: string; disponibles: number; reservados: number }>
  sin_talle: number
  sin_talle_reservados: number
  id_reserva: string | null
}

export type ResultadoArmarElegirTalle =
  | RespuestaElegirTalle
  | {
      ok: false
      reason: 'sku-sin-stock' | 'sku-sin-stock-libre'
      id_producto: string
      id_reserva: string | null
    }

/**
 * Construye el payload `elegir-talle` con los conteos de stock libre y
 * reservado por talle (ordenados primero según la categoría y luego los talles
 * extra alfabéticamente) más el conteo de unidades sin talle.
 *
 * Acepta el stock ya agrupado (`porTalle`, como devuelve `sp_stock_por_talle`)
 * o las listas de ítems `libres`/`reservados` en memoria.
 *
 * Si no hay ninguna unidad libre ni reservada devuelve `sku-sin-stock` (o
 * `sku-sin-stock-libre` cuando había unidades en estado disponible pero todas
 * bloqueadas por motivos no adoptables).
 */
export function armarRespuestaElegirTalle(params: {
  idProducto: string
  productoNombre: string
  tallesCategoria: string[]
  porTalle?: ReadonlyArray<{ talle: string | null; disponibles: number; reservados?: number }>
  libres?: ReadonlyArray<{ talle: string | null }>
  reservados?: ReadonlyArray<{ talle: string | null; idReserva: string }>
  reservasBloqueantes?: readonly string[]
  totalDisponible?: number
}): ResultadoArmarElegirTalle {
  const { idProducto, productoNombre, tallesCategoria } = params

  const disponiblesMap = new Map<string, number>()
  const reservadosMap = new Map<string, number>()
  let sinTalle = 0
  let sinTalleReservados = 0
  const reservasSet = new Set<string>(params.reservasBloqueantes ?? [])

  if (params.porTalle) {
    for (const fila of params.porTalle) {
      const disp = fila.disponibles ?? 0
      const res = fila.reservados ?? 0
      if (fila.talle === null) {
        sinTalle += disp
        sinTalleReservados += res
      } else if (disp > 0 || res > 0) {
        disponiblesMap.set(fila.talle, (disponiblesMap.get(fila.talle) ?? 0) + disp)
        reservadosMap.set(fila.talle, (reservadosMap.get(fila.talle) ?? 0) + res)
      }
    }
  } else {
    for (const it of params.libres ?? []) {
      const t = it.talle?.trim() || null
      if (t) {
        disponiblesMap.set(t, (disponiblesMap.get(t) ?? 0) + 1)
      } else {
        sinTalle += 1
      }
    }
    for (const it of params.reservados ?? []) {
      reservasSet.add(it.idReserva)
      const t = it.talle?.trim() || null
      if (t) {
        reservadosMap.set(t, (reservadosMap.get(t) ?? 0) + 1)
      } else {
        sinTalleReservados += 1
      }
    }
  }

  const tallesConStock = new Set<string>([...disponiblesMap.keys(), ...reservadosMap.keys()])
  const totalUnidades =
    [...tallesConStock].reduce(
      (acc, t) => acc + (disponiblesMap.get(t) ?? 0) + (reservadosMap.get(t) ?? 0),
      0,
    ) +
    sinTalle +
    sinTalleReservados

  const totalDisponible = params.totalDisponible ?? totalUnidades
  const reservasArr = [...reservasSet]

  if (tallesConStock.size === 0 && sinTalle === 0 && sinTalleReservados === 0) {
    return {
      ok: false,
      reason: totalDisponible > 0 ? 'sku-sin-stock-libre' : 'sku-sin-stock',
      id_producto: idProducto,
      id_reserva: reservasArr[0] ?? null,
    }
  }

  const rank = (t: string) => {
    const i = tallesCategoria.findIndex((x) => x.toUpperCase() === t.toUpperCase())
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }

  const tallesOrdenados = [...tallesConStock]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((t) => ({
      talle: t,
      disponibles: disponiblesMap.get(t) ?? 0,
      reservados: reservadosMap.get(t) ?? 0,
    }))

  return {
    ok: false,
    reason: 'elegir-talle',
    id_producto: idProducto,
    producto_nombre: productoNombre,
    talles: tallesOrdenados,
    sin_talle: sinTalle,
    sin_talle_reservados: sinTalleReservados,
    id_reserva: reservasArr.length === 1 ? reservasArr[0]! : null,
  }
}
