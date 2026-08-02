'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'

/**
 * Selector de período compartido por las tres tablas del perfil
 * (ingresos, consignaciones, rendiciones). Cambia URL params → server
 * re-renderea. Presets: mes actual, 3 meses, año, todo.
 */
export function PerfilPeriodoForm({
  id,
  desde,
  hasta,
}: {
  id: string
  desde: string
  hasta: string
}) {
  const router = useRouter()
  const [d, setD] = useState(desde)
  const [h, setH] = useState(hasta)

  function apply(desdeStr: string, hastaStr: string) {
    const params = new URLSearchParams()
    if (desdeStr) params.set('desde', desdeStr)
    if (hastaStr) params.set('hasta', hastaStr)
    const qs = params.toString()
    router.push(qs ? `/proveedores/${id}?${qs}` : `/proveedores/${id}`)
  }

  function preset(kind: 'mes' | 'trim' | 'anio' | 'todo') {
    const now = new Date()
    let desdeStr = ''
    let hastaStr = ''
    if (kind === 'mes') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      desdeStr = first.toISOString().slice(0, 10)
      hastaStr = last.toISOString().slice(0, 10)
    } else if (kind === 'trim') {
      const first = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      desdeStr = first.toISOString().slice(0, 10)
      hastaStr = last.toISOString().slice(0, 10)
    } else if (kind === 'anio') {
      desdeStr = `${now.getFullYear()}-01-01`
      hastaStr = `${now.getFullYear()}-12-31`
    }
    setD(desdeStr)
    setH(hastaStr)
    apply(desdeStr, hastaStr)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        apply(d, h)
      }}
      className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3"
    >
      <div className="w-40">
        <Field htmlFor="pp-d" label="Desde">
          <Input id="pp-d" type="date" value={d} onChange={(e) => setD(e.target.value)} />
        </Field>
      </div>
      <div className="w-40">
        <Field htmlFor="pp-h" label="Hasta">
          <Input id="pp-h" type="date" value={h} onChange={(e) => setH(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2 ml-auto">
        <Button type="button" variant="ghost" size="sm" onClick={() => preset('mes')}>
          Este mes
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => preset('trim')}>
          Últimos 3 meses
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => preset('anio')}>
          Este año
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => preset('todo')}>
          Todo
        </Button>
        <Button type="submit">Aplicar</Button>
      </div>
    </form>
  )
}
