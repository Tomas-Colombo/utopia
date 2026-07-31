'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { logoutAction } from '@/app/(app)/actions'

export interface SidebarNavItem {
  href: string
  label: string
  icon: string
}

const STORAGE_KEY = 'utopia-sidebar-collapsed'

/**
 * Presentational shell of the primary navigation. Receives the ALREADY
 * permission-filtered nav items from the server `Sidebar` — it never imports
 * the guard (which pulls `next/headers`) so this stays a clean client
 * component.
 *
 * Renders TWO surfaces:
 *   - Desktop (`md+`): a persistent, collapsible `<aside>` rail.
 *   - Mobile (`< md`): a fixed hamburger button that opens a slide-in drawer,
 *     since the rail is hidden on small screens.
 */
export function SidebarClient({
  items,
  email,
  rolNombre,
}: {
  items: SidebarNavItem[]
  email: string
  rolNombre: string | null
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Sync persisted collapse preference after mount only (SSR-safe — same
  // pattern as ThemeProvider). Server renders the expanded default.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external-store sync on mount, not a derived-state anti-pattern
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  // Close the mobile drawer on route change so a tap-through never leaves it open.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // While the drawer is open: close on Escape and lock body scroll.
  useEffect(() => {
    if (!mobileOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={`hidden md:flex md:shrink-0 md:flex-col md:sticky md:top-0 h-screen bg-sidebar text-[color:var(--card)] transition-[width] duration-200 ${
          collapsed ? 'md:w-16' : 'md:w-60'
        }`}
        aria-label="Navegación principal"
      >
        <div
          className={`flex items-center gap-2 border-b border-white/10 py-6 ${
            collapsed ? 'justify-center px-2' : 'px-6'
          }`}
        >
          {!collapsed && (
            <span className="flex-1 font-display text-xl tracking-tight" aria-label="Utopia">
              UTOPIA
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Minimizar barra lateral'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expandir' : 'Minimizar'}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <ChevronIcon direction={collapsed ? 'right' : 'left'} />
          </button>
        </div>
        <NavContent
          items={items}
          pathname={pathname}
          collapsed={collapsed}
          email={email}
          rolNombre={rolNombre}
        />
      </aside>

      {/* Mobile hamburger — only below md, where the rail is hidden */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        aria-expanded={mobileOpen}
        aria-controls="mobile-nav-drawer"
        className="fixed left-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-text shadow-sm hover:bg-card-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink md:hidden"
      >
        <MenuIcon />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navegación"
            className="absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col bg-sidebar text-[color:var(--card)] shadow-xl"
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-6 py-6">
              <span className="flex-1 font-display text-xl tracking-tight" aria-label="Utopia">
                UTOPIA
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
              >
                <CloseIcon />
              </button>
            </div>
            <NavContent
              items={items}
              pathname={pathname}
              collapsed={false}
              email={email}
              rolNombre={rolNombre}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}

/** Shared nav list + footer (email/rol + logout), used by both surfaces. */
function NavContent({
  items,
  pathname,
  collapsed,
  email,
  rolNombre,
  onNavigate,
}: {
  items: SidebarNavItem[]
  pathname: string
  collapsed: boolean
  email: string
  rolNombre: string | null
  onNavigate?: () => void
}) {
  return (
    <>
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-4">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex items-center gap-3 rounded-md py-2 text-sm font-medium hover:bg-white/5 focus:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink ${
                    active ? 'bg-white/10' : ''
                  } ${collapsed ? 'justify-center px-0' : 'px-3'}`}
                >
                  <span className="shrink-0" aria-hidden>
                    <NavIcon name={item.icon} />
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            )
          })}
          {items.length === 0 && !collapsed && (
            <li className="px-3 py-2 text-xs text-white/60">Sin módulos habilitados</li>
          )}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-2 py-4 text-xs">
        {!collapsed && (
          <div className="space-y-1 px-3 py-2">
            <div className="truncate text-white/80">{email}</div>
            <div className="text-white/50">{rolNombre ?? 'Sin rol asignado'}</div>
          </div>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? 'Cerrar sesión' : undefined}
            aria-label="Cerrar sesión"
            className={`mt-1 flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink ${
              collapsed ? 'justify-center px-0' : 'px-3'
            }`}
          >
            <span className="shrink-0" aria-hidden>
              <LogoutIcon />
            </span>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </form>
      </div>
    </>
  )
}

// ─── Icons (inline SVG, no external dependency) ──────────────────────

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {direction === 'left' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

const NAV_ICONS: Record<string, ReactNode> = {
  inventario: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" />
      <path d="M10 12h4" />
    </>
  ),
  precios: (
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <circle cx="7" cy="7" r="1.2" />
    </>
  ),
  ventas: (
    <>
      <circle cx="9" cy="21" r="1.2" />
      <circle cx="18" cy="21" r="1.2" />
      <path d="M3 3h2l2.4 12.4a1 1 0 001 .8h9.7a1 1 0 001-.8L21 7H6" />
    </>
  ),
  clientes: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </>
  ),
  consignaciones: (
    <>
      <path d="M7 21l-4-4 4-4" />
      <path d="M3 17h13" />
      <path d="M17 3l4 4-4 4" />
      <path d="M21 7H8" />
    </>
  ),
  rendiciones: (
    <>
      <path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h6" />
    </>
  ),
  gastos: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14" r="1.2" />
    </>
  ),
  reportes: (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="12" y="8" width="3" height="10" />
      <rect x="17" y="5" width="3" height="13" />
    </>
  ),
  administracion: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </>
  ),
}

function NavIcon({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {NAV_ICONS[name] ?? null}
    </svg>
  )
}
