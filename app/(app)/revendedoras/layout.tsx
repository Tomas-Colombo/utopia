import { ReactNode } from 'react'
import { verifySession } from '@/lib/dal/session'
import { requireModuleRole } from '@/lib/dal/guard'

export default async function RevendedorasLayout({ children }: { children: ReactNode }) {
  const session = await verifySession()
  await requireModuleRole(session, 'revendedoras', 'ver')

  return <>{children}</>
}
