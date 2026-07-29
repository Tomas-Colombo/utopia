-- 00004_configuracion.sql
-- UP: `configuracion` table, composite PK (id_tenant, seccion, clave),
--     RLS (`configuracion_all_own_tenant`) (design §4.4, REQ-MTD-05/06/07).
-- DOWN:
--   drop policy if exists configuracion_all_own_tenant on configuracion;
--   drop trigger if exists configuracion_touch on configuracion;
--   drop table if exists configuracion;

create table configuracion (
  id_tenant  uuid not null references tenant(id_tenant) on delete cascade,
  seccion    text not null,
  clave      text not null,
  valor      jsonb not null,
  tipo       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id_tenant, seccion, clave)  -- REQ-MTD-05
);

create trigger configuracion_touch before update on configuracion
  for each row execute function set_updated_at();

alter table configuracion enable row level security;

create policy configuracion_all_own_tenant on configuracion for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());
