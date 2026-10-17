'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import type { CategoriaGastoStatus } from '@/lib/types/rendiciones'
import { DataTable, THead, TBody, Tr, Th, Td } from '@/components/ui/TableParts'

const ALERTA_VARIANT: Record<CategoriaGastoStatus['alerta'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  ok: 'success',
  cerca: 'warning',
  excedido: 'danger',
  sin_control: 'neutral',
}
const ALERTA_LABEL: Record<CategoriaGastoStatus['alerta'], string> = {
  ok: 'OK',
  cerca: 'Cerca del límite',
  excedido: 'Excedido',
  sin_control: 'Sin presupuesto',
}

const PAGE_SIZE = 10

export function PresupuestosMesTable({ rows }: { rows: CategoriaGastoStatus[] }) {
  const [page, setPage] = useState(1)
  const totalPaginas = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pagina = Math.min(page, totalPaginas)
  const desde = (pagina - 1) * PAGE_SIZE
  const slice = rows.slice(desde, desde + PAGE_SIZE)

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        Sin categorías de gasto configuradas.
      </div>
    )
  }

  return (
    <div>
      <DataTable>
        <THead>
          <Th>Categoría</Th>
          <Th align="right">Presupuesto</Th>
          <Th align="right">Gastado</Th>
          <Th align="right">Restante</Th>
          <Th>%</Th>
          <Th>Estado</Th>
        </THead>
        <TBody>
          {slice.map((p) => {
            const pctClamp = Math.min(p.gastado_pct ?? 0, 100)
            return (
              <Tr key={p.id_categoria_gasto}>
                <Td className="font-medium">{p.nombre}</Td>
                <Td align="right" className="font-mono">
                  {p.presupuesto_mensual != null
                    ? `$ ${p.presupuesto_mensual.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                    : <span className="text-muted">—</span>}
                </Td>
                <Td align="right" className="font-mono">
                  $ {p.gastado_mes.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </Td>
                <Td align="right" className="font-mono">
                  {p.restante != null
                    ? (p.restante < 0
                        ? <span className="text-alerta-ink">-$ {Math.abs(p.restante).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                        : `$ ${p.restante.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`)
                    : <span className="text-muted">—</span>}
                </Td>
                <Td className="w-40">
                  {p.gastado_pct != null ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded bg-card-3 overflow-hidden">
                        <div
                          className={
                            p.alerta === 'excedido' ? 'h-full bg-alerta-ink' :
                            p.alerta === 'cerca' ? 'h-full bg-warn' :
                            'h-full bg-success'
                          }
                          style={{ width: `${pctClamp}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono">{p.gastado_pct}%</span>
                    </div>
                  ) : (
                    <span className="text-muted text-xs">Sin control</span>
                  )}
                </Td>
                <Td>
                  <Badge variant={ALERTA_VARIANT[p.alerta]}>
                    {ALERTA_LABEL[p.alerta]}
                  </Badge>
                </Td>
              </Tr>
            )
          })}
        </TBody>
      </DataTable>
      <div className="border-t border-border px-2">
        <Pagination
          page={pagina}
          pageSize={PAGE_SIZE}
          total={rows.length}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
