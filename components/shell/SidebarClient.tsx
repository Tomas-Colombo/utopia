'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { logoutAction } from '@/app/(app)/actions'
import { ThemeToggle } from '@/components/theming/ThemeToggle'
import { Logo } from './Logo'

export interface SidebarNavItem {
  href: string
  label: string
  icon: string
}

export interface SidebarNavGroup {
  /** Mono, letter-spaced section heading (GENERAL, OPERACIONES, …). */
  label: string
  items: SidebarNavItem[]
}

const STORAGE_KEY = 'utopia-sidebar-collapsed'

/**
 * Presentational shell of the primary navigation. Receives the ALREADY
 * permission-filtered nav groups from the server `Sidebar` — it never imports
 * the guard (which pulls `next/headers`) so this stays a clean client
 * component.
 *
 * Renders TWO surfaces:
 *   - Desktop (`md+`): a persistent, collapsible `<aside>` rail.
 *   - Mobile (`< md`): a fixed hamburger button that opens a slide-in drawer,
 *     since the rail is hidden on small screens.
 */
export function SidebarClient({
  groups,
  email,
  rolNombre,
}: {
  groups: SidebarNavGroup[]
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
        className={`hidden h-screen bg-sidebar text-[#8b8681] transition-[width] duration-200 md:sticky md:top-0 md:flex md:shrink-0 md:flex-col ${
          collapsed ? 'md:w-[72px]' : 'md:w-[252px]'
        }`}
        aria-label="Navegación principal"
      >
        <div
          className={`flex items-center gap-2 px-5 pb-5 pt-[22px] ${
            collapsed ? 'flex-col justify-center px-2' : ''
          }`}
        >
          <Logo compact={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Minimizar barra lateral'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expandir' : 'Minimizar'}
            className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#6f6c67] transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rosa md:ml-auto"
          >
            <ChevronIcon direction={collapsed ? 'right' : 'left'} />
          </button>
        </div>
        <NavContent
          groups={groups}
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
        className="fixed left-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-md border border-line-2 bg-panel text-ink shadow-sm hover:bg-panel-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-rosa md:hidden"
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
            className="absolute inset-y-0 left-0 flex w-[252px] max-w-[80%] flex-col bg-sidebar text-[#8b8681] shadow-xl"
          >
            <div className="flex items-center gap-2 px-5 pb-5 pt-[22px]">
              <Logo />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6f6c67] transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rosa"
              >
                <CloseIcon />
              </button>
            </div>
            <NavContent
              groups={groups}
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

/** Shared nav list + footer (user chip + logout), used by both surfaces. */
function NavContent({
  groups,
  pathname,
  collapsed,
  email,
  rolNombre,
  onNavigate,
}: {
  groups: SidebarNavGroup[]
  pathname: string
  collapsed: boolean
  email: string
  rolNombre: string | null
  onNavigate?: () => void
}) {
  const isEmpty = groups.every((group) => group.items.length === 0)

  // Nested items ('/inventario/ingresos') prefix-match their parent
  // ('/inventario'), so both would light up. Only the longest matching href
  // wins — the most specific item is the one the user is actually on.
  const activeHref = groups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .reduce<string | null>(
      (best, item) => (best === null || item.href.length > best.length ? item.href : best),
      null,
    )

  return (
    <>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-0.5">
        {groups.map((group) => (
          <div key={group.label}>
            {collapsed ? (
              // A letter-spaced heading is unreadable at 72px, so the collapsed
              // rail keeps the grouping as a hairline rule instead of dropping it.
              <div className="mx-2 my-3 h-px bg-white/10" aria-hidden />
            ) : (
              <div className="px-3 pb-[7px] pt-4 font-mono text-[9.5px] tracking-[0.2em] text-[#5c5a56]">
                {group.label}
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = activeHref === item.href
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      aria-label={item.label}
                      className={`flex items-center gap-[11px] rounded-md py-2.5 text-[13.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rosa ${
                        active
                          ? 'bg-rosa font-semibold text-[#131312]'
                          : 'font-medium text-[#8b8681] hover:bg-white/5 hover:text-[#e8e3db]'
                      } ${collapsed ? 'justify-center px-0' : 'px-[13px]'}`}
                    >
                      <span className="shrink-0" aria-hidden>
                        <NavIcon name={item.icon} />
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        {isEmpty && !collapsed && (
          <p className="px-3 py-2 text-xs text-[#6f6c67]">Sin módulos habilitados</p>
        )}
      </nav>

      <div className="border-t border-[#262523] px-3 py-3.5">
        <div className={`flex items-center gap-[11px] ${collapsed ? 'justify-center' : ''}`}>
          <span
            aria-hidden
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full font-display text-[13px] text-[#131312]"
            style={{ background: 'linear-gradient(135deg,#E9A6BC,#c97e97)' }}
          >
            {initialOf(email)}
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-[1.25]">
              <span className="block truncate text-[12.5px] font-semibold text-[#efeae2]">
                {email}
              </span>
              <span className="block truncate font-mono text-[9.5px] uppercase text-[#6f6c67]">
                {rolNombre ?? 'Sin rol asignado'}
              </span>
            </span>
          )}
        </div>
        <ThemeToggle collapsed={collapsed} />
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? 'Cerrar sesión' : undefined}
            aria-label="Cerrar sesión"
            className={`mt-1 flex w-full items-center gap-[11px] rounded-md py-2 text-[13px] font-medium text-[#8b8681] transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rosa ${
              collapsed ? 'justify-center px-0' : 'px-[13px]'
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

/** First letter of the local part of the email, uppercased. */
function initialOf(email: string): string {
  return (email.trim()[0] ?? '?').toUpperCase()
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
  ingresos: (
    <>
      <path d="M12 3v9" />
      <path d="M8.5 8.5L12 12l3.5-3.5" />
      <path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" />
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
  proveedores: (
    <>
      <path d="M3 7h13l3 4h2v6h-2" />
      <path d="M3 7v10h2" />
      <circle cx="8" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {NAV_ICONS[name] ?? null}
    </svg>
  )
}
