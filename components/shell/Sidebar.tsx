import Link from 'next/link'
import type { Session } from '@/lib/dal/session'
import { hasPermission } from '@/lib/dal/guard'

/**
 * Left sidebar (dark in both themes, per REQ-DS-07).
 *
 * Only shows modules the current role can at least `ver`. Actual route
 * protection still lives in each route's `layout.tsx` via
 * `requireModuleRole()` — this component only decides visibility.
 */

interface NavItem {
  href: string
  label: string
  moduloCodigo: string
}

// Módulo codes MUST match seed.sql `modulo.codigo` values verbatim.
// See supabase/seed.sql — catalog is: inventario, ventas, precios,
// consignaciones, rendiciones, reportes, administracion.
// `gastos` currently lives under `rendiciones` per Etapa 7 grouping;
// promote to its own module later if needed.
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/inventario', label: 'Inventario', moduloCodigo: 'inventario' },
  { href: '/precios', label: 'Precios', moduloCodigo: 'precios' },
  { href: '/ventas', label: 'Ventas', moduloCodigo: 'ventas' },
  // Clientes vive bajo el módulo 'ventas' (mismo permiso) — es sub-módulo funcional.
  { href: '/clientes', label: 'Clientes', moduloCodigo: 'ventas' },
  { href: '/consignaciones', label: 'Consignaciones', moduloCodigo: 'consignaciones' },
  { href: '/rendiciones', label: 'Rendiciones', moduloCodigo: 'rendiciones' },
  // Gastos vive bajo el módulo 'rendiciones' (mismo permiso).
  { href: '/gastos', label: 'Gastos', moduloCodigo: 'rendiciones' },
  { href: '/reportes', label: 'Reportes', moduloCodigo: 'reportes' },
  { href: '/administracion', label: 'Administración', moduloCodigo: 'administracion' },
] as const

export function Sidebar({ session }: { session: Session }) {
  const visible = NAV_ITEMS.filter((item) =>
    hasPermission(session, item.moduloCodigo, 'ver'),
  )

  return (
    <aside
      className="hidden md:flex md:w-60 md:shrink-0 md:flex-col bg-sidebar text-[color:var(--card)] min-h-screen"
      aria-label="Navegación principal"
    >
      <div className="px-6 py-6 border-b border-white/10">
        <span
          className="font-display text-xl tracking-tight"
          aria-label="Utopia"
        >
          UTOPIA
        </span>
      </div>
      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {visible.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-white/5 focus:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
              >
                {item.label}
              </Link>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-3 py-2 text-xs text-white/60">
              Sin módulos habilitados
            </li>
          )}
        </ul>
      </nav>
      <div className="px-3 py-4 border-t border-white/10 text-xs">
        <div className="px-3 py-2 space-y-1">
          <div className="truncate text-white/80">{session.user.email}</div>
          <div className="text-white/50">
            {session.rolNombre ?? 'Sin rol asignado'}
          </div>
        </div>
      </div>
    </aside>
  )
}
