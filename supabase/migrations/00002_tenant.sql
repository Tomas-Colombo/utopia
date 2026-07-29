-- 00002_tenant.sql
-- UP: `tenant` table + `set_updated_at` trigger + RLS (`tenant_select_own`)
--     (design §4.1, REQ-MTD-01/06/09).
-- DOWN:
--   drop policy if exists tenant_select_own on tenant;
--   drop trigger if exists tenant_touch on tenant;
--   drop table if exists tenant;

create table tenant (
  id_tenant        uuid primary key default gen_random_uuid(),
  nombre_comercial text not null,
  subdominio       text not null unique,
  logo_url         text,
  color_primario   text,
  estado_tenant    tenant_estado not null default 'activo',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger tenant_touch before update on tenant
  for each row execute function set_updated_at();

alter table tenant enable row level security;

create policy tenant_select_own on tenant for select to authenticated
  using (id_tenant = auth_tenant_id());
-- Writes to tenant are service-role only (no policy for authenticated
-- write) — intentional, tenant provisioning is an admin/service operation.
