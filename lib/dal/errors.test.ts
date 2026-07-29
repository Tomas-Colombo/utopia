import { describe, expect, it } from 'vitest'
import { AuthorizationError } from './errors'

describe('AuthorizationError', () => {
  it('carries the reason and sets name/message', () => {
    const error = new AuthorizationError('no-session')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('AuthorizationError')
    expect(error.reason).toBe('no-session')
    expect(error.message).toBe('no-session')
  })

  it('supports every reason variant from design §7', () => {
    const reasons = ['no-session', 'no-permission', 'module-disabled', 'tenant-mismatch'] as const

    for (const reason of reasons) {
      expect(new AuthorizationError(reason).reason).toBe(reason)
    }
  })
})
