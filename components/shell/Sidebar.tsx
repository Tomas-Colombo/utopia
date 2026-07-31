import type { Session } from '@/lib/dal/session'
import { hasPermission } from '@/lib/dal/guard'
import { SidebarClient, type SidebarNavItem } from './SidebarClient'

/**
 * Left sidebar (dark in both themes, per REQ-DS-07).
 *
 * Server component: computes which modules the role can at least `ver` and
 * hands the filtered list to the client `SidebarClient` (collapse UI +
 * logout). Permission filtering MUST stay here — `hasPermission` comes from
 * the guard, which imports `next/headers`; importing it into a client
 * component would poison the client bundle. Route protection still lives in
 * each route's `layout.tsx` via `requireModuleRole()`.
 */

interface NavItem extends SidebarNavItem {
  moduloCodigo: string
}

// Módulo codes MUST match seed.sql `modulo.codigo` values verbatim.
// See supabase/seed.sql — catalog is: inventario, ventas, precios,
// consignaciones, rendiciones, reportes, administracion.
// `gastos` currently lives under `rendiciones` per Etapa 7 grouping;
// promote to its own module later if needed.
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/inventario', label: 'Inventario', icon: 'inventario', moduloCodigo: 'inventario' },
  { href: '/precios', label: 'Precios', icon: 'precios', moduloCodigo: 'precios' },
  { href: '/ventas', label: 'Ventas', icon: 'ventas', moduloCodigo: 'ventas' },
  // Clientes vive bajo el módulo 'ventas' (mismo permiso) — es sub-módulo funcional.
  { href: '/clientes', label: 'Clientes', icon: 'clientes', moduloCodigo: 'ventas' },
  { href: '/consignaciones', label: 'Consignaciones', icon: 'consignaciones', moduloCodigo: 'consignaciones' },
  { href: '/rendiciones', label: 'Rendiciones', icon: 'rendiciones', moduloCodigo: 'rendiciones' },
  // Gastos vive bajo el módulo 'rendiciones' (mismo permiso).
  { href: '/gastos', label: 'Gastos', icon: 'gastos', moduloCodigo: 'rendiciones' },
  { href: '/reportes', label: 'Reportes', icon: 'reportes', moduloCodigo: 'reportes' },
  { href: '/administracion', label: 'Administración', icon: 'administracion', moduloCodigo: 'administracion' },
] as const

export function Sidebar({ session }: { session: Session }) {
  const visible: SidebarNavItem[] = NAV_ITEMS.filter((item) =>
    hasPermission(session, item.moduloCodigo, 'ver'),
  ).map(({ href, label, icon }) => ({ href, label, icon }))

  return (
    <SidebarClient
      items={visible}
      email={session.user.email}
      rolNombre={session.rolNombre}
    />
  )
}
