import { redirect } from 'next/navigation'
import { AuthorizationError } from '@/lib/dal/errors'
import { requireModuleRole } from '@/lib/dal/guard'
import { verifySession } from '@/lib/dal/session'

// Gastos vive bajo el módulo 'rendiciones' (decisión previa: no hay
// módulo 'gastos' separado en el catálogo seed; se agrupa con
// rendiciones porque ambos son cuentas financieras).
export default async function GastosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await verifySession()
  try {
    await requireModuleRole(session, 'rendiciones', 'ver')
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.reason === 'no-session') redirect('/login')
      redirect(`/?e=${error.reason}`)
    }
    throw error
  }
  return <>{children}</>
}
