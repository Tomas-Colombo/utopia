'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/mi-cuenta', label: 'Resumen', exact: true },
  { href: '/mi-cuenta/stock', label: 'Mi stock' },
  { href: '/mi-cuenta/ventas', label: 'Mis ventas' },
  { href: '/mi-cuenta/liquidaciones', label: 'Liquidaciones' },
  { href: '/mi-cuenta/declaraciones', label: 'Declaraciones' },
]

export function PortalNav() {
  const pathname = usePathname()

  return (
    <nav className="flex overflow-x-auto gap-2 border-b border-border pb-1 pt-2 -mx-4 px-4 sm:mx-0 sm:px-0">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`min-h-[44px] inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-accent text-accent-contrast shadow-sm'
                : 'text-muted hover:text-text hover:bg-card-hover'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
