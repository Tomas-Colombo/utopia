# Spec: Access Guard

**Capability**: access-guard
**Change**: foundations-multitenant
**Status**: Draft

## 1. Purpose

Provide a single shared DAL helper enforcing the mandatory double-check — module enabled for the tenant AND role has permission for the action — so no endpoint responds without validating both conditions (brief §1.1, §6.3).

## 2. Requirements (RFC 2119)

### 2.1 Rol Schema
- REQ-AG-01: The system MUST define table `Rol` with idRol (uuid PK), idTenant (uuid FK), nombre (text), permisos (jsonb).
- REQ-AG-02: `Rol.permisos` MUST use the shape `{ [moduloCodigo]: string[] }` (decision 3), e.g. `{ inventario: ["ver","crear","editar"] }`.

### 2.2 Guard Helper
- REQ-AG-03: The system MUST provide a shared DAL function `requireModuleRole(user, moduloCodigo, accion)`.
- REQ-AG-04: The guard MUST verify BOTH: (a) `TenantModulo.habilitado = true` for the tenant+module, AND (b) `permisos[moduloCodigo]?.includes(accion)` for the user's role.
- REQ-AG-05: The guard MUST deny access if EITHER condition is false; neither alone MUST be sufficient.
- REQ-AG-06: The guard MUST be invoked from every Server Action, Route Handler, and Server Component reading or writing tenant-scoped data.

### 2.3 Failure Handling
- REQ-AG-07: On denial, the guard MUST throw a typed authorization error.
- REQ-AG-08: API/Route Handler callers MUST translate a denial into an HTTP 403 response.
- REQ-AG-09: UI callers MUST translate a denial into a redirect or blocked-state render, never a silent no-op or partial dataset leak.

## 3. Scenarios

### 3.1 Authorized action passes
- **Given** the tenant has "inventario" enabled AND the role includes "crear" for "inventario"
- **When** `requireModuleRole(user, "inventario", "crear")` is called
- **Then** it MUST resolve without throwing

### 3.2 Role lacks permission
- **Given** the tenant has "inventario" enabled but the role's permisos do NOT include "crear"
- **When** the guard is called for that action
- **Then** it MUST throw and the caller MUST return 403 (API) or redirect (UI)

### 3.3 Module disabled overrides role permission
- **Given** the role includes "crear" for "inventario", but `TenantModulo.habilitado = false`
- **When** the guard is called
- **Then** it MUST throw 403 despite the role alone allowing it

### 3.4 Guard bypass via direct Server Action call
- **Given** a Server Action reachable despite being excluded by the proxy matcher
- **When** the Server Action executes its DAL logic
- **Then** the DAL-level guard call inside it MUST still enforce the double-check

### 3.5 Missing action string denied by default
- **Given** `accion` is not present in the module's permission list
- **When** the guard is called with that action
- **Then** it MUST deny (fail closed)

## 4. Data / Contracts
- `Rol(idRol uuid PK, idTenant uuid FK, nombre text, permisos jsonb)`
- `requireModuleRole(user: {idUsuario, idTenant, idRol}, moduloCodigo: string, accion: string): void | throws AuthorizationError`

## 5. Non-Functional Requirements
- Security: fail-closed by default; single source of truth reused across every mutation/read path (project-context "Zero Trust Verification").

## 6. Out of Scope
- Role/permission CRUD UI (`administration.md`).
- Module catalog management UI.
- Tenant resolution itself (`tenant-resolution.md`).

## 7. Traceability
- Proposal decision: 3 (Rol.permisos shape)
- Brief section: §1.1, §6.3, §7, Anexo point 3
- Planificacion etapa: 2
</content>
