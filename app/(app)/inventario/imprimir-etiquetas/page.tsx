import { Topbar } from '@/components/shell/Topbar'
import { verifySession } from '@/lib/dal/session'
import { ETIQUETAS_MAX, listItemsParaEtiquetas } from '@/lib/dal/inventario/item'
import { ImprimirEtiquetasClient } from './ImprimirEtiquetasClient'

/**
 * Hoja de etiquetas para imprimir, armada desde los QR que llegan por
 * querystring (`?qrs=a,b,c`).
 *
 * El permiso lo resuelve `app/(app)/inventario/layout.tsx`, que exige
 * `inventario:ver` antes de renderizar cualquier página del módulo.
 */
export default async function ImprimirEtiquetasPage(props: {
  searchParams: Promise<{ qrs?: string }>
}) {
  const session = await verifySession()
  const { qrs } = await props.searchParams

  // `qrs` lo escribe quien quiera en la barra de direcciones, así que se
  // normaliza antes de tocar la base: se descartan los vacíos, se deduplica
  // (pedir dos veces el mismo QR imprimía la etiqueta dos veces) y se corta en
  // `ETIQUETAS_MAX`. Sin el tope, `?qrs=` con quinientos códigos mandaba
  // quinientas consultas en un solo request.
  const pedidos = [...new Set((qrs ?? '').split(',').map((q) => q.trim()).filter(Boolean))]
  const recortado = pedidos.length > ETIQUETAS_MAX
  const aBuscar = pedidos.slice(0, ETIQUETAS_MAX)

  if (aBuscar.length === 0) {
    return (
      <>
        <Topbar title="Imprimir etiquetas" session={session} backHref="/inventario" />
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center">
            <p className="font-display text-lg mb-2">No hay códigos para imprimir</p>
            <p className="text-sm text-muted">
              Entrá desde la ficha de un ítem y usá el botón de imprimir etiqueta.
            </p>
          </div>
        </main>
      </>
    )
  }

  const items = await listItemsParaEtiquetas(aBuscar)

  // Los QR que no resolvieron: no existen, o son de otro tenant y RLS los
  // oculta. Se informan en vez de desaparecer — una hoja a la que le faltan
  // tres etiquetas y no lo dice se imprime, se pega, y el error aparece en el
  // depósito.
  const encontrados = new Set(items.map((i) => i.qr_code))
  const noEncontrados = aBuscar.filter((qr) => !encontrados.has(qr))

  return (
    <>
      <Topbar title="Imprimir etiquetas" session={session} backHref="/inventario" />
      <ImprimirEtiquetasClient
        items={items}
        noEncontrados={noEncontrados}
        recortadoEn={recortado ? ETIQUETAS_MAX : null}
      />
    </>
  )
}
