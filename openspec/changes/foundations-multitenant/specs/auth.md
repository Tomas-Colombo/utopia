# Spec: Auth

**Capability**: auth
**Change**: foundations-multitenant
**Status**: Draft

## 1. Purpose

Provide Supabase-Auth-backed login, a secure password-change flow with current-password re-verification, and a per-user settings screen for every role — closing two explicitly documented prior-project gaps (Anexo "Pendientes").

## 2. Requirements (RFC 2119)

### 2.1 Login
- REQ-AUTH-01: The system MUST authenticate users via Supabase Auth (`@supabase/ssr`) using session cookies.
- REQ-AUTH-02: On successful login, the session's JWT MUST carry a custom `tenant_id` claim identifying the user's tenant.
- REQ-AUTH-03: The `tenant_id` claim MUST be set by an Auth Hook at user-creation time (decision 4), not derived client-side.
- REQ-AUTH-04: The `Usuario` profile table MUST reference `auth.users(id)` and carry idTenant, email, nombreCompleto, idRol, estadoUsuario.

### 2.2 Password Change
- REQ-AUTH-05: The password-change flow MUST call `signInWithPassword` with the CURRENT password to re-verify identity BEFORE calling `updateUser({ password })`.
- REQ-AUTH-06: If current-password re-verification fails, the request MUST be rejected and `updateUser` MUST NOT be called.
- REQ-AUTH-07: New passwords MUST meet Supabase's minimum length/complexity defaults; validation errors MUST be surfaced to the user.

### 2.3 Per-User Settings
- REQ-AUTH-08: Every authenticated user, regardless of role, MUST have access to a personal settings/profile screen including password change.
- REQ-AUTH-09: The settings screen MUST be reachable from the user's profile menu on every app screen.

### 2.4 Claim Enforcement
- REQ-AUTH-10: The DAL MUST reject any request whose JWT is missing the `tenant_id` claim; it MUST NOT fall back to an unscoped or first-available tenant.

## 3. Scenarios

### 3.1 Successful login
- **Given** a user has valid credentials for tenant "acme"
- **When** the user submits the login form
- **Then** a session MUST be established AND the JWT MUST contain `tenant_id = acme`

### 3.2 Wrong password rejected
- **Given** a user enters an incorrect password
- **When** login is attempted
- **Then** login MUST fail with an auth error and no session MUST be created

### 3.3 Password change with correct current password
- **Given** an authenticated user submits the correct current password + a new password
- **When** the change is submitted
- **Then** `signInWithPassword` MUST succeed, `updateUser({password})` MUST run, and the new password MUST work on next login

### 3.4 Password change with wrong current password
- **Given** an authenticated user submits an incorrect current password
- **When** the change is submitted
- **Then** `signInWithPassword` MUST fail, `updateUser` MUST NOT be called, and the old password MUST remain valid

### 3.5 JWT missing tenant_id claim
- **Given** a JWT reaches the DAL without a `tenant_id` claim
- **When** a data request is processed
- **Then** the DAL MUST reject the request

### 3.6 Settings screen accessible to every role
- **Given** users with different roles (owner, employee)
- **When** each opens their profile menu
- **Then** both MUST see and be able to open the settings screen

## 4. Data / Contracts
- `Usuario(idUsuario uuid PK, idTenant uuid FK, email text, nombreCompleto text, idRol uuid FK→Rol, estadoUsuario enum)` — no password column.
- JWT custom claim: `tenant_id: uuid`.

## 5. Non-Functional Requirements
- Security: current-password re-verification is non-negotiable (decision 5, prior-project gap).
- Theming: the settings screen MUST work in both light and dark themes (brief §6.1).

## 6. Out of Scope
- Password reset / forgot-password email flow.
- Multi-factor authentication.
- Role/permission editing (`access-guard.md`, `administration.md`).

## 7. Traceability
- Proposal decision: 4 (JWT claim strategy), 5 (password re-verify)
- Brief section: §3.1, §6.1, Anexo "Pendientes"
- Planificacion etapa: 2
</content>
