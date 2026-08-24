import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { SearchableSelect, type Option } from '@/components/ui/SearchableSelect'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, type Column } from '@/components/ui/Table'

/**
 * Contrast fixture: every base component rendered together with the design
 * token utility classes, so the WCAG walker in
 * `design-system-contrast.test.tsx` has a representative tree to measure.
 *
 * WHY this is a fixture and not a route: this surface used to live at
 * `/demo`, a page built to close Etapa 0. Nothing linked to it, but it sat
 * outside the `(app)` route group, so it rendered to unauthenticated
 * visitors in production. The route is gone; the contrast coverage it
 * happened to provide is not, and it belongs next to the test that needs it.
 *
 * Keep this in sync with the components under `components/ui/`: a variant
 * that is not rendered here is a variant nothing checks for contrast.
 *
 * Deliberately stateless. The walker measures computed colors on rendered
 * text, so hooks and event handlers would add moving parts without adding a
 * single assertion. Interaction behavior is covered by each component's own
 * test file.
 */

interface Producto {
  id: string
  nombre: string
  estado: 'activo' | 'sin-stock' | 'discontinuado'
  precio: number
}

const VARIANTE_ESTADO: Record<Producto['estado'], 'success' | 'warning' | 'danger'> = {
  activo: 'success',
  'sin-stock': 'warning',
  discontinuado: 'danger',
}

const ETIQUETA_ESTADO: Record<Producto['estado'], string> = {
  activo: 'Activo',
  'sin-stock': 'Sin stock',
  discontinuado: 'Discontinuado',
}

const PRODUCTOS: Producto[] = [
  { id: '1', nombre: 'Remera basica', estado: 'activo', precio: 8500 },
  { id: '2', nombre: 'Jean recto', estado: 'activo', precio: 21000 },
  { id: '3', nombre: 'Campera de jean', estado: 'sin-stock', precio: 34000 },
  { id: '4', nombre: 'Buzo con capucha', estado: 'activo', precio: 19500 },
  { id: '5', nombre: 'Zapatillas urbanas', estado: 'discontinuado', precio: 45000 },
]

const OPCIONES_ESTADO: Option[] = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'activo', label: 'Activo' },
  { value: 'sin-stock', label: 'Sin stock' },
  { value: 'discontinuado', label: 'Discontinuado' },
]

const columnas: Column<Producto>[] = [
  { key: 'nombre', label: 'Nombre' },
  {
    key: 'estado',
    label: 'Estado',
    align: 'center',
    render: (item) => <Badge variant={VARIANTE_ESTADO[item.estado]}>{ETIQUETA_ESTADO[item.estado]}</Badge>,
  },
  {
    key: 'precio',
    label: 'Precio',
    align: 'right',
    render: (item) => `$${item.precio.toLocaleString('es-AR')}`,
  },
]

const noop = () => {}

export function DesignSystemSurface() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 bg-bg px-6 py-10 text-text">
      <section>
        <h1 className="font-display text-3xl">Sistema de diseño</h1>
        <p className="mt-2 text-muted">
          Referencia de los componentes base, renderizados con datos de ejemplo y verificados en
          ambos temas.
        </p>
      </section>

      <section>
        <h2 className="font-display text-xl text-text">SearchableSelect + FilterBar</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchableSelect
            options={OPCIONES_ESTADO}
            value="todos"
            onChange={noop}
            ariaLabel="Filtrar productos por estado"
          />
          <label className="flex-1">
            <span className="sr-only">Buscar productos por nombre</span>
            <FilterBar value="" onChange={noop} placeholder="Buscar productos…" />
          </label>
          {/*
            text-text y no text-terracota: el terracota no llega a AA como
            texto chico suelto sobre el fondo claro (~3.2:1). El acento queda
            solo en la decoracion del subrayado.
          */}
          <button
            type="button"
            className="whitespace-nowrap text-sm font-semibold text-text underline decoration-terracota underline-offset-2"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-text">Table</h2>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={false} readOnly />
            Simular carga
          </label>
        </div>
        <div className="mt-4 rounded-md border border-border bg-card">
          <Table columns={columnas} data={PRODUCTOS} getRowId={(item) => item.id} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-text">EmptyState</h2>
        <div className="mt-4 rounded-md border border-border bg-card">
          <EmptyState
            title="No hay pedidos pendientes"
            description="Los pedidos nuevos aparecen acá apenas entran."
            cta={{ label: 'Crear pedido', onClick: noop }}
          />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-text">Badge</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="info">Info</Badge>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-text">Skeleton</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton width="60%" height="1.5rem" />
          <Skeleton width="100%" height="1rem" />
          <Skeleton width="40%" height="2.5rem" />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-text">ConfirmDialog</h2>
        {/* text-sidebar y no text-bg — ver la nota de contraste en Badge.tsx. */}
        <button
          type="button"
          className="mt-4 rounded-md bg-pink-strong px-4 py-2 text-sm font-semibold text-sidebar"
        >
          Eliminar producto
        </button>
        {/*
          Abierto a proposito. En `/demo` el dialogo arrancaba cerrado, asi
          que su texto nunca pasaba por el walker: la variante `danger` del
          confirm era la unica superficie del sistema sin medir.
        */}
        <ConfirmDialog
          open
          title="¿Eliminar este producto?"
          description="Esta acción no se puede deshacer."
          variant="danger"
          confirmLabel="Eliminar"
          onConfirm={noop}
          onCancel={noop}
        />
      </section>
    </main>
  )
}
