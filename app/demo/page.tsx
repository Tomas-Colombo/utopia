import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { DemoInteractive, type Product } from './DemoInteractive'

const SAMPLE_PRODUCTS: Product[] = [
  { id: '1', name: 'Basic T-shirt', status: 'active', price: 8500 },
  { id: '2', name: 'Straight-leg jeans', status: 'active', price: 21000 },
  { id: '3', name: 'Denim jacket', status: 'out-of-stock', price: 34000 },
  { id: '4', name: 'Hoodie', status: 'active', price: 19500 },
  { id: '5', name: 'Urban sneakers', status: 'discontinued', price: 45000 },
]

/**
 * Etapa 0 closer (REQ-DS-16/17/18). Renders all 7 base components with
 * sample data in the active theme. Server Component wrapper; interactive
 * pieces live in `DemoInteractive` (`'use client'`).
 */
export default function DemoPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 bg-bg px-6 py-10 text-text">
      <section>
        <h1 className="font-display text-3xl">Design System Demo</h1>
        <p className="mt-2 text-muted">
          A living reference of the 7 base components delivered in Etapa 0, rendered with sample
          data and verified in both themes.
        </p>
      </section>

      <DemoInteractive products={SAMPLE_PRODUCTS} />

      <section>
        <h2 className="font-display text-xl">Badge variants</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="danger">Danger</Badge>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="info">Info</Badge>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl">Skeleton</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton width="60%" height="1.5rem" />
          <Skeleton width="100%" height="1rem" />
          <Skeleton width="40%" height="2.5rem" />
        </div>
      </section>
    </main>
  )
}
