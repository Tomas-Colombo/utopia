import { redirect } from 'next/navigation'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'

/**
 * Gate del módulo Inventario. Doble chequeo (REQ-AG-03): módulo habilitado
 * para el tenant Y permiso `ver` en el rol del usuario. Fail-closed:
 *   - no-session       → /login
 *   - module-disabled  → /?e=module-disabled
 *   - no-permission    → /?e=no-permission
 */
export default async function InventarioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await verifySession()
  try {
    await requireModuleRole(session, 'inventario', 'ver')
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.reason === 'no-session') redirect('/login')
      redirect(`/?e=${error.reason}`)
    }
    throw error
  }

  return <>{children}</>
}
