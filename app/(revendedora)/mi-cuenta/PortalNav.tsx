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
    <nav className="flex overflow-x-auto gap-1 border-b border-line pb-2 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`min-h-[44px] inline-flex items-center px-4 py-2 text-[13.5px] font-medium rounded-md whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
              isActive
                ? 'bg-block text-block-ink font-semibold'
                : 'text-muted hover:text-ink hover:bg-hover'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
