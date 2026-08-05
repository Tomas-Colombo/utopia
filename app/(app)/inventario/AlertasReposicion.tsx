'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import type { AlertaReposicion } from '@/lib/types/reportes'

const VISIBLE_EN_TARJETA = 2

/**
 * Bloque "Reposición urgente" de la home de inventario.
 *
 * Mantiene la tarjeta rosa acotada: sólo se listan los primeros
 * {@link VISIBLE_EN_TARJETA} productos y el resto vive detrás de un botón
 * "Ver todos" que abre un modal con la lista completa. Así la tarjeta no
 * crece indefinidamente cuando aparecen decenas de productos bajo mínimo.
 *
 * Un click en cualquier ítem (tarjeta o modal) sigue filtrando la tabla
 * de productos por nombre — misma UX que tenía el bloque inline anterior.
 */
export function AlertasReposicion({ alertas }: { alertas: AlertaReposicion[] }) {
  const [modalOpen, setModalOpen] = useState(false)

  if (alertas.length === 0) return null

  const enTarjeta = alertas.slice(0, VISIBLE_EN_TARJETA)
  const hayMas = alertas.length > VISIBLE_EN_TARJETA

  return (
    <>
      <section className="rounded-lg border-2 border-alerta-ink bg-alerta-bg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg text-alerta-ink">
            ⚠ Reposición urgente
          </h3>
          <span className="text-sm font-mono text-alerta-ink">
            {alertas.length} producto{alertas.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {enTarjeta.map((a) => (
            <AlertaItem key={a.id_producto} alerta={a} />
          ))}
        </div>
        {hayMas && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium text-alerta-ink hover:bg-card/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-alerta-ink"
          >
            Ver todos ({alertas.length})
            <span aria-hidden>→</span>
          </button>
        )}
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Reposición urgente (${alertas.length})`}
        size="lg"
      >
        <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
          {alertas.map((a) => (
            <AlertaItem
              key={a.id_producto}
              alerta={a}
              onNavigate={() => setModalOpen(false)}
            />
          ))}
        </div>
      </Modal>
    </>
  )
}

function AlertaItem({
  alerta,
  onNavigate,
}: {
  alerta: AlertaReposicion
  onNavigate?: () => void
}) {
  return (
    <Link
      href={`/inventario?q=${encodeURIComponent(alerta.nombre)}`}
      onClick={onNavigate}
      className="flex items-center justify-between rounded-md bg-card px-3 py-2 hover:bg-card-2 text-sm"
    >
      <div className="min-w-0">
        <div className="font-medium truncate">{alerta.nombre}</div>
        {alerta.sku && <div className="text-xs font-mono text-muted">{alerta.sku}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="whitespace-nowrap font-mono text-xs">
          {alerta.disponibles}/{alerta.stock_minimo}
        </span>
        <Badge variant={alerta.severidad === 'sin_stock' ? 'danger' : 'warning'}>
          {alerta.severidad === 'sin_stock' ? 'Sin stock' : 'Bajo'}
        </Badge>
      </div>
    </Link>
  )
}
