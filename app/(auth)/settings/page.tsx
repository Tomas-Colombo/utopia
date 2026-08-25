import { redirect } from 'next/navigation'
import { AuthorizationError } from '@/lib/dal/errors'
import { verifySession } from '@/lib/dal/session'
import { SettingsView } from './SettingsView'

export default async function SettingsPage() {
  let session: Awaited<ReturnType<typeof verifySession>>
  try {
    session = await verifySession()
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect('/login')
    }
    throw error
  }

  // The panel used to live in the auth layout. It moved here when login went
  // card-less, so this view keeps exactly the surface it always had.
  //
  // `rolNombre` is null when the `usuario` row has no role assigned yet —
  // `verifySession` deliberately does not fail on that, so the screen has to
  // say something honest instead of rendering an empty cell.
  return (
    <div className="w-full rounded-md border border-border bg-card p-8 shadow-sm">
      <SettingsView email={session.user.email} roleName={session.rolNombre ?? 'No role assigned'} />
    </div>
  )
}
