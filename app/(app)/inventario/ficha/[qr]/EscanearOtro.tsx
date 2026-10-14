'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { QrScanner } from '@/components/inventario/QrScanner'

/**
 * Escanear otro ítem sin volver al buscador: resuelve el código por
 * `/inventario/buscar/{codigo}`, igual que `BuscadorFicha`.
 */
export function EscanearOtro() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <Button variant="secondary" onClick={() => setAbierto(true)} className="w-full">
        Escanear otro ítem
      </Button>
    )
  }

  return (
    <QrScanner
      onDetected={(code) => {
        setAbierto(false)
        router.push(`/inventario/buscar/${encodeURIComponent(code)}`)
      }}
      onClose={() => setAbierto(false)}
    />
  )
}
