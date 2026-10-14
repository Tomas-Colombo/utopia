-- 00096_borrar_tenant_con_pagos_revendedora.sql
-- UP: un tenant vuelve a poder borrarse aunque tenga pagos de liquidación de revendedoras.
-- Sigue el mismo patrón de 00065 y 00075 para triggers de inmutabilidad en cascada del tenant.

create or replace function fn_pago_revendedora_inmutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from tenant where id_tenant = old.id_tenant) then
      return old;
    end if;
  end if;

  raise exception 'pago-revendedora-inmutable' using errcode = '22023';
end;
$$;

-- DOWN:
-- create or replace function fn_pago_revendedora_inmutable()
-- returns trigger language plpgsql as $$
-- begin
--   raise exception 'pago-revendedora-inmutable' using errcode = '22023';
-- end;
-- $$;
