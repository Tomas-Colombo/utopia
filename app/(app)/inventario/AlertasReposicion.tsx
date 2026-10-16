'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import type { AlertaReposicion } from '@/lib/types/reportes'

/**
 * Bloque "Reposición urgente" de la home de inventario.
 *
 * Es una franja de una sola fila con el primer producto: una alerta que ocupa
 * media pantalla empuja la tabla fuera de la vista. El resto vive detrás de
 * "+N más", que abre un modal con la lista completa.
 *
 * Un click en cualquier ítem (franja o modal) sigue filtrando la tabla de
 * productos por nombre — misma UX que tenía el bloque inline anterior.
 */
export function AlertasReposicion({ alertas }: { alertas: AlertaReposicion[] }) {
  const [modalOpen, setModalOpen] = useState(false)

  if (alertas.length === 0) return null

  const primera = alertas[0]
  const hayMas = alertas.length > 1

  return (
    <>
      <section
        role="alert"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[5px] bg-alerta-bg px-4 py-2.5 text-sm"
      >
        <span className="eyebrow text-alerta-ink">Reposición urgente</span>
        <span aria-hidden className="h-4 w-px bg-alerta-ink/30" />
        <span className="font-semibold">{primera.nombre}</span>
        <span className="font-mono text-xs text-alerta-ink">
          {primera.sku ? `${primera.sku} · ` : ''}
          {primera.disponibles} / {primera.stock_minimo}
          {primera.severidad === 'sin_stock' ? ' · sin stock' : ''}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {hayMas && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-[4px] px-2 py-1 text-xs font-medium text-alerta-ink hover:bg-card/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-alerta-ink"
            >
              +{alertas.length - 1} más
            </button>
          )}
          <Link
            href={`/inventario?q=${encodeURIComponent(primera.nombre)}`}
            className="rounded-[4px] bg-block px-3 py-1.5 text-[13px] font-semibold text-block-ink hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-alerta-ink"
          >
            Ver
          </Link>
        </span>
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
