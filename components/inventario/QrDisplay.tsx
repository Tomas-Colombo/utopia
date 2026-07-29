'use client'

import { useMemo, useState } from 'react'

/**
 * Renderiza un QR a partir de un string usando la API pública de
 * `api.qrserver.com`. Es un stub simple: no requiere dependencias npm
 * y funciona offline SOLO si el navegador cachea la imagen previamente.
 *
 * Para producción con requisitos de privacidad (QR no debería salir a
 * un tercero), reemplazar por `qrcode` (npm) o `qr-code-styling` que
 * generan el SVG localmente. Deferred a Etapa 3.5 / 4.
 */
export function QrDisplay({
  value,
  size = 240,
  showText = true,
}: {
  value: string
  size?: number
  showText?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const url = useMemo(() => {
    const encoded = encodeURIComponent(value)
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`
  }, [value, size])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard puede no estar disponible en http/localhost sin permisos
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-md border border-border bg-white p-3"
        style={{ width: size + 24, height: size + 24 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`QR ${value}`}
          width={size}
          height={size}
          className="block"
        />
      </div>
      {showText && (
        <button
          type="button"
          onClick={handleCopy}
          className="font-mono text-xs text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink rounded px-2 py-1"
          aria-label="Copiar código"
        >
          {copied ? '¡Copiado!' : value}
        </button>
      )}
    </div>
  )
}
