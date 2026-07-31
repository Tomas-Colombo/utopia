'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'

/**
 * STUB: entrada manual de código QR + botón "Abrir cámara" deshabilitado
 * hasta que integremos una librería de escaneo (Etapa 3.5 o Etapa 5).
 *
 * El flujo real (anexo §5) requiere `getUserMedia()` + decodificador
 * (`@zxing/browser` o `html5-qrcode`). Por ahora navegamos a
 * `/inventario/ficha/{qr}` con el código tipeado.
 */
export function CameraScanStub() {
  const router = useRouter()
  const [qr, setQr] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = qr.trim()
    if (trimmed.length < 3) {
      setError('El código debe tener al menos 3 caracteres')
      return
    }
    setError(null)
    // Resolver único: intenta QR exacto y, si no, lo trata como SKU.
    router.push(`/inventario/buscar/${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dashed border-border bg-card-2 p-6 text-center">
        <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-card-3 flex items-center justify-center text-2xl">
          📷
        </div>
        <p className="text-sm text-muted">
          Cámara pendiente de integración
        </p>
        <Button variant="secondary" disabled className="mt-3">
          Abrir cámara
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field
          htmlFor="qr-manual"
          label="Ingresar código manualmente"
          hint="Código QR del ítem, o SKU del producto (ej: REM-0007 o REM-0007-M)"
          error={error ?? undefined}
        >
          <Input
            id="qr-manual"
            value={qr}
            onChange={(e) => setQr(e.target.value)}
            placeholder="QR o SKU (ej: REM-0007-M)"
            autoFocus
            invalid={!!error}
          />
        </Field>
        <Button type="submit">Buscar ítem</Button>
      </form>
    </div>
  )
}
