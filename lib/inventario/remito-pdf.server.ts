import 'server-only'
import { extractTextItems } from 'unpdf'
import { parseRemitoTextItems, type ParsedRemito, type TextItemLite } from './remito-pdf'

/**
 * Extrae las líneas de un remito PDF (en memoria; el archivo NO se guarda).
 * unpdf corre pdf.js en el runtime de Node sin worker → robusto con Turbopack.
 */
export async function extraerRemitoDesdePdf(bytes: Uint8Array): Promise<ParsedRemito> {
  const { items } = await extractTextItems(bytes)
  const pages: TextItemLite[][] = items.map((page) =>
    page.map((it) => ({
      str: it.str,
      x: it.x,
      y: it.y,
      width: it.width,
      height: it.height,
    })),
  )
  return parseRemitoTextItems(pages)
}
