-- 00079_rol_revendedora.sql
-- DOWN:
-- drop trigger if exists tr_check_usuario_revendedora on usuario;
-- drop function if exists fn_check_usuario_revendedora();
-- drop trigger if exists tr_check_revendedora_usuario on revendedora;
-- drop function if exists fn_check_revendedora_usuario();
-- drop trigger if exists tr_auto_crear_rol_revendedora on tenant_modulo;
-- drop function if exists fn_auto_crear_rol_revendedora();
-- drop trigger if exists tr_rol_revendedora_protect on rol;
-- drop function if exists fn_rol_revendedora_protect();
-- drop function if exists sp_enlazar_revendedora_usuario(uuid, uuid, uuid, text, text, uuid);

create or replace function fn_auto_crear_rol_revendedora() returns trigger as $$
declare
  v_codigo text;
begin
  if NEW.habilitado = true then
    select codigo into v_codigo from modulo where id_modulo = NEW.id_modulo;
    if v_codigo = 'revendedoras' then
      if not exists (select 1 from rol where id_tenant = NEW.id_tenant and nombre = 'Revendedora') then
        insert into rol(id_tenant, nombre, permisos)
        values (NEW.id_tenant, 'Revendedora', '{"revendedoras": ["ver_propio", "declarar"]}'::jsonb);
      end if;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer set search_path = public;

create trigger tr_auto_crear_rol_revendedora
after insert or update on tenant_modulo
for each row execute function fn_auto_crear_rol_revendedora();

create or replace function fn_rol_revendedora_protect() returns trigger as $$
begin
  if OLD.nombre = 'Revendedora' then
    if TG_OP = 'DELETE' then
      if exists (select 1 from tenant where id_tenant = OLD.id_tenant) then
        raise exception 'No se puede eliminar el rol Revendedora' using errcode = '23503';
      end if;
    end if;
    if TG_OP = 'UPDATE' and NEW.nombre <> 'Revendedora' then
      raise exception 'No se puede renombrar el rol Revendedora' using errcode = '23503';
    end if;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$ language plpgsql;

create trigger tr_rol_revendedora_protect
before update or delete on rol
for each row execute function fn_rol_revendedora_protect();

create or replace function fn_check_usuario_revendedora() returns trigger as $$
declare
  v_nombre_rol text;
  v_tiene_enlace boolean;
begin
  if NEW.id_rol is not null then
    select nombre into v_nombre_rol from rol where id_rol = NEW.id_rol;
    if v_nombre_rol = 'Revendedora' then
      select exists (select 1 from revendedora where id_usuario = NEW.id_usuario) into v_tiene_enlace;
      if not v_tiene_enlace then
        raise exception 'Un usuario con rol Revendedora debe estar enlazado a una revendedora' using errcode = '23503';
      end if;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create constraint trigger tr_check_usuario_revendedora
after insert or update of id_rol on usuario
deferrable initially deferred
for each row execute function fn_check_usuario_revendedora();

create or replace function fn_check_revendedora_usuario() returns trigger as $$
declare
  v_nombre_rol text;
begin
  if NEW.id_usuario is not null then
    select r.nombre into v_nombre_rol
    from usuario u join rol r on u.id_rol = r.id_rol
    where u.id_usuario = NEW.id_usuario;
    
    if v_nombre_rol is distinct from 'Revendedora' then
      raise exception 'La revendedora enlazada debe tener un usuario con rol Revendedora' using errcode = '23503';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create constraint trigger tr_check_revendedora_usuario
after insert or update of id_usuario on revendedora
deferrable initially deferred
for each row execute function fn_check_revendedora_usuario();

create or replace function sp_enlazar_revendedora_usuario(
  p_id_revendedora uuid,
  p_id_usuario uuid,
  p_id_tenant uuid,
  p_email text,
  p_nombre text,
  p_id_rol uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into usuario (id_usuario, id_tenant, email, nombre_completo, id_rol, estado_usuario)
  values (p_id_usuario, p_id_tenant, p_email, p_nombre, p_id_rol, 'invitado');
  
  update revendedora set id_usuario = p_id_usuario where id_revendedora = p_id_revendedora;
end;
$$;

revoke execute on function sp_enlazar_revendedora_usuario(uuid, uuid, uuid, text, text, uuid) from public, authenticated;
grant execute on function sp_enlazar_revendedora_usuario(uuid, uuid, uuid, text, text, uuid) to service_role;

-- Retroactivamente crear rol para tenants que ya tengan el módulo
insert into rol(id_tenant, nombre, permisos)
select tm.id_tenant, 'Revendedora', '{"revendedoras": ["ver_propio", "declarar"]}'::jsonb
from tenant_modulo tm
join modulo m on tm.id_modulo = m.id_modulo
where m.codigo = 'revendedoras' and tm.habilitado = true
  and not exists (
    select 1 from rol r where r.id_tenant = tm.id_tenant and r.nombre = 'Revendedora'
  );
