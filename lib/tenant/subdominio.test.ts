import { describe, expect, it } from 'vitest'
import {
  RESERVED_SUBDOMINIOS,
  SUBDOMINIO_REASON_LABEL,
  validarSubdominio,
} from './subdominio'

describe('validarSubdominio — shape', () => {
  it.each(['acme', 'boutique-alfa', 'a1b', 'tienda123', 'x'.repeat(63)])(
    'accepts "%s"',
    (sub) => {
      expect(validarSubdominio(sub)).toEqual({ ok: true })
    },
  )

  it('rejects an empty subdomain', () => {
    expect(validarSubdominio('')).toEqual({ ok: false, reason: 'vacio' })
  })

  it('rejects a subdomain shorter than 3 characters', () => {
    expect(validarSubdominio('ab')).toEqual({ ok: false, reason: 'muy-corto' })
  })

  it('rejects a subdomain longer than the 63-char DNS label limit', () => {
    expect(validarSubdominio('x'.repeat(64))).toEqual({ ok: false, reason: 'muy-largo' })
  })

  it.each([
    ['uppercase (Host headers are case-insensitive)', 'Acme'],
    ['a leading hyphen (invalid DNS label)', '-acme'],
    ['a trailing hyphen (invalid DNS label)', 'acme-'],
    ['a dot (would create a nested subdomain)', 'acme.sub'],
    ['whitespace', 'acme tienda'],
    ['an underscore', 'acme_tienda'],
  ])('rejects %s', (_label, sub) => {
    expect(validarSubdominio(sub)).toEqual({ ok: false, reason: 'formato' })
  })
})

describe('validarSubdominio — reserved subdomains', () => {
  // The whole point of this module: a tenant provisioned on a reserved
  // subdomain gets no `x-utopia-tenant-subdomain` header from the proxy, so
  // `verifyTenantMatch` fails closed and the customer can never log in.
  it.each(RESERVED_SUBDOMINIOS)('rejects the reserved subdomain "%s"', (sub) => {
    expect(validarSubdominio(sub)).toEqual({ ok: false, reason: 'reservado' })
  })

  it('accepts a subdomain that merely contains a reserved word', () => {
    expect(validarSubdominio('appliques')).toEqual({ ok: true })
  })
})

describe('SUBDOMINIO_REASON_LABEL', () => {
  it('has a message for every rejection reason', () => {
    const reasons = ['vacio', 'muy-corto', 'muy-largo', 'formato', 'reservado'] as const
    for (const reason of reasons) {
      expect(SUBDOMINIO_REASON_LABEL[reason]).toBeTruthy()
    }
  })
})
