'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
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

export interface OpcionProveedor {
  id: string
  nombre: string
}

/**
 * Filtros del listado de devoluciones: período, proveedor y estado.
 *
 * Todo vive en la URL para que el filtro sea compartible y sobreviva a un
 * refresh; el server re-consulta y recalcula las MÉTRICAS con el mismo
 * recorte. Un KPI que ignora el filtro activo miente sobre lo que se está
 * mirando, así que acá no hay contadores "globales".
 *
 * Los presets se calculan en el cliente a propósito: el rango tiene que salir
 * de la zona horaria del USUARIO, no de la del server.
 */
export function ConsignacionesFiltros({
  desde,
  hasta,
  idProveedor,
  estado,
  proveedores,
}: {
  desde: string
  hasta: string
  idProveedor: string
  estado: string
  proveedores: OpcionProveedor[]
}) {
  const router = useRouter()
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)
  const [prov, setProv] = useState(idProveedor)
  const [est, setEst] = useState(estado)
  const [pendiente, startTransition] = useTransition()

  const rangoInvertido = d > h

  function aplicar(next: { desde: string; hasta: string; proveedor: string; estado: string }) {
    const params = new URLSearchParams({ desde: next.desde, hasta: next.hasta })
    if (next.proveedor) params.set('proveedor', next.proveedor)
    if (next.estado) params.set('estado', next.estado)
    startTransition(() => router.push(`/consignaciones?${params.toString()}`))
  }

  function aplicarPreset(preset: Preset) {
    const { desde: nd, hasta: nh } = PRESETS.find((p) => p.id === preset)!.rango()
    setD(nd)
    setH(nh)
    aplicar({ desde: nd, hasta: nh, proveedor: prov, estado: est })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!rangoInvertido) aplicar({ desde: d, hasta: h, proveedor: prov, estado: est })
      }}
      className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3"
      aria-label="Filtrar devoluciones"
    >
      <div className="w-40">
        <Field
          htmlFor="cons-desde"
          label="Desde"
          error={rangoInvertido ? 'Posterior a "Hasta"' : undefined}
        >
          <Input
            id="cons-desde"
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
        <Field htmlFor="cons-hasta" label="Hasta">
          <Input
            id="cons-hasta"
            type="date"
            value={h}
            min={d}
            onChange={(e) => setH(e.target.value)}
            disabled={pendiente}
          />
        </Field>
      </div>
      <div className="w-52">
        <Field htmlFor="cons-prov" label="Proveedor">
          <Select
            id="cons-prov"
            value={prov}
            onChange={(e) => setProv(e.target.value)}
            disabled={pendiente}
          >
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="w-40">
        <Field htmlFor="cons-estado" label="Estado">
          <Select
            id="cons-estado"
            value={est}
            onChange={(e) => setEst(e.target.value)}
            disabled={pendiente}
          >
            <option value="">Todos</option>
            <option value="activa">Activa</option>
            <option value="cerrada">Cerrada</option>
          </Select>
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
