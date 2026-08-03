'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Pagination } from '@/components/ui/Pagination'

/**
 * Wrapper del `<Pagination>` del listado de ventas: mueve sólo `pagina` y
 * preserva el filtro de período (`desde`/`hasta`), que también vive en la URL.
 */
export function VentasPaginacion({
  page,
  pageSize,
  total,
}: {
  page: number
  pageSize: number
  total: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, start] = useTransition()

  function onPageChange(next: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (next <= 1) params.delete('pagina')
    else params.set('pagina', String(next))
    const qs = params.toString()
    start(() => router.push(qs ? `/ventas?${qs}` : '/ventas'))
  }

  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={onPageChange}
      disabled={pending}
    />
  )
}
