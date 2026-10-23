'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Kpi } from '@/components/ui/Kpi'
import { Table, type Column } from '@/components/ui/Table'
import type {
  LineaLiquidacionDetalle,
  LiquidacionConDetalle,
} from '@/lib/dal/revendedoras/liquidacion'
import type { CuentaDestinoRow } from '@/lib/types/ventas'
import { formatearMoneda } from '@/lib/utils/moneda'
import { PagoLiquidacionModal } from './PagoLiquidacionModal'
import { Card } from '@/components/ui/Card'

interface LiquidacionDetalleViewProps {
  data: LiquidacionConDetalle
  puedeLiquidar: boolean
  cuentas: CuentaDestinoRow[]
}

export function LiquidacionDetalleView({
  data,
  puedeLiquidar,
  cuentas,
}: LiquidacionDetalleViewProps) {
  const [modalPagoOpen, setModalPagoOpen] = useState(false)

  const { liquidacion, pagos, lineas } = data
  const esPagada = liquidacion.estado === 'pagada'
  const pago = pagos[0]

  const columnasLineas: Column<LineaLiquidacionDetalle>[] = [
    {
      key: 'fecha_venta',
      label: 'Fecha venta',
      render: (l) => (
        <span className="font-mono text-xs">
          {new Date(l.fecha_venta).toLocaleDateString('es-AR')}
        </span>
      ),
    },
    {
      key: 'producto',
      label: 'Producto',
      render: (l) => (
        <div>
          <div className="font-medium text-sm">{l.nombre_producto}</div>
          <div className="font-mono text-xs text-muted">SKU: {l.sku}</div>
        </div>
      ),
    },
    {
      key: 'precio_venta',
      label: 'Precio venta',
      render: (l) => <span className="font-mono">{formatearMoneda(Number(l.precio_venta))}</span>,
    },
    {
      key: 'porcentaje',
      label: '% Preview',
      render: (l) => (
        <span className="font-mono text-xs">{Number(l.porcentaje_comision_preview)} %</span>
      ),
    },
    {
      key: 'monto_comision',
      label: 'Comisión sellada',
      render: (l) => <span className="font-mono">{formatearMoneda(Number(l.monto_comision))}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Resumen principal y KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total a cobrar"
          value={formatearMoneda(Number(liquidacion.monto_a_cobrar))}
          sub={esPagada ? 'Cobro completado' : 'Pendiente de cobro'}
          variant={!esPagada ? 'alert' : 'default'}
        />
        <Kpi
          label="Monto comisión"
          value={formatearMoneda(Number(liquidacion.monto_comision))}
          sub={`Escala aplicada: ${Number(liquidacion.porcentaje_aplicado)} %`}
        />
        <Kpi
          label="Monto vendido"
          value={formatearMoneda(Number(liquidacion.monto_vendido))}
          sub={`${liquidacion.cantidad_lineas} ventas selladas`}
        />
        <Kpi
          label="Estado"
          value={esPagada ? 'Pagada' : 'Pendiente'}
          sub={`Generada el ${new Date(liquidacion.fecha_liquidacion).toLocaleDateString('es-AR')}`}
        />
      </div>

      {/* Tarjeta de estado de pago */}
      <Card padding="none" className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg">Estado de liquidación</h2>
            <p className="text-sm text-muted">
              Período: {new Date(liquidacion.periodo_desde).toLocaleDateString('es-AR')} →{' '}
              {new Date(liquidacion.periodo_hasta).toLocaleDateString('es-AR')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={esPagada ? 'success' : 'warning'}>
              {esPagada ? 'Pagada' : 'Pendiente'}
            </Badge>

            {!esPagada && puedeLiquidar && (
              <Button onClick={() => setModalPagoOpen(true)}>Registrar pago</Button>
            )}
          </div>
        </div>

        {esPagada && pago && (
          <div className="rounded-md border border-border bg-card/60 p-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <span className="text-xs uppercase font-mono text-muted">Fecha de pago</span>
              <div className="mt-1 font-mono font-medium">
                {new Date(pago.fecha).toLocaleDateString('es-AR')}
              </div>
            </div>
            <div>
              <span className="text-xs uppercase font-mono text-muted">Monto acreditado</span>
              <div className="mt-1 font-mono font-medium text-foreground">
                {formatearMoneda(Number(pago.monto))}
              </div>
            </div>
            <div>
              <span className="text-xs uppercase font-mono text-muted">Método</span>
              <div className="mt-1">{pago.metodo || '—'}</div>
            </div>
            <div>
              <span className="text-xs uppercase font-mono text-muted">Referencia</span>
              <div className="mt-1 font-mono text-xs">{pago.referencia || '—'}</div>
            </div>
          </div>
        )}

        {liquidacion.observaciones && (
          <div className="text-sm pt-2">
            <span className="text-xs text-muted uppercase font-mono block">Observaciones</span>
            <p className="mt-1 text-foreground whitespace-pre-wrap">{liquidacion.observaciones}</p>
          </div>
        )}
      </Card>

      {/* Líneas de venta selladas en la liquidación */}
      <Card padding="none" className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">Líneas de venta selladas</h3>
          <span className="text-sm text-muted">{lineas.length} línea(s)</span>
        </div>

        <div className="overflow-x-auto">
          <Table
            data={lineas}
            columns={columnasLineas}
            getRowId={(l) => l.id_detalle_venta}
            emptyState={
              <p className="p-4 text-center text-sm text-muted">
                No se encontraron líneas selladas para esta liquidación.
              </p>
            }
          />
        </div>
      </Card>

      <PagoLiquidacionModal
        open={modalPagoOpen}
        onClose={() => setModalPagoOpen(false)}
        idLiquidacion={liquidacion.id_liquidacion}
        montoACobrar={Number(liquidacion.monto_a_cobrar)}
        cuentas={cuentas}
      />
    </div>
  )
}
