-- Migración 00070: Tablas de reversas y sp_anular_venta con reintegros

-- ─── Tablas de Reversas ──────────────────────────────────────────────

create table devolucion_venta (
  id_devolucion    uuid primary key default gen_random_uuid(),
  id_tenant        uuid not null references tenant(id_tenant) on delete cascade,
  id_venta         uuid not null references venta(id_venta),
  id_detalle_venta uuid not null references detalle_venta(id_detalle_venta),
  id_item          uuid not null references item_producto(id_item),
  monto            numeric(14,2) not null,
  costo_recuperado numeric(14,2) not null,
  fecha            timestamptz not null default now(),
  motivo           text,
  id_usuario       uuid not null references auth.users(id),
  
  constraint devolucion_venta_id_detalle_venta_key unique (id_detalle_venta)
);

alter table devolucion_venta enable row level security;
create policy devolucion_venta_tenant on devolucion_venta
  for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create index devolucion_venta_tenant_fecha_idx on devolucion_venta(id_tenant, fecha desc);

create table reintegro_cliente (
  id_reintegro      uuid primary key default gen_random_uuid(),
  id_tenant         uuid not null references tenant(id_tenant) on delete cascade,
  id_venta          uuid not null references venta(id_venta),
  id_devolucion     uuid references devolucion_venta(id_devolucion),
  id_pago_venta     uuid references pago_venta(id_pago_venta),
  id_cuenta_destino uuid not null references cuenta_destino(id_cuenta_destino),
  medio             medio_pago not null,
  monto             numeric(14,2) not null check (monto > 0),
  fecha             timestamptz not null default now(),
  origen            text not null check (origen in ('anulacion', 'devolucion')),
  motivo            text,
  id_usuario        uuid not null references auth.users(id)
);

alter table reintegro_cliente enable row level security;
create policy reintegro_cliente_tenant on reintegro_cliente
  for all to authenticated
  using (id_tenant = auth_tenant_id())
  with check (id_tenant = auth_tenant_id());

create index reintegro_cliente_tenant_fecha_idx on reintegro_cliente(id_tenant, fecha desc);

-- ─── sp_anular_venta ─────────────────────────────────────────────────

-- Eliminamos la firma vieja que devuelve void.
drop function if exists sp_anular_venta(uuid, text, inet);

create or replace function sp_anular_venta(
  p_id_venta uuid,
  p_motivo   text default null,
  p_ip       inet default null
) returns jsonb language plpgsql as $$
declare
  v_tenant            uuid := auth_tenant_id();
  v_actor             uuid := auth.uid();
  v_estado            estado_venta;
  v_rendida           boolean;
  v_anuladas          integer := 0;
  r_det               record;
  r_pago              record;
  v_total_reintegrado numeric(14,2) := 0;
  v_reintegro_pago    numeric(14,2);
  v_restante          numeric(14,2);
  v_tiene_incobrables boolean;
begin
  select estado_venta into v_estado from venta
    where id_venta = p_id_venta and id_tenant = v_tenant for update;
  
  if v_estado is null then
    raise exception 'venta-not-found' using errcode = '42704';
  end if;
  
  if v_estado = 'anulada' then
    return jsonb_build_object('total_reintegrado', 0); -- idempotente
  end if;

  select exists(
    select 1 from cuota_financiada
     where id_venta = p_id_venta and estado = 'incobrable'
  ) into v_tiene_incobrables;
  
  if v_tiene_incobrables then
    raise exception 'venta-con-incobrables' using errcode = '22023';
  end if;

  select exists(
    select 1 from detalle_venta
     where id_venta = p_id_venta and id_rendicion is not null
  ) into v_rendida;
  
  if v_rendida then
    raise exception 'venta-ya-rendida' using errcode = '22023';
  end if;

  for r_det in
    select dv.id_item, ip.estado_item
      from detalle_venta dv
      join item_producto ip on ip.id_item = dv.id_item
     where dv.id_venta = p_id_venta
     for update of ip
  loop
    if r_det.estado_item = 'vendido' then
      perform sp_transicion_item_producto(
        r_det.id_item, 'disponible', 'ajuste', p_id_venta, 'anulacion_venta', p_ip
      );
    end if;
  end loop;

  with anuladas as (
    update cuota_financiada
       set estado = 'anulada'
     where id_venta = p_id_venta
       and estado in ('pendiente', 'parcial')
    returning 1
  )
  select count(*) into v_anuladas from anuladas;

  -- Lo que queda por devolver es lo cobrado menos TODO lo ya reintegrado de la
  -- venta. Los reintegros de una devolución no cuelgan de un pago (id_pago_venta
  -- nulo), así que restar solo los de cada pago devolvía dos veces esa plata.
  v_restante := greatest(0::numeric,
    (select coalesce(sum(monto), 0) from pago_venta where id_venta = p_id_venta)
    - (select coalesce(sum(monto), 0) from reintegro_cliente where id_venta = p_id_venta)
  );

  for r_pago in
    select id_pago_venta, id_cuenta_destino, medio, monto
      from pago_venta
     where id_venta = p_id_venta
     order by created_at, id_pago_venta
  loop
    v_reintegro_pago := least(v_restante, r_pago.monto - coalesce((
      select sum(monto) from reintegro_cliente
       where id_pago_venta = r_pago.id_pago_venta
    ), 0));
    
    if v_reintegro_pago > 0 then
      insert into reintegro_cliente (
        id_tenant, id_venta, id_pago_venta, id_cuenta_destino,
        medio, monto, origen, motivo, id_usuario
      ) values (
        v_tenant, p_id_venta, r_pago.id_pago_venta, r_pago.id_cuenta_destino,
        r_pago.medio, v_reintegro_pago, 'anulacion', p_motivo, v_actor
      );
      v_total_reintegrado := v_total_reintegrado + v_reintegro_pago;
      v_restante := v_restante - v_reintegro_pago;
    end if;
  end loop;

  update venta
     set estado_venta     = 'anulada',
         fecha_anulacion  = now(),
         motivo_anulacion = p_motivo
   where id_venta = p_id_venta;

  insert into auditoria(id_tenant, id_usuario, entidad, entidad_id, accion, cambios, ip)
  values (v_tenant, v_actor, 'venta', p_id_venta::text, 'anular',
          jsonb_build_object('motivo', p_motivo, 'cuotas_anuladas', v_anuladas, 'total_reintegrado', v_total_reintegrado),
          p_ip);

  return jsonb_build_object('total_reintegrado', v_total_reintegrado);
end $$;

grant execute on function sp_anular_venta(uuid, text, inet) to authenticated;

-- DOWN:

-- drop function sp_anular_venta(uuid, text, inet);
-- drop table reintegro_cliente;
-- drop table devolucion_venta;

-- (Y habría que re-crear la función original que devolvía void).
