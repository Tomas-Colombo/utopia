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

  // Role name display deferred to Slice 8 (guard work adds rolId/role name
  // to `Session`) — literal placeholder per this slice's explicit scope.
  return <SettingsView email={session.user.email} roleName="—" />
}
