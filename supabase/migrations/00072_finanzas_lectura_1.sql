-- DOWN:
-- DROP FUNCTION IF EXISTS rf_finanzas_flujo(date, date);
-- DROP FUNCTION IF EXISTS rf_finanzas_resultados(date, date);
-- DROP VIEW IF EXISTS v_linea_venta;

CREATE OR REPLACE VIEW v_linea_venta WITH (security_invoker = true) AS
SELECT
  v.id_tenant,
  v.id_venta,
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

CREATE OR REPLACE FUNCTION rf_finanzas_resultados(p_desde date, p_hasta date)
RETURNS TABLE (
  ventas_brutas numeric,
  anulaciones numeric,
  devoluciones numeric,
  ventas_netas numeric,
  costo_mercaderia numeric,
  ganancia_sobre_ventas numeric,
  costo_cobro numeric,
  incobrables numeric,
  bajas_inventario numeric,
  ganancia_despues_de_costos numeric,
  gastos numeric,
  ganancia_final numeric,
  cantidad_ventas bigint,
  ticket_promedio numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id uuid;
  v_ventas_brutas numeric := 0;
  v_anulaciones numeric := 0;
  v_devoluciones numeric := 0;
  v_costo_mercaderia numeric := 0;
  v_costo_cobro numeric := 0;
  v_incobrables numeric := 0;
  v_bajas_inventario numeric := 0;
  v_gastos numeric := 0;
  v_cantidad_ventas bigint := 0;
  v_zona text;
BEGIN
  v_tenant_id := auth_tenant_id();
  SELECT zona_horaria INTO v_zona FROM tenant WHERE id_tenant = v_tenant_id;

  SELECT
    COALESCE(SUM(v.total), 0) INTO v_ventas_brutas
  FROM venta v
  WHERE v.id_tenant = v_tenant_id AND (v.fecha AT TIME ZONE v_zona)::date >= p_desde AND (v.fecha AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(v.total), 0) INTO v_anulaciones
  FROM venta v
  WHERE v.id_tenant = v_tenant_id AND (v.fecha_anulacion AT TIME ZONE v_zona)::date >= p_desde AND (v.fecha_anulacion AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(dv.monto), 0) INTO v_devoluciones
  FROM devolucion_venta dv
  WHERE dv.id_tenant = v_tenant_id AND (dv.fecha AT TIME ZONE v_zona)::date >= p_desde AND (dv.fecha AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(vl.costo), 0) INTO v_costo_mercaderia
  FROM v_linea_venta vl
  WHERE vl.id_tenant = v_tenant_id AND (vl.fecha_venta AT TIME ZONE v_zona)::date >= p_desde AND (vl.fecha_venta AT TIME ZONE v_zona)::date <= p_hasta;
  
  DECLARE
    v_costo_anuladas numeric := 0;
    v_costo_devueltas numeric := 0;
  BEGIN
    SELECT COALESCE(SUM(vl.costo), 0) INTO v_costo_anuladas
    FROM v_linea_venta vl
    WHERE vl.id_tenant = v_tenant_id AND (vl.fecha_anulacion AT TIME ZONE v_zona)::date >= p_desde AND (vl.fecha_anulacion AT TIME ZONE v_zona)::date <= p_hasta;

    SELECT COALESCE(SUM(vl.costo_recuperado), 0) INTO v_costo_devueltas
    FROM v_linea_venta vl
    WHERE vl.id_tenant = v_tenant_id AND (vl.fecha_devolucion AT TIME ZONE v_zona)::date >= p_desde AND (vl.fecha_devolucion AT TIME ZONE v_zona)::date <= p_hasta;
    
    v_costo_mercaderia := v_costo_mercaderia - v_costo_anuladas - v_costo_devueltas;
  END;

  SELECT
    COALESCE(SUM(pv.costo_cobro), 0) INTO v_costo_cobro
  FROM pago_venta pv
  WHERE pv.id_tenant = v_tenant_id AND (pv.created_at AT TIME ZONE v_zona)::date >= p_desde AND (pv.created_at AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(cf.monto - cf.monto_pagado), 0) INTO v_incobrables
  FROM cuota_financiada cf
  WHERE cf.id_tenant = v_tenant_id AND cf.estado = 'incobrable' AND (cf.fecha_incobrable AT TIME ZONE v_zona)::date >= p_desde AND (cf.fecha_incobrable AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(ip.costo_ingreso), 0) INTO v_bajas_inventario
  FROM item_producto ip
  WHERE ip.id_tenant = v_tenant_id AND ip.estado_item = 'baja' AND (ip.updated_at AT TIME ZONE v_zona)::date >= p_desde AND (ip.updated_at AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(gn.monto), 0) INTO v_gastos
  FROM gasto_negocio gn
  WHERE gn.id_tenant = v_tenant_id AND (gn.fecha AT TIME ZONE v_zona)::date >= p_desde AND (gn.fecha AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT COUNT(*) INTO v_cantidad_ventas
  FROM venta v
  WHERE v.id_tenant = v_tenant_id AND v.estado_venta = 'registrada' AND (v.fecha AT TIME ZONE v_zona)::date >= p_desde AND (v.fecha AT TIME ZONE v_zona)::date <= p_hasta;

  RETURN QUERY SELECT
    v_ventas_brutas,
    v_anulaciones,
    v_devoluciones,
    v_ventas_brutas - v_anulaciones - v_devoluciones AS ventas_netas,
    v_costo_mercaderia,
    (v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia AS ganancia_sobre_ventas,
    v_costo_cobro,
    v_incobrables,
    v_bajas_inventario,
    ((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario AS ganancia_despues_de_costos,
    v_gastos,
    (((v_ventas_brutas - v_anulaciones - v_devoluciones) - v_costo_mercaderia) - v_costo_cobro - v_incobrables - v_bajas_inventario) - v_gastos AS ganancia_final,
    v_cantidad_ventas,
    CASE WHEN v_cantidad_ventas > 0 THEN (v_ventas_brutas - v_anulaciones - v_devoluciones) / v_cantidad_ventas ELSE null::numeric END AS ticket_promedio;
END;
$$;

CREATE OR REPLACE FUNCTION rf_finanzas_flujo(p_desde date, p_hasta date)
RETURNS TABLE (
  cobrado numeric,
  devuelto_clientes numeric,
  costo_cobro numeric,
  neto_cobros numeric,
  compras_mercaderia numeric,
  pagos_proveedores numeric,
  gastos numeric,
  flujo_neto numeric,
  por_acreditar jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_tenant_id uuid;
  v_cobrado numeric := 0;
  v_devuelto_clientes numeric := 0;
  v_costo_cobro numeric := 0;
  v_compras_mercaderia numeric := 0;
  v_pagos_proveedores numeric := 0;
  v_gastos numeric := 0;
  v_por_acreditar jsonb;
  v_zona text;
BEGIN
  v_tenant_id := auth_tenant_id();
  SELECT zona_horaria INTO v_zona FROM tenant WHERE id_tenant = v_tenant_id;

  SELECT
    COALESCE(SUM(pv.monto), 0) INTO v_cobrado
  FROM pago_venta pv
  WHERE pv.id_tenant = v_tenant_id AND (pv.created_at AT TIME ZONE v_zona)::date >= p_desde AND (pv.created_at AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(rc.monto), 0) INTO v_devuelto_clientes
  FROM reintegro_cliente rc
  WHERE rc.id_tenant = v_tenant_id AND (rc.fecha AT TIME ZONE v_zona)::date >= p_desde AND (rc.fecha AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(pv.costo_cobro), 0) INTO v_costo_cobro
  FROM pago_venta pv
  WHERE pv.id_tenant = v_tenant_id AND (pv.created_at AT TIME ZONE v_zona)::date >= p_desde AND (pv.created_at AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(cantidad * costo_unitario), 0) INTO v_compras_mercaderia
  FROM ingreso_mercaderia_detalle d
  JOIN ingreso_mercaderia i ON i.id_ingreso = d.id_ingreso
  WHERE i.id_tenant = v_tenant_id
    AND i.tipo_ingreso = 'compra'
    AND i.confirmado = true
    AND i.cancelado_at IS NULL
    AND (i.fecha AT TIME ZONE v_zona)::date >= p_desde AND (i.fecha AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(rp.monto_total), 0) INTO v_pagos_proveedores
  FROM rendicion_proveedor rp
  WHERE rp.id_tenant = v_tenant_id AND rp.estado = 'pagada' AND (rp.fecha_pago AT TIME ZONE v_zona)::date >= p_desde AND (rp.fecha_pago AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT
    COALESCE(SUM(gn.monto), 0) INTO v_gastos
  FROM gasto_negocio gn
  WHERE gn.id_tenant = v_tenant_id AND (gn.fecha AT TIME ZONE v_zona)::date >= p_desde AND (gn.fecha AT TIME ZONE v_zona)::date <= p_hasta;

  SELECT jsonb_object_agg(t.tipo, COALESCE(t.total, 0)) INTO v_por_acreditar
  FROM (
    SELECT cd.tipo, SUM(p.neto_acreditado) as total
    FROM pago_venta p
    JOIN cuenta_destino cd ON cd.id_cuenta_destino = p.id_cuenta_destino
    WHERE p.id_tenant = v_tenant_id
      AND (p.fecha_acreditacion AT TIME ZONE v_zona)::date > (now() AT TIME ZONE v_zona)::date
    GROUP BY cd.tipo
  ) t;
  
  IF v_por_acreditar IS NULL THEN
    v_por_acreditar := '{}'::jsonb;
  END IF;

  RETURN QUERY SELECT
    v_cobrado,
    v_devuelto_clientes,
    v_costo_cobro,
    v_cobrado - v_devuelto_clientes - v_costo_cobro AS neto_cobros,
    v_compras_mercaderia,
    v_pagos_proveedores,
    v_gastos,
    (v_cobrado - v_devuelto_clientes - v_costo_cobro) - v_compras_mercaderia - v_pagos_proveedores - v_gastos AS flujo_neto,
    v_por_acreditar;
END;
$$;

GRANT EXECUTE ON FUNCTION rf_finanzas_resultados(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION rf_finanzas_flujo(date, date) TO authenticated;
