'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { mensajeDeError } from '@/lib/errores/mensajes'
import type { ReglaComisionConEscalas, ResolucionComision } from '@/lib/types/comisiones'
import {
  guardarComisionPropiaAction,
  terminarReglaAction,
} from '@/app/(app)/revendedoras/comisiones/actions'
import { Card } from '@/components/ui/Card'

interface ComisionPropiaCardProps {
  idRevendedora: string
  resolucion: ResolucionComision
  reglaPropia: ReglaComisionConEscalas | null
  reglaGeneral: ReglaComisionConEscalas | null
  canEdit: boolean
}

export function ComisionPropiaCard({
  idRevendedora,
  resolucion,
  reglaPropia,
  reglaGeneral,
  canEdit,
}: ComisionPropiaCardProps) {
  const router = useRouter()
  const [modalAbierto, setModalAbierto] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const hoy = new Date().toISOString().split('T')[0]

  // Formulario de comisión propia
  const [tipo, setTipo] = useState<'fijo' | 'escala'>('fijo')
  const [porcentajeFijo, setPorcentajeFijo] = useState(12)
  const [vigenteDesde, setVigenteDesde] = useState(hoy)
  const [vigenteHasta, setVigenteHasta] = useState('')
  const [tramos, setTramos] = useState<Array<{ objetivo_desde: number; porcentaje: number }>>([
    { objetivo_desde: 0, porcentaje: 10 },
    { objetivo_desde: 50000, porcentaje: 15 },
  ])

  const tienePropiaVigente =
    reglaPropia && (!reglaPropia.vigente_hasta || reglaPropia.vigente_hasta >= hoy)

  const handleAgregarTramo = () => {
    const ultimo = tramos[tramos.length - 1]?.objetivo_desde ?? 0
    setTramos([...tramos, { objetivo_desde: ultimo + 50000, porcentaje: 18 }])
  }

  const handleQuitarTramo = (idx: number) => {
    if (tramos.length <= 1) return
    setTramos(tramos.filter((_, i) => i !== idx))
  }

  const handleUpdateTramo = (idx: number, campo: 'objetivo_desde' | 'porcentaje', valor: number) => {
    const nuevos = [...tramos]
    nuevos[idx] = { ...nuevos[idx], [campo]: valor }
    setTramos(nuevos)
  }

  const handleGuardarPropia = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSubmitting(true)

    try {
      const res = await guardarComisionPropiaAction({
        id_revendedora: idRevendedora,
        tipo,
        porcentajeFijo: tipo === 'fijo' ? Number(porcentajeFijo) : undefined,
        escalas:
          tipo === 'escala'
            ? tramos.map((t) => ({
                objetivo_desde: Number(t.objetivo_desde),
                porcentaje: Number(t.porcentaje),
              }))
            : undefined,
        vigente_desde: vigenteDesde,
        vigente_hasta: vigenteHasta ? vigenteHasta : null,
      })

      if (!res.ok) {
        setErrorMsg(mensajeDeError(res.reason))
        setSubmitting(false)
        return
      }

      setModalAbierto(false)
      router.refresh()
    } catch {
      setErrorMsg('Ocurrió un error inesperado al guardar la comisión propia.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEliminarPropia = async () => {
    if (!reglaPropia) return
    if (!confirm('¿Querés finalizar la comisión propia y volver a la regla general del local?')) {
      return
    }

    const res = await terminarReglaAction({
      id_regla: reglaPropia.id_regla,
      vigente_hasta: hoy,
    })

    if (!res.ok) {
      alert(mensajeDeError(res.reason))
      return
    }

    router.refresh()
  }

  return (
    <Card padding="none" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Comisión aplicable</h3>
          <p className="text-xs text-muted-foreground">
            Esquema vigente que determina el porcentaje por ventas en el período.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {resolucion.origen === 'propia' ? (
            <Badge variant="info">Comisión propia</Badge>
          ) : resolucion.origen === 'general' ? (
            <Badge variant="neutral">Regla general del local</Badge>
          ) : (
            <Badge variant="neutral">Sin regla</Badge>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-foreground">Porcentaje base / tramos:</span>
          <span className="text-xl font-bold text-ink">
            {resolucion.origen === 'ninguna'
              ? '0%'
              : resolucion.origen === 'propia' && reglaPropia?.escalas.length === 1 && reglaPropia.escalas[0].objetivo_desde === 0
              ? `${reglaPropia.escalas[0].porcentaje}% (fijo)`
              : `${resolucion.porcentaje}%`}
          </span>
        </div>

        {/* Detalle de tramos que rigen */}
        {resolucion.origen === 'propia' && reglaPropia && (
          <div className="text-xs space-y-1 border-t border-border/60 pt-2 text-muted-foreground">
            <div className="font-medium text-foreground">Escala propia ({reglaPropia.nombre}):</div>
            {reglaPropia.escalas.map((e) => (
              <div key={e.id_escala}>
                • Desde ${e.objetivo_desde.toLocaleString('es-AR')}:{' '}
                <span className="font-semibold text-foreground">{e.porcentaje}%</span>
              </div>
            ))}
          </div>
        )}

        {resolucion.origen === 'general' && reglaGeneral && (
          <div className="text-xs space-y-1 border-t border-border/60 pt-2 text-muted-foreground">
            <div className="font-medium text-foreground">
              Rige la regla general ({reglaGeneral.nombre}):
            </div>
            {reglaGeneral.escalas.map((e) => (
              <div key={e.id_escala}>
                • Desde ${e.objetivo_desde.toLocaleString('es-AR')}:{' '}
                <span className="font-semibold text-foreground">{e.porcentaje}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center justify-end gap-2 pt-2">
          {tienePropiaVigente && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleEliminarPropia}
            >
              Volver a regla general
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => setModalAbierto(true)}
          >
            {tienePropiaVigente ? 'Modificar comisión propia' : 'Asignar comisión propia'}
          </Button>
        </div>
      )}

      {modalAbierto && (
        <Modal
          open={modalAbierto}
          title={
            tienePropiaVigente
              ? 'Modificar comisión propia'
              : 'Asignar comisión propia'
          }
          onClose={() => setModalAbierto(false)}
        >
          <form onSubmit={handleGuardarPropia} className="space-y-4">
            {errorMsg && (
              <div className="rounded-md border border-error/20 bg-error/10 p-3 text-xs text-error">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Modalidad</label>
              <Select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'fijo' | 'escala')}
              >
                <option value="fijo">Porcentaje fijo (ej: 12%)</option>
                <option value="escala">Escala por tramos de venta</option>
              </Select>
            </div>

            {tipo === 'fijo' ? (
              <div>
                <label className="text-sm font-medium">Porcentaje de comisión (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={porcentajeFijo}
                  onChange={(e) => setPorcentajeFijo(Number(e.target.value))}
                  required
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Tramos de escala</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleAgregarTramo}
                  >
                    + Tramo
                  </Button>
                </div>
                {tramos.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Desde ($)</label>
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        value={t.objetivo_desde}
                        onChange={(e) =>
                          handleUpdateTramo(idx, 'objetivo_desde', Number(e.target.value))
                        }
                        required
                      />
                    </div>
                    <div className="w-28">
                      <label className="text-xs text-muted-foreground">% Comisión</label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={t.porcentaje}
                        onChange={(e) =>
                          handleUpdateTramo(idx, 'porcentaje', Number(e.target.value))
                        }
                        required
                      />
                    </div>
                    {tramos.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-4 text-error"
                        onClick={() => handleQuitarTramo(idx)}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Vigente desde</label>
                <Input
                  type="date"
                  value={vigenteDesde}
                  onChange={(e) => setVigenteDesde(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Vigente hasta (opcional)</label>
                <Input
                  type="date"
                  value={vigenteHasta}
                  onChange={(e) => setVigenteHasta(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalAbierto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Guardando...' : 'Guardar comisión'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  )
}
