-- 00005_rol.sql
-- UP: `rol` table + `set_updated_at` trigger + RLS (`rol_all_own_tenant`)
--     (design §4.5, REQ-AG-01/02).
-- DOWN:
--   drop policy if exists rol_all_own_tenant on rol;
--   drop trigger if exists rol_touch on rol;
--   drop index if exists rol_tenant_idx;
--   drop table if exists rol;

create table if not exists rol (
  id_rol     uuid primary key default gen_random_uuid(),
  id_tenant  uuid not null references tenant(id_tenant) on delete cascade,
  nombre     text not null,
  permisos   jsonb not null default '{}'::jsonb,  -- { moduloCodigo: string[] } (REQ-AG-02)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rol_tenant_idx on rol(id_tenant);

create trigger rol_touch before update on rol
  for each row execute function set_updated_at();

alter table rol enable row level security;

create policy rol_all_own_tenant on rol for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
