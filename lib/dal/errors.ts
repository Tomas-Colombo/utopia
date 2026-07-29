export type AuthorizationErrorReason =
  | 'no-session'
  | 'no-permission'
  | 'module-disabled'
  | 'tenant-mismatch'

/**
 * Fail-closed DAL error (design §7). Every guard/session check throws this
 * instead of returning a falsy value, so a missing catch never silently
 * grants access (REQ-AUTH-10, REQ-AG-05).
 */
export class AuthorizationError extends Error {
  reason: AuthorizationErrorReason

  constructor(reason: AuthorizationErrorReason) {
    super(reason)
    this.name = 'AuthorizationError'
    this.reason = reason
  }
}
