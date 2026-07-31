import { redirect } from 'next/navigation'

/**
 * El listado de productos ahora vive en la home del módulo (`/inventario`),
 * junto con sus filtros. Esta ruta se conserva para no romper enlaces
 * existentes y redirige, preservando los query params (q, cat, page).
 */
export default async function ProductosPage(props: {
  searchParams: Promise<{ q?: string; cat?: string; page?: string }>
}) {
  const searchParams = await props.searchParams
  const params = new URLSearchParams()
  if (searchParams.q) params.set('q', searchParams.q)
  if (searchParams.cat) params.set('cat', searchParams.cat)
  if (searchParams.page) params.set('page', searchParams.page)
  const qs = params.toString()
  redirect(qs ? `/inventario?${qs}` : '/inventario')
}
