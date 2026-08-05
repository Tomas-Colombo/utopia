'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Pagination } from '@/components/ui/Pagination'
import type { PerfilProveedorRow } from '@/lib/types/reportes'

const PAGE_SIZE = 20
type Orden =
  | 'nombre_asc'
  | 'pendiente_desc'
  | 'pendiente_asc'
  | 'rendido_desc'
  | 'items_desc'
  | 'consig_desc'

export function PerfilProveedoresTable({ rows }: { rows: PerfilProveedorRow[] }) {
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState('')
  const [soloConPendiente, setSoloConPendiente] = useState(false)
  const [orden, setOrden] = useState<Orden>('pendiente_desc')
  const [page, setPage] = useState(1)

  const tipos = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.tipo) set.add(r.tipo)
    return [...set].sort()
  }, [rows])

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase()
    const base = rows.filter((r) => {
      if (tipo && r.tipo !== tipo) return false
      if (soloConPendiente && r.monto_pendiente_rendicion <= 0) return false
      if (!term) return true
      return r.nombre.toLowerCase().includes(term)
    })
    const sorted = [...base].sort((a, b) => {
      switch (orden) {
        case 'nombre_asc': return a.nombre.localeCompare(b.nombre, 'es')
        case 'pendiente_desc': return b.monto_pendiente_rendicion - a.monto_pendiente_rendicion
        case 'pendiente_asc': return a.monto_pendiente_rendicion - b.monto_pendiente_rendicion
        case 'rendido_desc': return b.monto_rendido_historico - a.monto_rendido_historico
        case 'items_desc': return b.items_disponibles - a.items_disponibles
        case 'consig_desc': return b.consignaciones_activas - a.consignaciones_activas
      }
    })
    return sorted
  }, [rows, q, tipo, soloConPendiente, orden])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE))
  const pagina = Math.min(page, totalPaginas)
  const desde = (pagina - 1) * PAGE_SIZE
  const slice = filtradas.slice(desde, desde + PAGE_SIZE)

  function reset<T>(setter: (v: T) => void, v: T) {
    setter(v)
    setPage(1)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <Field htmlFor="prov-q" label="Buscar">
            <Input
              id="prov-q"
              value={q}
              onChange={(e) => reset(setQ, e.target.value)}
              placeholder="Nombre"
            />
          </Field>
        </div>
        <div className="w-48">
          <Field htmlFor="prov-tipo" label="Tipo">
            <select
              id="prov-tipo"
              value={tipo}
              onChange={(e) => reset(setTipo, e.target.value)}
              className="w-full capitalize"
            >
              <option value="">Todos</option>
              {tipos.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="w-56">
          <Field htmlFor="prov-orden" label="Ordenar por">
            <select
              id="prov-orden"
              value={orden}
              onChange={(e) => reset<Orden>(setOrden, e.target.value as Orden)}
              className="w-full"
            >
              <option value="pendiente_desc">Pendiente rendir (mayor a menor)</option>
              <option value="pendiente_asc">Pendiente rendir (menor a mayor)</option>
              <option value="rendido_desc">Rendido histórico (mayor a menor)</option>
              <option value="items_desc">Stock consig. (mayor a menor)</option>
              <option value="consig_desc">Consignaciones activas (mayor a menor)</option>
              <option value="nombre_asc">Nombre (A→Z)</option>
            </select>
          </Field>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted pb-2">
          <input
            type="checkbox"
            checked={soloConPendiente}
            onChange={(e) => reset(setSoloConPendiente, e.target.checked)}
            className="rounded border-border"
          />
          Solo con pendiente
        </label>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        {slice.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            Sin proveedores que coincidan con los filtros.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3 text-right">Stock consig.</th>
                <th className="px-4 py-3 text-right">Consig. abiertas</th>
                <th className="px-4 py-3 text-right">Pendiente rendir</th>
                <th className="px-4 py-3 text-right">Rendido histórico</th>
                <th className="px-4 py-3 text-right">Rendic. impagas</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((p) => (
                <tr key={p.id_proveedor} className="border-b border-border-2">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.nombre}</div>
                    <div className="text-xs text-muted capitalize">{p.tipo}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{p.items_disponibles}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {p.consignaciones_activas > 0 ? (
                      <Badge variant="warning">{p.consignaciones_activas}</Badge>
                    ) : (
                      p.consignaciones_activas
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {p.monto_pendiente_rendicion > 0 ? (
                      <span className="text-terracota font-semibold">
                        {fmtMoney(p.monto_pendiente_rendicion)}
                      </span>
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                    {p.lineas_pendientes_rendicion > 0 && (
                      <div className="text-xs text-muted">
                        {p.lineas_pendientes_rendicion} líneas
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    {fmtMoney(p.monto_rendido_historico)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {p.rendiciones_pendientes_pago > 0 ? (
                      <Badge variant="danger">{p.rendiciones_pendientes_pago}</Badge>
                    ) : (
                      p.rendiciones_pendientes_pago
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={pagina}
        pageSize={PAGE_SIZE}
        total={filtradas.length}
        onPageChange={setPage}
      />
    </div>
  )
}

function fmtMoney(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}
