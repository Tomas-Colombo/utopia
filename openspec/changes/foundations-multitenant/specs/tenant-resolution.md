# Spec: Tenant Resolution

**Capability**: tenant-resolution
**Change**: foundations-multitenant
**Status**: Draft

## 1. Purpose

Resolve the tenant from the request subdomain in `proxy.ts` as an optimistic, non-authoritative step, injecting a header/cookie the DAL re-verifies authoritatively before any data access — defense-in-depth per Next.js 16 Proxy guidance.

## 2. Requirements (RFC 2119)

### 2.1 Proxy Parsing
- REQ-TR-01: The system MUST implement subdomain parsing in `proxy.ts` (Next.js 16), NOT `middleware.ts` (deprecated/renamed).
- REQ-TR-02: The proxy MUST parse the `host` header to extract the subdomain for every incoming request.
- REQ-TR-03: The proxy lookup of subdomain→tenant MUST be optimistic only; it MUST NOT perform the authoritative tenant/RLS check.
- REQ-TR-04: The proxy MUST inject the resolved (unverified) tenant identifier into a request header or cookie for downstream use.

### 2.2 Authoritative DAL Check
- REQ-TR-05: The DAL MUST perform the authoritative tenant check on every data access, without trusting the proxy-injected value alone.
- REQ-TR-06: The DAL check MUST run inside every Server Action, Route Handler, and Server Component accessing tenant data, even where the proxy matcher excludes that path.

### 2.3 Dev/Prod Host Conventions
- REQ-TR-07: In production, the system MUST resolve tenants from `<tenant>.utopia.app` subdomains.
- REQ-TR-08: In development, the system MUST resolve tenants from `<tenant>.localhost` subdomains without `/etc/hosts` edits.
- REQ-TR-09: Reserved subdomains (`www`, `admin`, `api`) MUST be rejected as tenant identifiers or routed to a non-tenant landing/admin destination.

### 2.4 Failure Handling
- REQ-TR-10: An unknown/unresolvable subdomain MUST NOT resolve to any tenant's data; the request MUST be rejected or redirected before reaching the DAL with a valid tenant context.
- REQ-TR-11: A missing subdomain (bare root domain) MUST be treated as "no tenant resolved," never silently defaulted.

## 3. Scenarios

### 3.1 Valid subdomain resolves optimistically
- **Given** request host is `acme.utopia.app`
- **When** the proxy runs
- **Then** it MUST inject `acme` as the optimistic tenant identifier without an authoritative DB query

### 3.2 DAL re-verifies even with a valid proxy header
- **Given** proxy injected tenant `acme`
- **When** a Server Action reads tenant data
- **Then** the DAL MUST independently confirm the authenticated user belongs to `acme`

### 3.3 Unknown subdomain rejected
- **Given** request host is `doesnotexist.utopia.app`
- **When** the proxy resolves the subdomain
- **Then** the system MUST NOT proceed to tenant data; the request MUST be rejected/redirected

### 3.4 Wrong-tenant subdomain blocked at DAL
- **Given** an authenticated user belongs to tenant "acme"
- **When** the user navigates to `othertenant.utopia.app` and a Server Action reads data
- **Then** the DAL MUST reject the read despite the proxy optimistically parsing "othertenant"

### 3.5 Reserved subdomain never matches a tenant
- **Given** request host is `admin.utopia.app`
- **When** the proxy runs
- **Then** `admin` MUST NOT resolve as a tenant identifier

### 3.6 Dev localhost subdomain works without hosts edits
- **Given** local dev server running, no `/etc/hosts` changes
- **When** a developer visits `acme.localhost:3000`
- **Then** the proxy MUST resolve `acme` exactly as it would in production

## 4. Data / Contracts
- Injected header/cookie (name finalized in design): unverified tenant subdomain string, consumed by the DAL only as a hint, never as authorization.
- Reserved subdomain list: `www`, `admin`, `api` (extensible via config).

## 5. Non-Functional Requirements
- Security: proxy check is explicitly non-authoritative (Anexo point 2; Next.js 16 warning on Server Actions bypassing proxy matchers).
- Performance: the proxy MUST avoid slow/authoritative DB calls.

## 6. Out of Scope
- Branding/UI customization per tenant beyond identification.
- Multi-domain (custom domain per tenant) support.
- Module+role guard logic (`access-guard.md`).

## 7. Traceability
- Proposal decision: 8 (tenant resolution via subdomain)
- Brief section: §3.1, Anexo point 2
- Planificacion etapa: 1
</content>
