# Spec: Administration

**Capability**: administration
**Change**: foundations-multitenant
**Status**: Draft

## 1. Purpose

Provide an Administración module — invisible to the main business navigation — centralizing user CRUD (invite, edit, soft-delete, role assignment, credential reset) and a Configuracion sections skeleton, under the same RLS and guard rules as any other tenant data (brief §5-Administración).

## 2. Requirements (RFC 2119)

### 2.1 Route Isolation
- REQ-ADM-01: The Administración route group MUST NOT appear in the main business navigation/sidebar.
- REQ-ADM-02: Access to any Administración route MUST pass through `requireModuleRole` for an "administracion" module + appropriate action.

### 2.2 User CRUD
- REQ-ADM-03: The system MUST support creating a user via a Supabase Auth invite, provisioning a corresponding `Usuario` profile row with idTenant and idRol set.
- REQ-ADM-04: A newly created user's Auth Hook MUST set the JWT `tenant_id` claim so the user can authenticate correctly on first login.
- REQ-ADM-05: The system MUST support editing a user's nombreCompleto and idRol.
- REQ-ADM-06: The system MUST support deactivating a user via soft delete (`estadoUsuario`), never a hard DELETE.
- REQ-ADM-07: A deactivated user MUST NOT be able to log in or access any tenant data.
- REQ-ADM-08: The system MUST support resetting a user's credentials from the admin UI.

### 2.3 Configuracion Skeleton
- REQ-ADM-09: The system MUST provide a CRUD skeleton over the `Configuracion` key/value table, organized by `seccion`.

### 2.4 Guarding
- REQ-ADM-10: Every Administración mutation MUST call `logAudit`.

## 3. Scenarios

### 3.1 Admin creates a user who can then log in
- **Given** an admin with permission invites a new user for tenant "acme"
- **When** the invite completes and the user sets a password
- **Then** the user MUST be able to log in AND their JWT MUST carry `tenant_id = acme`

### 3.2 Role edit takes effect on next login
- **Given** an admin changes a user's role from "vendedor" to "dueño"
- **When** the user logs in again
- **Then** the session MUST reflect the new role's permisos

### 3.3 Deactivated user cannot log in
- **Given** an admin deactivates a user
- **When** that user attempts to log in
- **Then** login MUST be rejected

### 3.4 Non-admin blocked from Administración
- **Given** an authenticated user lacks the "administracion" module/role permission
- **When** the user navigates to an Administración route
- **Then** the system MUST respond 403 or redirect, never render admin content

### 3.5 Administración hidden from main navigation
- **Given** a business (non-admin-context) user is on the main app
- **When** the main sidebar renders
- **Then** no Administración link MUST appear

### 3.6 User mutation is audited
- **Given** an admin edits a user's role
- **When** the edit commits
- **Then** an Auditoria row MUST record the change (entidad="Usuario", before/after idRol)

## 4. Data / Contracts

Reuses `Usuario`, `Rol`, `Configuracion`, `Auditoria` schemas defined in `multi-tenant-data.md`, `auth.md`, `access-guard.md`, `audit-log.md`. No new tables owned by this capability.

## 5. Non-Functional Requirements
- Security: double guard + RLS apply identically to admin routes — no privileged bypass.
- UI: MUST follow the same base components, theming, and filter patterns as the rest of the app (brief §6.1).

## 6. Out of Scope
- General system-wide Configuracion content beyond the CRUD skeleton.
- Creating new Rol definitions (assigning an existing Rol is in scope; Rol authoring may be a later refinement).
- Dedicated audit-log viewer UI (query API exists per `audit-log.md`).

## 7. Traceability
- Proposal decision: 3, 4, 5 (permisos, JWT claim, password flow reused here)
- Brief section: §5-Administración
- Planificacion etapa: 2
</content>
