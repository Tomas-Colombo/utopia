'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { mensajeDeError } from '@/lib/errores/mensajes'
import { updateTenantLogoAction } from './actions'

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB

export function ConfiguracionLogoCard({
  logoActual,
  canEdit,
}: {
  logoActual: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [preview, setPreview] = useState<string | null>(logoActual)
  const [cambiado, setCambiado] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Archivo no válido', 'Elegí una imagen (PNG, JPG, WebP o SVG).')
      return
    }

    if (file.size > MAX_FILE_BYTES) {
      toast.error('Imagen demasiado pesada', mensajeDeError('logo-muy-grande'))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setPreview(result)
      setCambiado(result !== logoActual)
    }
    reader.readAsDataURL(file)
  }

  function handleGuardar() {
    if (!canEdit || !cambiado) return

    start(async () => {
      const res = await updateTenantLogoAction({ logoUrl: preview })
      if (!res.ok) {
        return toast.error('No se pudo guardar el logo', mensajeDeError(res.reason))
      }
      toast.success('Logo actualizado', 'El nuevo logo se aplicó a la barra superior.')
      setCambiado(false)
      router.refresh()
    })
  }

  function handleQuitar() {
    if (!canEdit) return

    start(async () => {
      const res = await updateTenantLogoAction({ logoUrl: null })
      if (!res.ok) {
        return toast.error('No se pudo quitar el logo', mensajeDeError(res.reason))
      }
      toast.success('Logo eliminado', 'Ahora se muestra el nombre comercial del negocio.')
      setPreview(null)
      setCambiado(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
    })
  }

  return (
    <Card as="section" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg">Logo del negocio</h3>
          <p className="mt-0.5 text-sm text-muted">
            Este logo se muestra en la parte superior de la barra de navegación lateral.
            Recomendamos una imagen con fondo transparente (PNG, SVG o WebP) de hasta 2 MB.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
        {/* Preview box con el mismo fondo que la barra lateral */}
        <div className="flex h-20 w-48 shrink-0 items-center justify-center rounded-lg border border-border bg-sidebar-bg p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Logo del negocio"
              className="max-h-14 max-w-full select-none object-contain"
            />
          ) : (
            <span className="text-xs text-muted text-center italic">
              Sin logo cargado<br />(muestra el nombre)
            </span>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFileChange}
              disabled={pending}
            />

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? 'Cambiar imagen' : 'Seleccionar imagen'}
            </Button>

            {cambiado && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={handleGuardar}
              >
                {pending ? 'Guardando…' : 'Guardar logo'}
              </Button>
            )}

            {logoActual && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={handleQuitar}
              >
                Quitar logo
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
