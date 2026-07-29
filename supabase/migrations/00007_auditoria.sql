-- 00007_auditoria.sql
-- UP: `auditoria` append-only table + RLS (insert/select own, NO
--     update/delete policy → structurally immutable) (design §4.7,
--     REQ-AL-01/05/06).
-- DOWN:
--   drop policy if exists auditoria_select_own on auditoria;
--   drop policy if exists auditoria_insert_own on auditoria;
--   drop index if exists auditoria_tenant_ts_idx;
--   drop table if exists auditoria;

create table if not exists auditoria (
  id_auditoria uuid primary key default gen_random_uuid(),
  id_tenant    uuid not null references tenant(id_tenant) on delete cascade,
  id_usuario   uuid not null references auth.users(id),
  entidad      text not null,
  entidad_id   text not null,
  accion       text not null,               -- 'crear' | 'editar' | 'eliminar' | ...
  cambios      jsonb not null,               -- { before: {...}, after: {...} }
  ts           timestamptz not null default now(),
  ip           inet
);

create index if not exists auditoria_tenant_ts_idx on auditoria(id_tenant, ts desc);

alter table auditoria enable row level security;

create policy auditoria_insert_own on auditoria for insert to authenticated
  with check (id_tenant = auth_tenant_id());

create policy auditoria_select_own on auditoria for select to authenticated
  using (id_tenant = auth_tenant_id());

-- Immutability (REQ-AL-05): NO update/delete policy is defined for any
-- role, including service_role's default `authenticated`-scoped grants —
-- with RLS enabled and only insert/select policies present, UPDATE and
-- DELETE from `authenticated` match no permissive policy and are denied.
-- This is structural, not application convention.
