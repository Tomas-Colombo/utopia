# Spec: Audit Log

**Capability**: audit-log
**Change**: foundations-multitenant
**Status**: Draft

## 1. Purpose

Provide a transversal, append-only `Auditoria` record of administrative/data changes (who, what entity, when, before/after values), written atomically alongside every mutation via a DAL helper — not database triggers (decision 2).

## 2. Requirements (RFC 2119)

### 2.1 Schema
- REQ-AL-01: The system MUST define table `Auditoria` with id (uuid PK), idTenant (uuid FK), idUsuario (uuid FK), entidad (text), entidadId (text), accion (text), cambios (jsonb — before/after values), timestamp (timestamptz, default now()).

### 2.2 Write Path
- REQ-AL-02: The system MUST provide a DAL helper `logAudit(...)` invoked from every mutation (create/update/delete) on tenant-scoped data.
- REQ-AL-03: The `logAudit` write MUST occur inside the SAME transaction as the mutation it records.
- REQ-AL-04: Auditoria MUST NOT be written via Postgres triggers (decision 2).

### 2.3 Immutability & RLS
- REQ-AL-05: RLS MUST allow INSERT and SELECT (scoped by idTenant) but MUST DENY UPDATE and DELETE for all non-service-role users.
- REQ-AL-06: SELECT MUST be scoped to the requesting user's idTenant; cross-tenant reads MUST return zero rows.

### 2.4 Query API
- REQ-AL-07: The system MUST provide a query capability to list Auditoria filtered by tenant, entidad, and a date range.

## 3. Scenarios

### 3.1 Successful mutation writes audit
- **Given** an authorized user updates a tenant-scoped record
- **When** the mutation commits
- **Then** exactly one Auditoria row MUST exist recording previous and new values

### 3.2 Failed mutation writes no audit
- **Given** a mutation violates a constraint and rolls back
- **When** the transaction fails
- **Then** no Auditoria row for that attempt MUST persist

### 3.3 Audit row cannot be updated
- **Given** an existing Auditoria row
- **When** a non-service-role user attempts an UPDATE
- **Then** RLS MUST deny it

### 3.4 Audit row cannot be deleted
- **Given** an existing Auditoria row
- **When** a non-service-role user attempts a DELETE
- **Then** RLS MUST deny it

### 3.5 Cross-tenant audit read denied
- **Given** Auditoria rows exist for tenants A and B
- **When** a user authenticated as tenant A queries Auditoria
- **Then** only tenant A's rows MUST return

### 3.6 Filtered query by entity and date range
- **Given** multiple Auditoria rows across entities/dates for one tenant
- **When** a query filters by `entidad="Rol"` and a date range
- **Then** only matching rows MUST return

## 4. Data / Contracts
- `Auditoria(id uuid PK, idTenant uuid FK, idUsuario uuid FK, entidad text, entidadId text, accion text, cambios jsonb, timestamp timestamptz)`
- `logAudit(tx, {idTenant, idUsuario, entidad, entidadId, accion, cambios}): void` — MUST run within the caller's transaction handle `tx`.

## 5. Non-Functional Requirements
- Data integrity: atomicity with the mutation is non-negotiable (brief §7, project-context "Atomic Transactions").
- Append-only enforced at RLS level, not just application convention.

## 6. Out of Scope
- `MovimientoItem` (separate physical-item ledger, Etapa 3+).
- Audit UI/reporting screens beyond the query API.

## 7. Traceability
- Proposal decision: 2 (Auditoria in this change, DAL-based)
- Brief section: §4.5
- Planificacion etapa: 1 (table + write path); used from Etapa 2 onward
</content>
