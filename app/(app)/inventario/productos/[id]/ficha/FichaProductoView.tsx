'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Kpi } from '@/components/ui/Kpi'
import type {
  CategoriaRow,
  EstadoItem,
  ItemProductoRow,
  ProductoRow,
} from '@/lib/types/inventario'
import { AsignarTallesModal } from '../../AsignarTallesModal'
import { EditarProductoModal } from '../../EditarProductoModal'

type Proveedor = { id_proveedor: string; nombre: string } | null

/** Fecha "relevante" del ítem para filtrar por período: la del último
 *  movimiento significativo según su estado actual. */
function fechaRelevante(it: ItemProductoRow): string | null {
  switch (it.estado_item) {
    case 'vendido':
      return it.fecha_venta ?? it.fecha_ingreso
    case 'devuelto':
    case 'devuelto_cliente':
      return it.fecha_devolucion ?? it.fecha_ingreso
    case 'baja':
      return it.updated_at
    default:
      return it.fecha_ingreso
  }
}

/** Cuenta por (talle, estado) — talle null se agrupa como "__sin__". */
function agrupar(items: ItemProductoRow[]) {
  const map = new Map<string, Record<EstadoItem, number>>()
  for (const it of items) {
    const clave = it.talle ?? '__sin__'
    if (!map.has(clave)) {
      map.set(clave, {
        disponible: 0,
        reservado: 0,
        vendido: 0,
        devuelto: 0,
        devuelto_cliente: 0,
        baja: 0,
      })
    }
    map.get(clave)![it.estado_item] += 1
  }
  return map
}

function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function FichaProductoView({
  producto,
  categoria,
  categorias,
  proveedor,
  items,
  costoVigente,
  monedaVigente,
  stockDisponible,
  stockTotal,
}: {
  producto: ProductoRow
  categoria: Pick<CategoriaRow, 'id_categoria' | 'nombre' | 'talles'> | null
  /** Lista completa de categorías para el select del modal de edición. */
  categorias: CategoriaRow[]
  proveedor: Proveedor
  items: ItemProductoRow[]
  costoVigente: number | null
  monedaVigente: string | null
  stockDisponible: number
  stockTotal: number
}) {
  // Ruta actual para el "?from=" del Restock — la flecha del Topbar respeta
  // el origen (ficha) en vez de saltar a /inventario. Editar ya es modal.
  const fichaHref = `/inventario/productos/${producto.id_producto}/ficha`
  const bajoMinimo = producto.stock_minimo > 0 && stockDisponible < producto.stock_minimo
  const [editing, setEditing] = useState(false)
  const [asignarOpen, setAsignarOpen] = useState(false)

  // Disponibles sin talle: candidatos para asignación retroactiva. Vendidos,
  // reservados, etc. no cuentan — el RPC del server los ignora igual.
  const disponiblesSinTalle = useMemo(
    () => items.filter((it) => it.talle === null && it.estado_item === 'disponible').length,
    [items],
  )
  const puedeAsignarTalles =
    disponiblesSinTalle > 0 && (categoria?.talles?.length ?? 0) > 0

  // ─── Filtro por período (solo aplica a la tabla de stock por talle) ─
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const itemsFiltrados = useMemo(() => {
    if (!desde && !hasta) return items
    return items.filter((it) => {
      const f = fechaRelevante(it)
      if (!f) return false
      const fd = f.slice(0, 10)
      if (desde && fd < desde) return false
      if (hasta && fd > hasta) return false
      return true
    })
  }, [items, desde, hasta])

  // Solo talles que el producto usa realmente (no todos los de la categoría).
  // Si tiene items sin talle, se muestra como fila "Sin talle".
  const filasBreakdown = useMemo(() => {
    const grupos = agrupar(itemsFiltrados)
    const claves = Array.from(grupos.keys())
    // Orden estable: los talles de la categoría primero (según su orden),
    // luego cualquier otro talle histórico, y "sin talle" al final.
    const ordenCat = categoria?.talles ?? []
    const ordenadas = [
      ...ordenCat.filter((t) => claves.includes(t)),
      ...claves.filter((k) => k !== '__sin__' && !ordenCat.includes(k)).sort(),
      ...(claves.includes('__sin__') ? ['__sin__'] : []),
    ]
    return ordenadas.map((k) => ({
      talle: k,
      label: k === '__sin__' ? 'Sin talle' : k,
      counts: grupos.get(k)!,
    }))
  }, [itemsFiltrados, categoria?.talles])

  const filtroActivo = !!desde || !!hasta

  function preset(kind: 'hoy' | 'mes' | 'anio' | 'todo') {
    if (kind === 'todo') {
      setDesde('')
      setHasta('')
      return
    }
    const now = new Date()
    let d: string
    let h: string
    if (kind === 'hoy') {
      d = h = fmtISO(now)
    } else if (kind === 'mes') {
      d = fmtISO(new Date(now.getFullYear(), now.getMonth(), 1))
      h = fmtISO(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    } else {
      d = `${now.getFullYear()}-01-01`
      h = `${now.getFullYear()}-12-31`
    }
    setDesde(d)
    setHasta(h)
  }

  return (
    <div className="space-y-6">
      {/* Cabecera con acciones */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl text-text">{producto.nombre}</h2>
            {!producto.activo && <Badge variant="warning">Inactivo</Badge>}
          </div>
          <div className="text-sm text-muted">
            {producto.sku ? (
              <span className="font-mono">{producto.sku}</span>
            ) : (
              <span className="text-muted-2">Sin SKU</span>
            )}
            {categoria && <span> · {categoria.nombre}</span>}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Link
            href={`/inventario/ingresos/nuevo?producto=${producto.id_producto}&from=${encodeURIComponent(fichaHref)}`}
          >
            <Button size="sm">Restock</Button>
          </Link>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
        </div>
      </div>

      {/* KPIs — usa el Kpi shared (tabular-nums + shrink en tablet) */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi
          label="Stock disponible"
          value={stockDisponible.toString()}
          variant={bajoMinimo ? 'alert' : 'default'}
        />
        <Kpi label="Stock total" value={stockTotal.toString()} />
        <Kpi label="Stock mínimo" value={producto.stock_minimo.toString()} />
        <Kpi
          label="Precio de venta"
          value={
            producto.precio_venta != null
              ? `$ ${producto.precio_venta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
              : '—'
          }
        />
      </section>

      {/* Datos generales */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold">Datos del producto</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dato label="Categoría" value={categoria?.nombre ?? '—'} />
          <Dato label="Proveedor habitual" value={proveedor?.nombre ?? 'Sin proveedor'} />
          <Dato label="Estado" value={producto.activo ? 'Activo' : 'Inactivo'} />
        </div>
        <Dato
          label="Descripción"
          value={producto.descripcion?.trim() || '—'}
          block
        />
      </section>

      {/* Reasignar talles retroactivamente — solo cuando hay disponibles sin
          talle y la categoría tiene talles definidos. Es una acción destacada
          porque escondida en la tabla pasaba desapercibida. */}
      {puedeAsignarTalles && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-pink bg-card p-5">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text">Productos sin talle</h3>
            <p className="mt-1 text-sm text-muted">
              Hay <b className="text-text tabular-nums">{disponiblesSinTalle}</b>{' '}
              unidad{disponiblesSinTalle === 1 ? '' : 'es'} disponible{disponiblesSinTalle === 1 ? '' : 's'} sin
              talle. Podés distribuirlas entre los talles de la categoría; los ítems
              vendidos, reservados o dados de baja no se tocan.
            </p>
          </div>
          <Button size="sm" onClick={() => setAsignarOpen(true)}>
            Asignar talles
          </Button>
        </section>
      )}

      {/* Stock por talle — solo talles usados por el producto */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Stock por talle</h3>
          {filtroActivo && (
            <span className="text-xs text-muted">
              Período: {desde || '…'} → {hasta || '…'}
            </span>
          )}
        </div>

        {/* Filtro por fecha (mismo patrón que /reportes) */}
        <form
          onSubmit={(e) => e.preventDefault()}
          className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card-2 p-3"
        >
          <div className="w-40">
            <Field htmlFor="fp-d" label="Desde">
              <Input
                id="fp-d"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                max={hasta || undefined}
              />
            </Field>
          </div>
          <div className="w-40">
            <Field htmlFor="fp-h" label="Hasta">
              <Input
                id="fp-h"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                min={desde || undefined}
              />
            </Field>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => preset('hoy')}>Hoy</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => preset('mes')}>Este mes</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => preset('anio')}>Este año</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => preset('todo')}>Todo</Button>
          </div>
        </form>

        {filasBreakdown.length === 0 ? (
          <p className="text-sm text-muted-2">
            {filtroActivo
              ? 'No hay movimientos de este producto en el período seleccionado.'
              : 'Este producto no tiene ítems cargados todavía. Usá Restock para ingresar unidades.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-3 font-medium">Talle</th>
                  <th className="py-2 pr-3 text-right font-medium">Disponible</th>
                  <th className="py-2 pr-3 text-right font-medium">Reservado</th>
                  <th className="py-2 pr-3 text-right font-medium">Vendido</th>
                  <th className="py-2 pr-3 text-right font-medium">Otros</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {filasBreakdown.map((f) => {
                  const otros =
                    f.counts.devuelto + f.counts.devuelto_cliente + f.counts.baja
                  const total =
                    f.counts.disponible + f.counts.reservado + f.counts.vendido + otros
                  return (
                    <tr key={f.talle} className="border-b border-border/60 last:border-none">
                      <td className="py-2 pr-3 font-medium">{f.label}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{f.counts.disponible}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">
                        {f.counts.reservado}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">
                        {f.counts.vendido}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">
                        {otros > 0 ? otros : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-2">
              {filtroActivo
                ? 'Se cuentan los ítems cuyo último movimiento relevante (ingreso, venta o devolución) cae en el período.'
                : '«Otros» incluye devoluciones al proveedor, devoluciones de cliente y bajas.'}
            </p>
          </div>
        )}
      </section>

      {/* Placeholder — QRs por ítem */}
      <section className="rounded-lg border border-dashed border-border bg-card-2 p-6">
        <h3 className="text-sm font-semibold text-muted">Listado de QRs por ítem</h3>
        <p className="mt-1 text-sm text-muted-2">Próximamente.</p>
      </section>

      <EditarProductoModal
        open={editing}
        producto={producto}
        categorias={categorias}
        onClose={() => setEditing(false)}
      />

      <AsignarTallesModal
        open={asignarOpen}
        idProducto={producto.id_producto}
        disponiblesSinTalle={disponiblesSinTalle}
        tallesCategoria={categoria?.talles ?? []}
        onClose={() => setAsignarOpen(false)}
      />
    </div>
  )
}

function Dato({
  label,
  value,
  hint,
  block,
}: {
  label: string
  value: string
  hint?: string
  block?: boolean
}) {
  return (
    <div className={block ? 'sm:col-span-2' : undefined}>
      <div className="text-xs uppercase font-mono text-muted">{label}</div>
      <div className="mt-1 text-sm text-text whitespace-pre-wrap">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-2">{hint}</div>}
    </div>
  )
}
