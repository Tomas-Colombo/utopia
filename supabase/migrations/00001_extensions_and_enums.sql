-- 00001_extensions_and_enums.sql
-- UP: pgcrypto extension, tenant_estado/usuario_estado enums,
--     set_updated_at() trigger function, auth_tenant_id() RLS helper
--     (design §4).
-- DOWN: manual drop required. Every later migration (00002+) depends on
--   these objects, so only run this down-step AFTER every dependent
--   migration has already been rolled back, in this exact order:
--     drop function if exists auth_tenant_id();
--     drop function if exists set_updated_at();
--     drop type if exists usuario_estado;
--     drop type if exists tenant_estado;
--     drop extension if exists pgcrypto;  -- destructive: also removes
--       gen_random_uuid() defaults; verify no other object depends on it
--       first.

create extension if not exists pgcrypto;

create type tenant_estado as enum ('activo', 'suspendido', 'archivado');
create type usuario_estado as enum ('activo', 'inactivo', 'invitado');

create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Helper used by every tenant-scoped RLS policy (design §4). `nullif(...)`
-- resolves a missing/empty claim to NULL, so `id_tenant = NULL` matches
-- zero rows — fail-closed by construction (REQ-AUTH-10 defense in depth).
create or replace function auth_tenant_id() returns uuid
  language sql stable as $$
    select nullif(auth.jwt() ->> 'tenant_id', '')::uuid
  $$;
