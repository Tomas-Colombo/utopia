import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/shell/Topbar'
import { Badge } from '@/components/ui/Badge'
import { Kpi } from '@/components/ui/Kpi'
import { verifySession } from '@/lib/dal/session'
import {
  getPerfilProveedorPorId,
  getProveedor,
} from '@/lib/dal/inventario/proveedor'
import { listIngresosDeProveedor } from '@/lib/dal/inventario/ingreso'
import { listConsignaciones } from '@/lib/dal/consignaciones/consignacion'
import { listRendiciones } from '@/lib/dal/rendiciones/rendicion'
import { waMeLink } from '@/lib/utils/waMeLink'
import { ESTADO_CONSIGNACION_LABEL } from '@/lib/types/consignaciones'
import { ESTADO_RENDICION_LABEL } from '@/lib/types/rendiciones'
import { BajaProveedorButton } from './BajaProveedorButton'
import { PerfilPeriodoForm } from './PerfilPeriodoForm'
import { PerfilPaginacion } from './PerfilPaginacion'

const PAGE_SIZE = 10

export default async function ProveedorPerfilPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    desde?: string
    hasta?: string
    ing_page?: string
    cons_page?: string
    rend_page?: string
  }>
}) {
  const session = await verifySession()
  const { id } = await props.params
  const sp = await props.searchParams

  const proveedor = await getProveedor(id)
  if (!proveedor) notFound()

  const [perfil, ingresosAll, consignacionesAll, rendicionesAll] = await Promise.all([
    getPerfilProveedorPorId(id),
    listIngresosDeProveedor(id),
    listConsignaciones({ idProveedor: id }),
    listRendiciones({ idProveedor: id }),
  ])

  // Filtro de fechas compartido (vacío = sin filtro). El input <input type="date">
  // manda 'YYYY-MM-DD'; sumamos 23:59:59 al hasta para que sea inclusive.
  const desdeMs = sp.desde ? new Date(sp.desde).getTime() : null
  const hastaMs = sp.hasta
    ? new Date(new Date(sp.hasta).setHours(23, 59, 59, 999)).getTime()
    : null

  function enRango(iso: string): boolean {
    if (!desdeMs && !hastaMs) return true
    const t = new Date(iso).getTime()
    if (desdeMs && t < desdeMs) return false
    if (hastaMs && t > hastaMs) return false
    return true
  }

  const ingresosFiltrados = ingresosAll.filter((i) => enRango(i.fecha))
  const consignacionesFiltradas = consignacionesAll.filter((c) => enRango(c.fecha))
  const rendicionesFiltradas = rendicionesAll.filter((r) => enRango(r.fecha_generacion))

  const ingPage = Math.max(1, Number.parseInt(sp.ing_page ?? '1', 10) || 1)
  const consPage = Math.max(1, Number.parseInt(sp.cons_page ?? '1', 10) || 1)
  const rendPage = Math.max(1, Number.parseInt(sp.rend_page ?? '1', 10) || 1)

  const ingresos = ingresosFiltrados.slice((ingPage - 1) * PAGE_SIZE, ingPage * PAGE_SIZE)
  const consignaciones = consignacionesFiltradas.slice((consPage - 1) * PAGE_SIZE, consPage * PAGE_SIZE)
  const rendiciones = rendicionesFiltradas.slice((rendPage - 1) * PAGE_SIZE, rendPage * PAGE_SIZE)

  const wa = waMeLink(proveedor.telefono)

  // Se vuelve por donde se vino: los detalles a los que salta este perfil
  // reciben un `?from=` con la URL actual, así el botón "volver" del Topbar
  // devuelve acá y no al listado de la otra sección. Cada tabla propaga SU
  // paginación (el resto ya está en la primera página, no hace falta fijarla).
  function volverAqui(pageKey: 'ing_page' | 'cons_page' | 'rend_page', page: number): string {
    const qs = new URLSearchParams()
    if (sp.desde) qs.set('desde', sp.desde)
    if (sp.hasta) qs.set('hasta', sp.hasta)
    if (page > 1) qs.set(pageKey, String(page))
    const query = qs.toString()
    return `/proveedores/${id}${query ? `?${query}` : ''}`
  }

  return (
    <>
      <Topbar title={proveedor.nombre} session={session} backHref="/proveedores" />
      <main className="flex-1 p-6 space-y-6">
        {/* ─── Cabecera ─────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0 space-y-1.5">
              <h2 className="font-display text-2xl leading-tight">{proveedor.nombre}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={proveedor.activo ? 'success' : 'neutral'}>
                  {proveedor.activo ? 'Activo' : 'Inactivo'}
                </Badge>
                <span className="font-mono text-xs uppercase text-muted">{proveedor.tipo}</span>
              </div>
            </div>
            <BajaProveedorButton
              id={proveedor.id_proveedor}
              activo={proveedor.activo}
              tieneDeudaPendiente={perfil.monto_pendiente_rendicion > 0}
            />
          </header>

          <dl className="grid grid-cols-1 gap-y-3 gap-x-8 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
            <Dato label="Teléfono">
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-strong hover:underline"
                >
                  {proveedor.telefono} · WhatsApp
                </a>
              ) : (
                <span className="text-muted-2">—</span>
              )}
            </Dato>
            <Dato label="Email">
              {proveedor.email ?? <span className="text-muted-2">—</span>}
            </Dato>
            <Dato label="CUIT">
              {proveedor.cuit ?? <span className="text-muted-2">—</span>}
            </Dato>
            <Dato label="Días de rotación">
              {proveedor.dias_rotacion != null
                ? `${proveedor.dias_rotacion} días`
                : <span className="text-muted-2">—</span>}
            </Dato>
          </dl>

          {proveedor.notas && (
            <div className="border-t border-border px-5 py-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted mb-1">
                Notas
              </div>
              <p className="text-sm text-text whitespace-pre-wrap">{proveedor.notas}</p>
            </div>
          )}
        </section>

        {/* ─── Deuda y contadores ──────────────────────── */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Kpi
            label="Deuda total"
            value={fmtMoney(perfil.deuda_total_consignacion)}
            sub="Pendiente de rendir + valor stock consig."
            variant={perfil.deuda_total_consignacion > 0 ? 'alert' : 'default'}
          />
          <Kpi
            label="Valor stock consig."
            value={fmtMoney(perfil.valor_stock_consignacion)}
            sub={`${perfil.items_en_stock_consignacion} ítem${perfil.items_en_stock_consignacion === 1 ? '' : 's'} a costo`}
          />
          <Kpi
            label="Pendiente de rendir"
            value={fmtMoney(perfil.monto_pendiente_rendicion)}
            sub={`${perfil.lineas_pendientes_rendicion} línea${perfil.lineas_pendientes_rendicion === 1 ? '' : 's'} vendida${perfil.lineas_pendientes_rendicion === 1 ? '' : 's'} sin rendir`}
            variant={perfil.monto_pendiente_rendicion > 0 ? 'alert' : 'default'}
          />
          <Kpi
            label="Rendiciones sin pagar"
            value={perfil.rendiciones_pendientes_pago.toString()}
            variant={perfil.rendiciones_pendientes_pago > 0 ? 'alert' : 'default'}
          />
          <Kpi
            label="Rendido histórico"
            value={fmtMoney(perfil.monto_rendido_historico)}
          />
          <Kpi
            label="Consignaciones activas"
            value={perfil.consignaciones_activas.toString()}
          />
        </section>

        {/* ─── Filtro de período compartido ────────────── */}
        <PerfilPeriodoForm id={id} desde={sp.desde ?? ''} hasta={sp.hasta ?? ''} />

        {/* ─── Ingresos ────────────────────────────────── */}
        <section className="space-y-2">
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <div className="border-b border-border px-4 py-3 flex items-baseline justify-between">
              <h3 className="font-display text-lg">Ingresos de mercadería</h3>
              <span className="text-xs text-muted font-mono">
                {ingresosFiltrados.length} en el período
              </span>
            </div>
            {ingresos.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">
                Sin ingresos en el período seleccionado.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Remito</th>
                    <th className="px-4 py-3 text-right">Líneas</th>
                    <th className="px-4 py-3 text-right">Cantidad</th>
                    <th className="px-4 py-3 text-right">Costo total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {ingresos.map((i) => (
                    <tr key={i.id_ingreso} className="border-b border-border-2">
                      <td className="px-4 py-3 text-xs text-muted">
                        {new Date(i.fecha).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs uppercase">{i.tipo_ingreso}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {i.numero_remito ?? <span className="text-muted-2">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{i.total_lineas}</td>
                      <td className="px-4 py-3 text-right font-mono">{i.total_cantidad}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtMoney(i.total_costo)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/inventario/ingresos/${i.id_ingreso}?from=${encodeURIComponent(volverAqui('ing_page', ingPage))}`}
                          className="text-sm text-pink-strong hover:underline"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <PerfilPaginacion
            id={id}
            paramKey="ing_page"
            page={ingPage}
            pageSize={PAGE_SIZE}
            total={ingresosFiltrados.length}
          />
        </section>

        {/* ─── Consignaciones ─────────────────────────── */}
        <section className="space-y-2">
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <div className="border-b border-border px-4 py-3 flex items-baseline justify-between">
              <h3 className="font-display text-lg">Consignaciones</h3>
              <span className="text-xs text-muted font-mono">
                {consignacionesFiltradas.length} en el período
              </span>
            </div>
            {consignaciones.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">
                Sin consignaciones en el período seleccionado.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Ítems</th>
                    <th className="px-4 py-3 text-right">Pendientes</th>
                    <th className="px-4 py-3 text-right">Devueltos</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {consignaciones.map((c) => (
                    <tr key={c.id_consignacion} className="border-b border-border-2">
                      <td className="px-4 py-3 text-xs text-muted">
                        {new Date(c.fecha).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={c.estado === 'activa' ? 'warning' : 'neutral'}>
                          {ESTADO_CONSIGNACION_LABEL[c.estado]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{c.total_items}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.pendientes}</td>
                      <td className="px-4 py-3 text-right font-mono">{c.devueltos}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/consignaciones/${c.id_consignacion}?from=${encodeURIComponent(volverAqui('cons_page', consPage))}`}
                          className="text-sm text-pink-strong hover:underline"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <PerfilPaginacion
            id={id}
            paramKey="cons_page"
            page={consPage}
            pageSize={PAGE_SIZE}
            total={consignacionesFiltradas.length}
          />
        </section>

        {/* ─── Rendiciones ────────────────────────────── */}
        <section className="space-y-2">
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <div className="border-b border-border px-4 py-3 flex items-baseline justify-between">
              <h3 className="font-display text-lg">Rendiciones</h3>
              <span className="text-xs text-muted font-mono">
                {rendicionesFiltradas.length} en el período
              </span>
            </div>
            {rendiciones.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">
                Sin rendiciones en el período seleccionado.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Período</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Líneas</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rendiciones.map((r) => (
                    <tr key={r.id_rendicion} className="border-b border-border-2">
                      <td className="px-4 py-3 text-xs text-muted">
                        {new Date(r.fecha_generacion).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {r.periodo_desde && r.periodo_hasta
                          ? `${new Date(r.periodo_desde).toLocaleDateString('es-AR')} → ${new Date(r.periodo_hasta).toLocaleDateString('es-AR')}`
                          : <span className="text-muted-2">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={r.estado === 'pendiente' ? 'warning' : 'success'}>
                          {ESTADO_RENDICION_LABEL[r.estado]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{r.cantidad_lineas}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmtMoney(r.monto_total)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/rendiciones/${r.id_rendicion}?from=${encodeURIComponent(volverAqui('rend_page', rendPage))}`}
                          className="text-sm text-pink-strong hover:underline"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <PerfilPaginacion
            id={id}
            paramKey="rend_page"
            page={rendPage}
            pageSize={PAGE_SIZE}
            total={rendicionesFiltradas.length}
          />
        </section>
      </main>
    </>
  )
}

function fmtMoney(n: number): string {
  return `$ ${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-muted mb-0.5">
        {label}
      </dt>
      <dd className="text-sm text-text truncate">{children}</dd>
    </div>
  )
}

