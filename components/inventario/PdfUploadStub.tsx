'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'

/**
 * STUB para RF-01 (Planificacion.txt Etapa 3 §67):
 * "subida de PDF del proveedor → parseo → previsualización editable →
 * confirmación explícita".
 *
 * Por ahora solo capturamos la URL/nombre del archivo. El parseo real
 * (pdf-parse o pdfjs-dist) queda deferred; cuando se agregue, el flujo
 * será: upload al bucket → parse → preview editable de líneas → confirmar
 * (que dispara `addIngresoDetalleAction` por línea).
 *
 * Guarda `pdf_url` en `ingreso_mercaderia.pdf_url` como referencia.
 */
export function PdfUploadStub({
  onChange,
}: {
  onChange: (pdfUrl: string | null) => void
}) {
  const [fileName, setFileName] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) {
      setFileName(null)
      onChange(null)
      return
    }
    // Stub: no subimos a Storage todavía. Guardamos solo el nombre como
    // marca visible en el ingreso. En Etapa 3.5 esto será una URL real.
    setFileName(f.name)
    onChange(`stub://pending-upload/${encodeURIComponent(f.name)}`)
  }

  return (
    <div className="space-y-2">
      <Field
        htmlFor="pdf-file"
        label="PDF del remito/factura (opcional)"
        hint="Función completa (parseo automático) en próximo slice. Por ahora se guarda solo la referencia al archivo."
      >
        <Input
          id="pdf-file"
          type="file"
          accept="application/pdf"
          onChange={handleFile}
          className="cursor-pointer"
        />
      </Field>
      {fileName && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>📄</span>
          <span>{fileName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFileName(null)
              onChange(null)
            }}
          >
            Quitar
          </Button>
        </div>
      )}
    </div>
  )
}
