import { NextRequest } from 'next/server'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { config, proxy } from './proxy'

function requestWithHost(host: string, pathname = '/') {
  return new NextRequest(`http://placeholder.invalid${pathname}`, {
    headers: { host },
  })
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
  delete process.env.UTOPIA_ROOT_DOMAIN
  delete process.env.UTOPIA_ROOT_DOMAIN_DEV
})

describe('proxy — tenant resolution (design §6, spec tenant-resolution.md)', () => {
  it.each(['www', 'admin', 'api', 'app'])(
    'routes reserved subdomain "%s" to landing without injecting a tenant header (REQ-TR-09)',
    (reserved) => {
      const response = proxy(requestWithHost(`${reserved}.utopia.app`))

      expect(response.headers.get('x-middleware-override-headers')).toBeNull()
      expect(response.headers.get('x-middleware-request-x-utopia-tenant-subdomain')).toBeNull()
    },
  )

  it('routes a missing subdomain (bare production root domain) to landing (REQ-TR-11)', () => {
    const response = proxy(requestWithHost('utopia.app'))

    expect(response.headers.get('x-middleware-request-x-utopia-tenant-subdomain')).toBeNull()
  })

  it('routes a missing subdomain (bare dev root domain, with port) to landing', () => {
    const response = proxy(requestWithHost('localhost:3000'))

    expect(response.headers.get('x-middleware-request-x-utopia-tenant-subdomain')).toBeNull()
  })

  it('sets x-utopia-tenant-subdomain for a valid production subdomain (REQ-TR-04)', () => {
    const response = proxy(requestWithHost('acme.utopia.app'))

    expect(response.headers.get('x-middleware-request-x-utopia-tenant-subdomain')).toBe('acme')
  })

  it('sets x-utopia-tenant-subdomain for a valid *.localhost dev subdomain without /etc/hosts edits (REQ-TR-08)', () => {
    const response = proxy(requestWithHost('acme.localhost:3000'))

    expect(response.headers.get('x-middleware-request-x-utopia-tenant-subdomain')).toBe('acme')
  })

  it('resolves the production root domain from UTOPIA_ROOT_DOMAIN when set', async () => {
    // ROOT_PROD/ROOT_DEV are read once at module-eval time (design §6), so a
    // fresh module instance is required to pick up an env var set after the
    // initial static import above.
    process.env.UTOPIA_ROOT_DOMAIN = 'utopia-custom.app'
    vi.resetModules()
    const { proxy: proxyWithCustomRoot } = await import('./proxy')

    const response = proxyWithCustomRoot(requestWithHost('acme.utopia-custom.app'))

    expect(response.headers.get('x-middleware-request-x-utopia-tenant-subdomain')).toBe('acme')
  })
})

describe('proxy config.matcher — excludes _next, api/health, and static assets', () => {
  it('does NOT match /_next/static assets', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/_next/static/chunk.js' })).toBe(false)
  })

  it('does NOT match /_next/image', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/_next/image' })).toBe(false)
  })

  it('does NOT match /api/health', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/api/health' })).toBe(false)
  })

  it('does NOT match static files with an extension (e.g. favicon.ico)', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/favicon.ico' })).toBe(false)
  })

  it('matches an ordinary app route', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/dashboard' })).toBe(true)
  })
})
