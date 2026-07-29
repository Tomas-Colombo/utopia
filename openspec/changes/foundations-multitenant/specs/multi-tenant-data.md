# Spec: Multi-tenant Data

**Capability**: multi-tenant-data
**Change**: foundations-multitenant
**Status**: Draft

## 1. Purpose

Establish the tenant-scoped foundational tables (`Tenant`, `Modulo`, `TenantModulo`, `Configuracion`) with RLS from the first migration, a reversible migration system, and a seed dataset — so every later module inherits proven tenant isolation.

## 2. Requirements (RFC 2119)

### 2.1 Schema — Tenant
- REQ-MTD-01: MUST define table `Tenant`: idTenant (uuid PK), nombreComercial (text), subdominio (text, UNIQUE), logoUrl (text?), colorPrimario (text?), estadoTenant (enum).
- REQ-MTD-02: `Tenant` MUST NOT contain a `configFinanzas` json column or operational-preference columns; those live in `Configuracion` (decision 1).

### 2.2 Schema — Modulo / TenantModulo
- REQ-MTD-03: MUST define table `Modulo` (fixed, tenant-agnostic catalog): idModulo (uuid PK), codigo (text, UNIQUE), nombre (text).
- REQ-MTD-04: MUST define table `TenantModulo`: idTenant (FK→Tenant), idModulo (FK→Modulo), habilitado (bool, default false), composite PK `(idTenant, idModulo)`.

### 2.3 Schema — Configuracion
- REQ-MTD-05: MUST define table `Configuracion`: idTenant (FK→Tenant), seccion (text), clave (text), valor (jsonb), tipo (text), composite PK `(idTenant, seccion, clave)`.

### 2.4 Row Level Security
- REQ-MTD-06: RLS MUST be ENABLED on `Tenant`, `Modulo`, `TenantModulo`, and `Configuracion` in the same migration that creates each table.
- REQ-MTD-07: `TenantModulo` and `Configuracion` MUST have a policy restricting all operations to the requesting user's `idTenant`.
- REQ-MTD-08: `Modulo` MUST allow SELECT for all authenticated users; writes MUST be service-role only.
- REQ-MTD-09: `Tenant` SELECT MUST be restricted to the requesting user's own `idTenant`; cross-tenant SELECT MUST return zero rows.

### 2.5 Migrations & Seed
- REQ-MTD-10: Every migration MUST include a reversible down-step.
- REQ-MTD-11: The seed script MUST provision ≥2 tenants, each with a distinct set of enabled modules and ≥1 `Configuracion` entry.
- REQ-MTD-12: The seed script MUST be idempotent.

## 3. Scenarios

### 3.1 Subdomain uniqueness enforced
- **Given** Tenant A exists with subdominio "acme"
- **When** an INSERT attempts subdominio "acme" for a second tenant
- **Then** the INSERT MUST fail on the unique constraint

### 3.2 RLS blocks cross-tenant Configuracion read
- **Given** tenants A and B each have a Configuracion row for `seccion=finanzas`
- **When** a user authenticated as tenant A queries Configuracion
- **Then** only tenant A's rows MUST return

### 3.3 Module catalog writes restricted
- **Given** an authenticated non-service-role user
- **When** they attempt to INSERT into `Modulo`
- **Then** RLS MUST deny the INSERT

### 3.4 TenantModulo composite key prevents duplicates
- **Given** a TenantModulo row exists for (tenantA, moduloInventario)
- **When** a second INSERT targets the same pair
- **Then** it MUST fail on the composite primary key

### 3.5 Seed provisions isolated tenants
- **Given** a fresh database after migrations
- **When** the seed script runs (including a second run)
- **Then** ≥2 tenants with distinct module/role combinations MUST exist and no duplicates MUST be created

### 3.6 Migration rollback is safe
- **Given** the latest migration is applied
- **When** its down-step runs
- **Then** only that migration's objects MUST be dropped, leaving earlier migrations intact

## 4. Data / Contracts
- `Tenant(idTenant uuid PK, nombreComercial text, subdominio text UNIQUE, logoUrl text?, colorPrimario text?, estadoTenant enum)`
- `Modulo(idModulo uuid PK, codigo text UNIQUE, nombre text)`
- `TenantModulo(idTenant uuid FK, idModulo uuid FK, habilitado bool, PK(idTenant, idModulo))`
- `Configuracion(idTenant uuid FK, seccion text, clave text, valor jsonb, tipo text, PK(idTenant, seccion, clave))`

## 5. Non-Functional Requirements
- Security: RLS is non-negotiable from the first migration touching each table (brief §6.3, Anexo §1).
- Data integrity: constraints enforced at DB level, not only application code (brief §7).

## 6. Out of Scope
- Usuario and Rol table definitions (`auth.md`, `access-guard.md`).
- Auditoria table definition (`audit-log.md`).
- Any domain table (Producto, Venta, etc.) — Etapa 3+.
- ORM selection (raw supabase-js per assumption).

## 7. Traceability
- Proposal decision: 1 (Configuracion schema)
- Brief section: §3.1, §6.3, §8, Anexo §1
- Planificacion etapa: 1
</content>
