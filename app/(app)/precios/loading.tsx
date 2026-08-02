import { SkeletonKpis, SkeletonTopbar } from '@/components/shell/PageSkeleton'

/**
 * Estado de carga instantáneo de la home de Precios.
 *
 * Solo los cuatro contadores dependen de datos. Las dos tarjetas de acceso son
 * estáticas, así que se pintan completas — el usuario puede leerlas y hasta
 * clickearlas mientras los números todavía están en vuelo.
 */
export default function LoadingPrecios() {
  return (
    <>
      <SkeletonTopbar title="Precios" />
      <main className="flex-1 p-6 space-y-6" aria-busy="true">
        <SkeletonKpis />

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-sm text-muted">Configurar</div>
            <div className="mt-1 font-display text-xl">Reglas de precios</div>
            <p className="mt-2 text-sm text-muted">
              Margen, descuentos, recargos por forma de pago. Cascada: producto &gt; categoría &gt;
              proveedor &gt; global.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-sm text-muted">Ejecutar</div>
            <div className="mt-1 font-display text-xl">Control de precios</div>
            <p className="mt-2 text-sm text-muted">
              Ver productos desactualizados y aplicar recálculo (individual o masivo).
            </p>
          </div>
        </section>
      </main>
    </>
  )
}
