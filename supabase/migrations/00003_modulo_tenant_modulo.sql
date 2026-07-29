-- 00003_modulo_tenant_modulo.sql
-- UP: `modulo` fixed catalog table + `tenant_modulo` feature-flag junction,
--     both with RLS (design §4.2/§4.3, REQ-MTD-03/04/06/07/08).
-- DOWN:
--   drop policy if exists tenant_modulo_all_own_tenant on tenant_modulo;
--   drop trigger if exists tenant_modulo_touch on tenant_modulo;
--   drop index if exists tenant_modulo_modulo_idx;
--   drop table if exists tenant_modulo;
--   drop policy if exists modulo_select_authenticated on modulo;
--   drop table if exists modulo;

create table modulo (
  id_modulo  uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nombre     text not null,
  created_at timestamptz not null default now()
);

alter table modulo enable row level security;

create policy modulo_select_authenticated on modulo for select to authenticated
  using (true);
-- No insert/update/delete policy → writes are service-role only (REQ-MTD-08).

create table tenant_modulo (
  id_tenant  uuid not null references tenant(id_tenant) on delete cascade,
  id_modulo  uuid not null references modulo(id_modulo) on delete cascade,
  habilitado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id_tenant, id_modulo)  -- REQ-MTD-04 composite PK
);

create index tenant_modulo_modulo_idx on tenant_modulo(id_modulo);

create trigger tenant_modulo_touch before update on tenant_modulo
  for each row execute function set_updated_at();

alter table tenant_modulo enable row level security;

create policy tenant_modulo_all_own_tenant on tenant_modulo for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
