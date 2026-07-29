# Spec: Design System

**Capability**: design-system
**Change**: foundations-multitenant
**Status**: Draft

## 1. Purpose

Provide the reusable visual foundation — tokens, theming, 7 base components — every later screen builds on, so UI patterns are established once instead of reinvented per screen (§6.1).

## 2. Requirements (RFC 2119)

### 2.1 Design Tokens
- REQ-DS-01: MUST define a light-theme token set (color, typography, spacing, radii, shadow) from `Utopía Sistema Oficial .html`: cream `#F7F5F1`, text `#141210`, pink `#E9A6BC`, terracotta `#B87A5A`, green `#3E8E5A`.
- REQ-DS-02: MUST define typography for 3 families (display: Archivo Black, body/UI: Archivo, mono/label: Space Mono) and the observed size scale.
- REQ-DS-03: MUST derive a dark-theme token set by inverting neutrals and adapting accents; exact hex values are a `sdd-design` decision.
- REQ-DS-04: Every paired background/text or accent/background token MUST meet WCAG 2.1 AA contrast in both themes.

### 2.2 Theming Provider
- REQ-DS-05: MUST provide a theming provider exposing the active theme to all components.
- REQ-DS-06: MUST persist the user's theme choice to their profile (survives session/device changes).
- REQ-DS-07: The sidebar MUST stay fixed to the dark palette regardless of active app theme.

### 2.3 Base Components
- REQ-DS-08: MUST ship 7 base components: SearchableSelect, Table, Filter pattern, Badge, Skeleton, EmptyState, ConfirmDialog.
- REQ-DS-09: SearchableSelect MUST support keyboard navigation + search input, replacing native `<select>` in all filters.
- REQ-DS-10: Table MUST support aligned/centered columns and render a Badge for any "estado" column.
- REQ-DS-11: Filter pattern MUST apply live via URL params (debounced text, no submit button) and show "Clear filters" only when active.
- REQ-DS-12: EmptyState MUST require a CTA prop; lists MUST NOT render empty with no EmptyState.
- REQ-DS-13: Skeleton MUST be used for all loading states.
- REQ-DS-14: ConfirmDialog MUST gate destructive actions (delete, pay, rendir, deactivate).
- REQ-DS-15: All 7 components MUST be keyboard-operable (Tab/Esc/Enter).

### 2.4 Demo Screen
- REQ-DS-16: MUST provide one demo screen rendering all 7 base components.
- REQ-DS-17: Demo screen MUST be verified in both light and dark themes.
- REQ-DS-18: Demo screen and its components MUST pass `tsc --noEmit` with zero errors.

## 3. Scenarios

### 3.1 Theme persists across sessions
- **Given** a user sets theme to dark
- **When** the user logs out and back in
- **Then** the provider MUST show dark theme

### 3.2 Sidebar stays dark in light theme
- **Given** app theme is light
- **When** the sidebar renders
- **Then** its background/text MUST remain the dark set

### 3.3 Empty list shows CTA
- **Given** a filtered list has zero results
- **When** the table renders
- **Then** EmptyState with a CTA MUST render instead of an empty table

### 3.4 Filters apply without a search button, keyboard-only
- **Given** a user with no mouse, on a filtered list
- **When** they tab to and type (debounced) or pick a SearchableSelect option via keyboard
- **Then** results MUST update via URL params without a submit click, using only Tab/Enter/Esc

### 3.5 Demo screen compiles in both themes
- **Given** the demo screen is implemented
- **When** `tsc --noEmit` runs and dark mode is toggled
- **Then** zero type errors MUST report AND all components MUST render correctly in dark mode

## 4. Data / Contracts
- SearchableSelect: `{ options: {value,label}[], value, onChange, placeholder? }`
- EmptyState: `{ title, description?, cta: {label, onClick|href} }` (cta required)
- Badge: `{ status: string, variant: 'success'|'warning'|'danger'|'neutral' }`

## 5. Non-Functional Requirements
- Accessibility: WCAG AA contrast, full keyboard operability (§6.5).
- Responsive: desktop/tablet/mobile (§6.1).
- Theme switch MUST NOT trigger a full page reload.

## 6. Out of Scope
- Export to Excel/CSV/PDF (§6.4) — Table/Filter primitives only.
- Domain-specific screens beyond the demo.
- Literal HTML replication (§10 — guide, not copy).
- Final dark palette hex values (deferred to `sdd-design`).

## 7. Traceability
- Decision: 6 (dark mode derivation)
- Brief: §6.1, §6.2, §6.5–§6.8, §10
- Etapa: 0
</content>
