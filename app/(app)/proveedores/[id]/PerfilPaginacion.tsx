'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Pagination } from '@/components/ui/Pagination'

/**
 * Wrapper del `<Pagination>` que actualiza SOLO el parámetro de página de
 * su tabla (ing_page / cons_page / rend_page), preservando el filtro de
 * fechas y los `page` de las otras tablas.
 */
export function PerfilPaginacion({
  id,
  paramKey,
  page,
  pageSize,
  total,
}: {
  id: string
  paramKey: 'ing_page' | 'cons_page' | 'rend_page'
  page: number
  pageSize: number
  total: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, start] = useTransition()

  function onPageChange(next: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (next <= 1) params.delete(paramKey)
    else params.set(paramKey, String(next))
    const qs = params.toString()
    start(() => {
      router.push(qs ? `/proveedores/${id}?${qs}` : `/proveedores/${id}`)
    })
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
