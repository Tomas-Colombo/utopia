'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FilterBar } from '@/components/ui/FilterBar'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { Table, type Column } from '@/components/ui/Table'
import { waMeLink } from '@/lib/utils/waMeLink'
import {
  FILTRO_ESTADO_CUOTAS_LABEL,
  nombreCliente,
  type FiltroEstadoCuotas,
} from '@/lib/types/ventas'
import type { DeudorRow } from '@/lib/dal/cuotas/cuota'

/**
 * Listado de deudores. Cada fila es un cliente y todo lo que se puede hacer
 * con él está en su ficha: cobrar una cuota concreta exige elegir CUÁL, y esa
 * decisión necesita ver el plan completo.
 */
export function CuotasView({
  rows,
  estado,
  initialSearch,
  page,
  pageSize,
  total,
  hoy,
}: {
  rows: DeudorRow[]
  estado: FiltroEstadoCuotas
  initialSearch: string
  page: number
  pageSize: number
  total: number
  /** `YYYY-MM-DD` del server: la misma con la que se calcularon los KPIs. */
  hoy: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [q, setQ] = useState(initialSearch)

  function navegar(next: { estado?: FiltroEstadoCuotas; q?: string; page?: number }) {
    const params = new URLSearchParams()
    const est = next.estado ?? estado
    const texto = (next.q ?? q).trim()
    if (est !== 'con_deuda') params.set('estado', est)
    if (texto) params.set('q', texto)
    if ((next.page ?? 1) > 1) params.set('page', String(next.page))
    const qs = params.toString()
    start(() => router.push(qs ? `/cuotas?${qs}` : '/cuotas'))
  }

  /** La ficha vuelve a Cuotas y no a Clientes cuando se entra desde acá. */
  function href(d: DeudorRow): string {
    return `/clientes/${d.id_cliente}?from=cuotas`
  }

  const columns: Column<DeudorRow>[] = [
    {
      key: 'cliente',
      label: 'Cliente',
      render: (d) => {
        const wa = waMeLink(d.cliente?.telefono ?? null)
        return (
          <div>
            <Link href={href(d)} className="font-medium hover:underline">
              {nombreCliente(d.cliente)}
            </Link>
            {wa && (
              <div>
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-pink-strong hover:underline"
                >
                  WhatsApp
                </a>
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'pendientes',
      label: 'Pendientes',
      align: 'right',
      render: (d) => (
        <div>
          <span className="font-mono">{d.pendientes}</span>
          {/* Dos compras financiadas son dos planes distintos que caen en los
              mismos meses. Sin este dato, doce cuotas parecen un solo plan. */}
          {d.planes > 1 && (
            <div className="text-xs text-muted">en {d.planes} compras</div>
          )}
        </div>
      ),
    },
    {
      key: 'adeudado',
      label: 'Adeudado',
      align: 'right',
      render: (d) => <span className="font-mono font-semibold">{money(d.adeudado)}</span>,
    },
    {
      key: 'vencido',
      label: 'Vencido',
      align: 'right',
      render: (d) =>
        d.vencido > 0 ? (
          <div>
            <span className="font-mono font-semibold text-alerta-ink">
              {money(d.vencido)}
            </span>
            <div className="text-xs text-muted">
              {d.vencidas} cuota{d.vencidas === 1 ? '' : 's'}
            </div>
          </div>
        ) : (
          <span className="text-muted-2">—</span>
        ),
    },
    {
      key: 'proximo',
      label: 'Próximo vence',
      render: (d) => {
        if (d.vencido > 0 && !d.proximo_vencimiento) {
          return <Badge variant="danger">Todo vencido</Badge>
        }
        if (!d.proximo_vencimiento) return <span className="text-muted-2">—</span>
        const dias = diasHasta(hoy, d.proximo_vencimiento)
        return (
          <div>
            <div>{fecha(d.proximo_vencimiento)}</div>
            <div className="text-xs text-muted">
              {dias === 0 ? 'hoy' : `en ${dias} día${dias === 1 ? '' : 's'}`}
            </div>
          </div>
        )
      },
    },
    {
      key: 'acciones',
      label: '',
      align: 'right',
      render: (d) => (
        <Link href={href(d)}>
          <Button size="sm" variant="ghost">
            Ver cuotas
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <FilterBar
            value={q}
            onChange={setQ}
            placeholder="Buscar por nombre o apellido"
          />
        </div>
        <div className="w-48">
          <Select
            value={estado}
            onChange={(e) => navegar({ estado: e.target.value as FiltroEstadoCuotas, page: 1 })}
            disabled={pending}
            aria-label="Estado"
          >
            {(Object.keys(FILTRO_ESTADO_CUOTAS_LABEL) as FiltroEstadoCuotas[]).map((k) => (
              <option key={k} value={k}>
                {FILTRO_ESTADO_CUOTAS_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" onClick={() => navegar({ page: 1 })} disabled={pending}>
          Aplicar
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table
          columns={columns}
          data={rows}
          loading={pending}
          getRowId={(d) => d.id_cliente}
          emptyState={
            estado === 'con_deuda'
              ? 'Sin deuda pendiente. Nadie te debe nada.'
              : 'Ningún cliente coincide con el filtro.'
          }
        />
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(p) => navegar({ page: p })}
        disabled={pending}
      />
    </div>
  )
}

/** Días desde `hoy` hasta `iso`. Negativo = ya venció. */
function diasHasta(hoy: string, iso: string): number {
  const a = Date.parse(`${hoy}T00:00:00Z`)
  const b = Date.parse(`${iso}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

function fecha(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR')
}

function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}
