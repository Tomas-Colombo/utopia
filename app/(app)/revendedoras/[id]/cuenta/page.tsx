import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Button } from '@/components/ui/Button'
import { Kpi } from '@/components/ui/Kpi'
import { hasPermission, requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'
import { obtenerRevendedora, obtenerCuentaCorrienteRevendedora } from '@/lib/dal/revendedoras'
import { RevendedoraTabs } from '../RevendedoraTabs'
import { formatearMoneda } from '@/lib/utils/moneda'

export default async function RevendedoraCuentaPage(props: {
  params: Promise<{ id: string }>
}) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  const { id } = await props.params
  const revendedora = await obtenerRevendedora(session, id)
  if (!revendedora) notFound()

  const ccRes = await obtenerCuentaCorrienteRevendedora(id)
  const cc = ccRes.ok
    ? ccRes.data
    : {
        total_en_poder: 0,
        total_vendido: 0,
        total_devuelto: 0,
        total_comision_liquidada: 0,
        total_liquidado: 0,
        total_pagado: 0,
        adeudado: 0,
      }

  const puedeLiquidar = hasPermission(session, 'revendedoras', 'liquidar')

  return (
    <>
      <Topbar
        title={`Cuenta corriente · ${revendedora.nombre} ${revendedora.apellido}`}
        session={session}
        backHref={`/revendedoras/${id}`}
        actions={
          puedeLiquidar && (
            <Link href={`/revendedoras/${id}/liquidaciones/nueva`}>
              <Button size="sm">Nueva liquidación</Button>
            </Link>
          )
        }
      />
      <main className="flex-1 p-6 space-y-6 max-w-5xl">
        <RevendedoraTabs idRevendedora={id} activeTab="cuenta" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Adeudado al local"
            value={formatearMoneda(cc.adeudado)}
            sub={cc.adeudado > 0 ? 'Saldo pendiente de cobro' : 'Al día'}
            variant={cc.adeudado > 0 ? 'alert' : 'default'}
          />
          <Kpi
            label="Total pagado"
            value={formatearMoneda(cc.total_pagado)}
            sub="Cobrado por liquidaciones"
          />
          <Kpi
            label="Total liquidado"
            value={formatearMoneda(cc.total_liquidado)}
            sub={`Comisión: ${formatearMoneda(cc.total_comision_liquidada)}`}
          />
          <Kpi
            label="Total vendido"
            value={formatearMoneda(cc.total_vendido)}
            sub={`En poder: ${formatearMoneda(cc.total_en_poder)}`}
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h2 className="font-display text-lg">Resumen de cuenta corriente</h2>
          <div className="divide-y divide-border text-sm">
            <div className="flex justify-between py-2">
              <span className="text-muted">Mercadería en poder</span>
              <span className="font-mono font-medium">{formatearMoneda(cc.total_en_poder)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted">Total vendido por revendedora</span>
              <span className="font-mono font-medium">{formatearMoneda(cc.total_vendido)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted">Total devuelto al local</span>
              <span className="font-mono font-medium">{formatearMoneda(cc.total_devuelto)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted">Comisiones liquidadas</span>
              <span className="font-mono font-medium">{formatearMoneda(cc.total_comision_liquidada)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted">Total neto liquidado</span>
              <span className="font-mono font-medium">{formatearMoneda(cc.total_liquidado)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted">Total pagado por revendedora</span>
              <span className="font-mono font-medium">{formatearMoneda(cc.total_pagado)}</span>
            </div>
            <div className="flex justify-between py-3 text-base font-semibold border-t border-border">
              <span>Saldo adeudado</span>
              <span className={`font-mono ${cc.adeudado > 0 ? 'text-destructive font-bold' : ''}`}>
                {formatearMoneda(cc.adeudado)}
              </span>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
