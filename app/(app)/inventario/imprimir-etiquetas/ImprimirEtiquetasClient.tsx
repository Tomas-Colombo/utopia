'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { generarQrDataUrl } from '@/components/inventario/QrDisplay'
import type { ItemParaEtiqueta } from '@/lib/dal/inventario/item'

const LADO_QR = 140

/**
 * CSS de impresión.
 *
 * Está anclado a `[data-hoja-etiquetas]` y NO a `.grid`, que es una utility de
 * Tailwind usada en cuarenta y cinco archivos: la regla es global al documento
 * mientras esta página está montada, así que apuntarla a una utility significa
 * que el día que alguien ponga un `grid` en el shell o en un modal, la
 * impresión se rompe sin que nadie sepa por qué.
 *
 * El `visibility: hidden` + `position: absolute` es el patrón conocido para
 * imprimir un subárbol que vive dentro de un shell: la hoja no es hija directa
 * de `body`, así que no se la puede aislar con `display: none` sobre sus
 * hermanos. Oculta todo, vuelve a mostrar la hoja, y la saca del offset que le
 * impone el sidebar.
 */
const CSS_IMPRESION = `
@media print {
  body * { visibility: hidden; }
  [data-hoja-etiquetas], [data-hoja-etiquetas] * { visibility: visible; }
  [data-hoja-etiquetas] { position: absolute; left: 0; top: 0; width: 100%; }
  @page { margin: 1cm; }
}
`

export function ImprimirEtiquetasClient({
  items,
  noEncontrados,
  recortadoEn,
}: {
  items: ItemParaEtiqueta[]
  /** QR pedidos que no resolvieron a ningún ítem. */
  noEncontrados: string[]
  /** Tope aplicado, si se pidieron más etiquetas de las permitidas. */
  recortadoEn: number | null
}) {
  // Los QR se generan todos acá, en un solo efecto, en vez de dejar que cada
  // etiqueta resuelva el suyo. El motivo no es la performance: es poder saber
  // CUÁNDO está lista la hoja. Con una generación por etiqueta nadie puede
  // responder eso, y apretar Ctrl+P antes de que resuelvan imprime una hoja de
  // cuadrados blancos.
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [fallaron, setFallaron] = useState<string[]>([])

  useEffect(() => {
    let cancelado = false
    Promise.all(
      items.map(async (item) => {
        try {
          return { qr: item.qr_code, url: await generarQrDataUrl(item.qr_code, LADO_QR) }
        } catch {
          return { qr: item.qr_code, url: null }
        }
      }),
    ).then((res) => {
      if (cancelado) return
      setUrls(Object.fromEntries(res.filter((r) => r.url).map((r) => [r.qr, r.url as string])))
      setFallaron(res.filter((r) => !r.url).map((r) => r.qr))
    })
    return () => {
      cancelado = true
    }
  }, [items])

  const resueltas = Object.keys(urls).length + fallaron.length
  const listo = resueltas === items.length
  const imprimibles = items.length - fallaron.length

  return (
    <main className="flex-1 bg-white p-6 text-black">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
          <h1 className="font-display text-xl text-text">Impresión de etiquetas</h1>
          <Button onClick={() => window.print()} disabled={!listo || imprimibles === 0}>
            {listo ? `Imprimir (${imprimibles})` : 'Generando códigos…'}
          </Button>
        </div>

        {/* Avisos. Van arriba y fuera de la hoja: el operador tiene que
            enterarse ANTES de mandar a imprimir, no descubrirlo en el papel. */}
        {recortadoEn !== null && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-border bg-card-2 px-3 py-2 text-sm text-text print:hidden"
          >
            Se pidieron más etiquetas de las que entran en una tanda. Se imprimen las primeras{' '}
            {recortadoEn}; el resto va en otra hoja.
          </p>
        )}
        {noEncontrados.length > 0 && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-border bg-card-2 px-3 py-2 text-sm text-text print:hidden"
          >
            {noEncontrados.length === 1
              ? 'Un código no corresponde a ningún ítem y queda sin etiqueta: '
              : `${noEncontrados.length} códigos no corresponden a ningún ítem y quedan sin etiqueta: `}
            <span className="font-mono text-xs">{noEncontrados.join(', ')}</span>
          </p>
        )}
        {fallaron.length > 0 && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-border bg-card-2 px-3 py-2 text-sm text-text print:hidden"
          >
            {fallaron.length === 1
              ? 'No se pudo generar un código, así que esa etiqueta no se imprime: '
              : `No se pudieron generar ${fallaron.length} códigos, así que esas etiquetas no se imprimen: `}
            <span className="font-mono text-xs">{fallaron.join(', ')}</span>
          </p>
        )}

        <div
          data-hoja-etiquetas
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 print:grid-cols-4 print:gap-2 print:p-0"
        >
          {items
            // Una etiqueta sin QR no sirve para nada: no se imprime en blanco,
            // se omite y se avisa arriba.
            .filter((item) => urls[item.qr_code])
            .map((item) => (
              <div
                key={item.qr_code}
                className="flex break-inside-avoid flex-col items-center border border-gray-300 p-2 text-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urls[item.qr_code]}
                  alt={`QR ${item.qr_code}`}
                  width={LADO_QR}
                  height={LADO_QR}
                  className="block"
                />
                <div className="mt-2 line-clamp-2 max-w-[140px] text-xs font-semibold leading-tight">
                  {item.nombre}
                </div>
                {item.sku && <div className="font-mono text-[10px] text-gray-500">{item.sku}</div>}
                {item.talle && (
                  <div className="mt-1 font-mono text-[10px] font-bold">Talle: {item.talle}</div>
                )}
                <div className="mt-1 font-mono text-[10px] text-black">{item.qr_code}</div>
              </div>
            ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: CSS_IMPRESION }} />
    </main>
  )
}
