/**
 * Parser de remitos/facturas en PDF (tabla CANTIDAD / DETALLE / PRECIO / TOTAL).
 *
 * Diseño: función PURA que recibe los items de texto ya extraídos del PDF
 * (con su posición x/y) y reconstruye las filas de la tabla. No depende de
 * `unpdf` ni de nada de runtime → se testea con fixtures sintéticos.
 * La extracción real (PDF binario → items) vive en `remito-pdf.server.ts`.
 *
 * Estrategia:
 *  1. Agrupar items en líneas por proximidad de `y` (misma fila visual).
 *  2. Detectar la fila de encabezado (la que contiene CANTIDAD/DETALLE/PRECIO)
 *     y quedarse con el centro-x de cada columna.
 *  3. Para cada fila de datos, asignar cada item a la columna más cercana en x.
 *  4. Parsear cantidad (entero), detalle (texto) y precio (moneda es-AR).
 *
 * El TOTAL del PDF se ignora: el costo total se recalcula como cantidad × precio.
 */

export interface TextItemLite {
  str: string
  x: number
  y: number
  width: number
  height: number
}

export interface RemitoLineaParsed {
  nombre: string
  cantidad: number
  /** Precio unitario del PDF → se usa como costo_unitario del ingreso. */
  costoUnitario: number
}

export interface ParsedRemito {
  lineas: RemitoLineaParsed[]
  /** Líneas que no se pudieron interpretar (para mostrarlas al usuario). */
  advertencias: string[]
}

type ColKey = 'cantidad' | 'detalle' | 'precio' | 'total'

const HEADER_PATTERNS: { key: ColKey; re: RegExp }[] = [
  { key: 'cantidad', re: /cantidad|cant\b/i },
  { key: 'detalle', re: /detalle|producto|descrip|art[íi]culo/i },
  { key: 'precio', re: /precio|unitario|p\.?\s*unit/i },
  { key: 'total', re: /total|importe|subtotal/i },
]

/**
 * Parsea un monto en formato es-AR ("$ 33.900", "1.234,56", "10900").
 * - Con coma → coma es decimal y punto es separador de miles.
 * - Solo puntos → separador de miles (ARS sin decimales: "33.900" = 33900).
 */
export function parseMonedaAR(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim()
  if (!cleaned || cleaned === '-') return null
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function parseEntero(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

/** Agrupa items en líneas visuales por proximidad vertical (y). */
function agruparEnLineas(items: TextItemLite[]): TextItemLite[][] {
  const visibles = items.filter((it) => it.str.trim().length > 0)
  if (visibles.length === 0) return []

  const alturas = visibles.map((i) => i.height).filter((h) => h > 0).sort((a, b) => a - b)
  const medianH = alturas.length ? alturas[Math.floor(alturas.length / 2)] : 6
  const tol = Math.max(2, medianH * 0.6)

  // Orden por y descendente (arriba → abajo en coordenadas PDF), luego x.
  const sorted = [...visibles].sort((a, b) => b.y - a.y || a.x - b.x)

  const lineas: TextItemLite[][] = []
  let actual: TextItemLite[] = []
  let yRef = 0
  for (const it of sorted) {
    if (actual.length === 0) {
      actual = [it]
      yRef = it.y
    } else if (Math.abs(it.y - yRef) <= tol) {
      actual.push(it)
    } else {
      lineas.push(actual.sort((a, b) => a.x - b.x))
      actual = [it]
      yRef = it.y
    }
  }
  if (actual.length) lineas.push(actual.sort((a, b) => a.x - b.x))
  return lineas
}

function centrosDeHeader(linea: TextItemLite[]): Partial<Record<ColKey, number>> {
  const centros: Partial<Record<ColKey, number>> = {}
  for (const it of linea) {
    for (const { key, re } of HEADER_PATTERNS) {
      if (centros[key] === undefined && re.test(it.str)) {
        centros[key] = it.x + it.width / 2
      }
    }
  }
  return centros
}

export function parseRemitoTextItems(pages: TextItemLite[][]): ParsedRemito {
  const advertencias: string[] = []
  const lineas: RemitoLineaParsed[] = []

  const lineasPorPagina = pages.map((p) => agruparEnLineas(p))

  // Localizar el encabezado (primera línea con cantidad + detalle + precio).
  let centros: Partial<Record<ColKey, number>> | null = null
  let headerPagina = -1
  let headerIndice = -1
  buscar: for (let pi = 0; pi < lineasPorPagina.length; pi++) {
    const ls = lineasPorPagina[pi]
    for (let li = 0; li < ls.length; li++) {
      const c = centrosDeHeader(ls[li])
      if (c.cantidad !== undefined && c.detalle !== undefined && c.precio !== undefined) {
        centros = c
        headerPagina = pi
        headerIndice = li
        break buscar
      }
    }
  }

  if (!centros) {
    return {
      lineas: [],
      advertencias: [
        'No se reconoció la tabla del remito (no se encontró el encabezado CANTIDAD / DETALLE / PRECIO).',
      ],
    }
  }

  const colDefs = Object.entries(centros).filter(([, x]) => x !== undefined) as [ColKey, number][]
  const columnaDe = (x: number): ColKey => {
    let best: ColKey = colDefs[0][0]
    let bestDist = Infinity
    for (const [key, cx] of colDefs) {
      const d = Math.abs(x - cx)
      if (d < bestDist) {
        bestDist = d
        best = key
      }
    }
    return best
  }

  for (let pi = headerPagina; pi < lineasPorPagina.length; pi++) {
    const ls = lineasPorPagina[pi]
    const startLi = pi === headerPagina ? headerIndice + 1 : 0
    for (let li = startLi; li < ls.length; li++) {
      const linea = ls[li]
      const celdas: Record<ColKey, string> = { cantidad: '', detalle: '', precio: '', total: '' }
      for (const it of linea) {
        const col = columnaDe(it.x + it.width / 2)
        celdas[col] = `${celdas[col]} ${it.str}`.trim()
      }
      const rawLine = linea.map((i) => i.str).join(' ').trim()
      if (!rawLine) continue

      const cantidad = parseEntero(celdas.cantidad)
      const nombre = celdas.detalle.trim()
      const precio = parseMonedaAR(celdas.precio)

      if (cantidad !== null && cantidad > 0 && nombre && precio !== null) {
        lineas.push({ nombre, cantidad, costoUnitario: precio })
      } else {
        // Filas de total/footer (sin cantidad ni detalle) se ignoran en silencio.
        const pareceFooter = !nombre && cantidad === null
        if (!pareceFooter) advertencias.push(rawLine)
      }
    }
  }

  return { lineas, advertencias }
}
