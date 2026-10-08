-- DOWN:
-- DROP FUNCTION IF EXISTS rf_finanzas_serie_mensual(date, int);
-- DROP FUNCTION IF EXISTS rf_finanzas_posicion();
-- DROP FUNCTION IF EXISTS rf_finanzas_ranking_productos(date, date, int, text);
-- DROP FUNCTION IF EXISTS rf_finanzas_gastos_presupuesto(date);
-- DROP FUNCTION IF EXISTS fn_contexto_periodo();

DROP VIEW IF EXISTS v_linea_venta;

CREATE OR REPLACE VIEW v_linea_venta WITH (security_invoker = true) AS
SELECT
  v.id_tenant,
  v.id_venta,
  dv.id_producto,
  v.fecha AS fecha_venta,
  v.estado_venta,
  v.fecha_anulacion,
  p.precio_venta AS precio_venta,
  dv.costo_snapshot AS costo,
  dv.monto_ganancia AS margen,
  dv.tipo_ingreso_snapshot,
  dv.id_proveedor,
  dv.monto_proveedor,
  dv.id_rendicion,
  dv.excluida_rendicion,
  (dev.id_devolucion IS NOT NULL) AS devuelta,
  dev.fecha AS fecha_devolucion,
  dev.costo_recuperado
FROM detalle_venta dv
JOIN venta v ON v.id_venta = dv.id_venta
JOIN producto p ON p.id_producto = dv.id_producto
LEFT JOIN devolucion_venta dev ON dev.id_detalle_venta = dv.id_detalle_venta;

CREATE OR REPLACE FUNCTION rf_finanzas_serie_mensual(p_hasta date, p_meses int default 12)
RETURNS TABLE (
  mes date,
  ventas_netas numeric,
  ganancia_sobre_ventas numeric,
  ganancia_final numeric,
  cobrado_neto numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id uuid;
  v_zona text;
  v_desde date;
BEGIN
  IF p_meses < 1 OR p_meses > 24 THEN
    RAISE EXCEPTION 'periodo-invalido';
  END IF;

  v_tenant_id := auth_tenant_id();
  SELECT zona_horaria INTO v_zona FROM tenant WHERE id_tenant = v_tenant_id;
  
  v_desde := (date_trunc('month', p_hasta::timestamp) - ((p_meses - 1)::text || ' months')::interval)::date;

  RETURN QUERY
  WITH meses AS (
    SELECT generate_series(
      v_desde,
      date_trunc('month', p_hasta::timestamp)::date,
      '1 month'::interval
    )::date AS m
  )
  SELECT
    m.m AS mes,
    COALESCE(r.ventas_netas, 0) AS ventas_netas,
    COALESCE(r.ganancia_sobre_ventas, 0) AS ganancia_sobre_ventas,
    COALESCE(r.ganancia_final, 0) AS ganancia_final,
    COALESCE(f.neto_cobros, 0) AS cobrado_neto
  FROM meses m
  LEFT JOIN LATERAL rf_finanzas_resultados(m.m, (m.m + interval '1 month' - interval '1 day')::date) r ON true
  LEFT JOIN LATERAL rf_finanzas_flujo(m.m, (m.m + interval '1 month' - interval '1 day')::date) f ON true
  ORDER BY m.m ASC;
END;
$$;

CREATE OR REPLACE FUNCTION rf_finanzas_posicion()
RETURNS TABLE (
  capital_propio numeric,
  mercaderia_terceros numeric,
  devueltos_clientes numeric,
  valor_venta_potencial numeric,
  productos_sin_precio bigint,
  por_cobrar jsonb,
  deuda_proveedores numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id uuid;
  v_capital_propio numeric := 0;
  v_mercaderia_terceros numeric := 0;
  v_devueltos_clientes numeric := 0;
  v_valor_venta_potencial numeric := 0;
  v_productos_sin_precio bigint := 0;
  v_deuda_proveedores numeric := 0;
  v_por_cobrar jsonb;
  v_zona text;
BEGIN
  v_tenant_id := auth_tenant_id();
  SELECT zona_horaria INTO v_zona FROM tenant WHERE id_tenant = v_tenant_id;

  SELECT
    COALESCE(SUM(costo_ingreso), 0) INTO v_capital_propio
  FROM item_producto
  WHERE id_tenant = v_tenant_id AND tipo_ingreso = 'compra' AND estado_item IN ('disponible', 'reservado');

  SELECT
    COALESCE(SUM(costo_ingreso), 0) INTO v_mercaderia_terceros
  FROM item_producto
  WHERE id_tenant = v_tenant_id AND tipo_ingreso = 'consignacion' AND estado_item IN ('disponible', 'reservado');

  SELECT
    COALESCE(SUM(costo_ingreso), 0) INTO v_devueltos_clientes
  FROM item_producto
  WHERE id_tenant = v_tenant_id AND estado_item = 'devuelto_cliente';

  SELECT
    COALESCE(SUM(p.precio_venta), 0) INTO v_valor_venta_potencial
  FROM item_producto ip
  JOIN producto p ON p.id_producto = ip.id_producto
  WHERE ip.id_tenant = v_tenant_id AND ip.estado_item IN ('disponible', 'reservado');

  SELECT
    COUNT(*) INTO v_productos_sin_precio
  FROM producto
  WHERE id_tenant = v_tenant_id AND precio_venta = 0 AND activo = true;

  -- por_cobrar: (a cobrar, vence este mes, vencido, cuotas vencidas, clientes con deuda)
  DECLARE
    v_a_cobrar numeric := 0;
    v_vence_este_mes numeric := 0;
    v_vencido numeric := 0;
    v_cuotas_vencidas bigint := 0;
    v_clientes_con_deuda bigint := 0;
    v_hoy date;
  BEGIN
    v_hoy := (now() AT TIME ZONE v_zona)::date;

    SELECT
      COALESCE(SUM(monto - monto_pagado), 0) INTO v_a_cobrar
    FROM cuota_financiada
    WHERE id_tenant = v_tenant_id AND estado IN ('pendiente', 'parcial');

    SELECT
      COALESCE(SUM(monto - monto_pagado), 0) INTO v_vence_este_mes
    FROM cuota_financiada
    WHERE id_tenant = v_tenant_id AND estado IN ('pendiente', 'parcial')
      AND date_trunc('month', (fecha_vencimiento AT TIME ZONE v_zona)::timestamp)::date = date_trunc('month', v_hoy::timestamp)::date;

    SELECT
      COALESCE(SUM(monto - monto_pagado), 0) INTO v_vencido
    FROM cuota_financiada
    WHERE id_tenant = v_tenant_id AND estado IN ('pendiente', 'parcial')
      AND (fecha_vencimiento AT TIME ZONE v_zona)::date < v_hoy;

    SELECT
      COUNT(*) INTO v_cuotas_vencidas
    FROM cuota_financiada
    WHERE id_tenant = v_tenant_id AND estado IN ('pendiente', 'parcial')
      AND (fecha_vencimiento AT TIME ZONE v_zona)::date < v_hoy;

    SELECT
      COUNT(DISTINCT v.id_cliente) INTO v_clientes_con_deuda
    FROM cuota_financiada cf
    JOIN venta v ON v.id_venta = cf.id_venta
    WHERE cf.id_tenant = v_tenant_id AND cf.estado IN ('pendiente', 'parcial') AND v.id_cliente IS NOT NULL;

    v_por_cobrar := jsonb_build_object(
      'a_cobrar', v_a_cobrar,
      'vence_este_mes', v_vence_este_mes,
      'vencido', v_vencido,
      'cuotas_vencidas', v_cuotas_vencidas,
      'clientes_con_deuda', v_clientes_con_deuda
    );
  END;

  DECLARE
    v_a_rendir numeric := 0;
    v_rendiciones_sin_pagar numeric := 0;
  BEGIN
    SELECT COALESCE(SUM(monto_proveedor), 0) INTO v_a_rendir
    FROM v_linea_venta
    WHERE id_tenant = v_tenant_id
      AND id_rendicion IS NULL
      AND excluida_rendicion = false
      AND monto_proveedor > 0
      AND estado_venta = 'registrada'
      AND devuelta = false;

    SELECT COALESCE(SUM(monto_total), 0) INTO v_rendiciones_sin_pagar
    FROM rendicion_proveedor
    WHERE id_tenant = v_tenant_id AND estado = 'pendiente';

    v_deuda_proveedores := v_a_rendir + v_rendiciones_sin_pagar;
  END;

  RETURN QUERY SELECT
    v_capital_propio,
    v_mercaderia_terceros,
    v_devueltos_clientes,
    v_valor_venta_potencial,
    v_productos_sin_precio,
    v_por_cobrar,
    v_deuda_proveedores;
END;
$$;

CREATE OR REPLACE FUNCTION rf_finanzas_ranking_productos(p_desde date, p_hasta date, p_limite int default 20, p_orden text default 'ganancia')
RETURNS TABLE (
  id_producto uuid,
  nombre text,
  unidades bigint,
  monto numeric,
  ganancia numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id uuid;
  v_zona text;
BEGIN
  IF p_orden NOT IN ('ganancia', 'unidades', 'monto') THEN
    RAISE EXCEPTION 'orden-invalido';
  END IF;

  IF p_limite < 1 OR p_limite > 100 THEN
    p_limite := 20;
  END IF;

  v_tenant_id := auth_tenant_id();
  SELECT zona_horaria INTO v_zona FROM tenant WHERE id_tenant = v_tenant_id;

  RETURN QUERY
  SELECT
    p.id_producto,
    p.nombre,
    COUNT(vl.id_venta) AS unidades,
    COALESCE(SUM(vl.precio_venta), 0) AS monto,
    COALESCE(SUM(vl.margen), 0) AS ganancia
  FROM v_linea_venta vl
  JOIN producto p ON p.id_producto = vl.id_producto -- need to join to get nombre, wait, v_linea_venta doesn't have id_producto. Let's check v_linea_venta definition.
  WHERE vl.id_tenant = v_tenant_id
    AND vl.estado_venta = 'registrada'
    AND (vl.fecha_venta AT TIME ZONE v_zona)::date >= p_desde
    AND (vl.fecha_venta AT TIME ZONE v_zona)::date <= p_hasta
    AND vl.devuelta = false
  GROUP BY p.id_producto, p.nombre
  ORDER BY
    CASE WHEN p_orden = 'ganancia' THEN COALESCE(SUM(vl.margen), 0) END DESC,
    CASE WHEN p_orden = 'unidades' THEN COUNT(vl.id_venta) END DESC,
    CASE WHEN p_orden = 'monto' THEN COALESCE(SUM(vl.precio_venta), 0) END DESC
  LIMIT p_limite;
END;
$$;

CREATE OR REPLACE FUNCTION rf_finanzas_gastos_presupuesto(p_mes date)
RETURNS TABLE (
  id_categoria_gasto uuid,
  nombre text,
  gastado numeric,
  presupuesto_mensual numeric,
  consumido_pct numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id uuid;
  v_zona text;
BEGIN
  v_tenant_id := auth_tenant_id();
  SELECT zona_horaria INTO v_zona FROM tenant WHERE id_tenant = v_tenant_id;

  RETURN QUERY
  SELECT
    cg.id_categoria_gasto,
    cg.nombre,
    COALESCE(SUM(gn.monto), 0) AS gastado,
    COALESCE(cg.presupuesto_mensual, 0) AS presupuesto_mensual,
    CASE 
      WHEN COALESCE(cg.presupuesto_mensual, 0) > 0 THEN 
        COALESCE(SUM(gn.monto), 0) / cg.presupuesto_mensual * 100
      ELSE 0
    END AS consumido_pct
  FROM categoria_gasto cg
  LEFT JOIN gasto_negocio gn ON gn.id_categoria_gasto = cg.id_categoria_gasto
    AND (gn.fecha AT TIME ZONE v_zona)::date >= date_trunc('month', p_mes::timestamp)::date
    AND (gn.fecha AT TIME ZONE v_zona)::date < (date_trunc('month', p_mes::timestamp) + interval '1 month')::date
  WHERE cg.id_tenant = v_tenant_id AND cg.activa = true
  GROUP BY cg.id_categoria_gasto, cg.nombre, cg.presupuesto_mensual
  ORDER BY cg.nombre;
END;
$$;

CREATE OR REPLACE FUNCTION fn_contexto_periodo()
RETURNS TABLE (
  hoy date,
  mes_desde date,
  mes_hasta date
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id uuid;
  v_zona text;
  v_hoy date;
BEGIN
  v_tenant_id := auth_tenant_id();
  SELECT zona_horaria INTO v_zona FROM tenant WHERE id_tenant = v_tenant_id;
  v_hoy := (now() AT TIME ZONE v_zona)::date;

  RETURN QUERY SELECT
    v_hoy,
    date_trunc('month', v_hoy::timestamp)::date,
    (date_trunc('month', v_hoy::timestamp) + interval '1 month' - interval '1 day')::date;
END;
$$;

GRANT EXECUTE ON FUNCTION rf_finanzas_serie_mensual(date, int) TO authenticated;
GRANT EXECUTE ON FUNCTION rf_finanzas_posicion() TO authenticated;
GRANT EXECUTE ON FUNCTION rf_finanzas_ranking_productos(date, date, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION rf_finanzas_gastos_presupuesto(date) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_contexto_periodo() TO authenticated;
