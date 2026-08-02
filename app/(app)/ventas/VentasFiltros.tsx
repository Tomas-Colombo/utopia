'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import {
  anioActual,
  hoyRango,
  mesActual,
  mesAnterior,
  type RangoFechas,
} from '@/lib/fechas'

type Preset = 'hoy' | 'mes' | 'mesAnterior' | 'anio'

const PRESETS: Array<{ id: Preset; label: string; rango: () => RangoFechas }> = [
  { id: 'hoy', label: 'Hoy', rango: hoyRango },
  { id: 'mes', label: 'Este mes', rango: mesActual },
  { id: 'mesAnterior', label: 'Mes anterior', rango: mesAnterior },
  { id: 'anio', label: 'Este año', rango: anioActual },
]

/**
 * Filtro de período del listado de ventas. El rango vive en la URL (`?desde=`
 * y `?hasta=`, días calendario inclusivos) para que sea compartible y
 * sobreviva a un refresh; el server re-consulta con esos valores.
 *
 * Los presets se calculan en el cliente a propósito: el rango tiene que salir
 * de la zona horaria del USUARIO, no de la del server. Todo el cálculo pasa
 * por `lib/fechas`, que evita el corrimiento de día de `toISOString()`.
 */
export function VentasFiltros({ desde, hasta }: RangoFechas) {
  const router = useRouter()
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  const [pendiente, startTransition] = useTransition()

  const rangoInvertido = d > h

  function aplicar(nuevoDesde: string, nuevoHasta: string) {
    const params = new URLSearchParams({ desde: nuevoDesde, hasta: nuevoHasta })
    startTransition(() => router.push(`/ventas?${params.toString()}`))
  }

  function aplicarPreset(preset: Preset) {
    const { desde: nd, hasta: nh } = PRESETS.find((p) => p.id === preset)!.rango()
    setD(nd)
    setH(nh)
    aplicar(nd, nh)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!rangoInvertido) aplicar(d, h)
      }}
      className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3"
      aria-label="Filtrar ventas por período"
    >
      <div className="w-40">
        <Field
          htmlFor="ventas-desde"
          label="Desde"
          error={rangoInvertido ? 'Posterior a "Hasta"' : undefined}
        >
          <Input
            id="ventas-desde"
            type="date"
            value={d}
            max={h}
            invalid={rangoInvertido}
            onChange={(e) => setD(e.target.value)}
            disabled={pendiente}
          />
        </Field>
      </div>
      <div className="w-40">
        <Field htmlFor="ventas-hasta" label="Hasta">
          <Input
            id="ventas-hasta"
            type="date"
            value={h}
            min={d}
            onChange={(e) => setH(e.target.value)}
            disabled={pendiente}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2 ml-auto">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => aplicarPreset(p.id)}
            disabled={pendiente}
          >
            {p.label}
          </Button>
        ))}
        <Button type="submit" disabled={pendiente || rangoInvertido}>
          {pendiente ? 'Filtrando…' : 'Aplicar'}
        </Button>
      </div>
    </form>
  )
}
