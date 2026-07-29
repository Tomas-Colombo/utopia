-- 00006_usuario.sql
-- UP: `usuario` table (profile, 1:1 with auth.users) + `set_updated_at`
--     trigger + RLS (`usuario_all_own_tenant`) (design §4.6, REQ-AUTH-04).
-- DOWN:
--   drop policy if exists usuario_all_own_tenant on usuario;
--   drop trigger if exists usuario_touch on usuario;
--   drop index if exists usuario_rol_idx;
--   drop index if exists usuario_tenant_idx;
--   drop table if exists usuario;

create table if not exists usuario (
  id_usuario      uuid primary key references auth.users(id) on delete cascade,
  id_tenant       uuid not null references tenant(id_tenant) on delete cascade,
  email           text not null,
  nombre_completo text not null,
  id_rol          uuid not null references rol(id_rol),
  estado_usuario  usuario_estado not null default 'invitado',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists usuario_tenant_idx on usuario(id_tenant);
create index if not exists usuario_rol_idx on usuario(id_rol);

create trigger usuario_touch before update on usuario
  for each row execute function set_updated_at();

alter table usuario enable row level security;

create policy usuario_all_own_tenant on usuario for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

-- Decision (design §4.6): id_usuario IS auth.users(id), no separate
-- surrogate key — the profile row shares its PK 1:1 with the Supabase auth
-- user so the Auth Hook (00008) can look it up by `user_id` directly.
