-- 00083_finanzas_en_revendedora.sql
-- Slice 2: Incluir items 'en_revendedora' en la posicion financiera (capital propio / terceros / valor potencial)

-- DOWN:
-- CREATE OR REPLACE FUNCTION rf_finanzas_posicion()
-- RETURNS TABLE (
--   capital_propio numeric,
--   mercaderia_terceros numeric,
--   devueltos_clientes numeric,
--   valor_venta_potencial numeric,
--   productos_sin_precio bigint,
--   por_cobrar jsonb,
--   deuda_proveedores numeric
-- )
-- LANGUAGE plpgsql
-- SECURITY INVOKER
-- AS $$
-- DECLARE
--   v_tenant_id uuid;
--   v_capital_propio numeric := 0;
--   v_mercaderia_terceros numeric := 0;
--   v_devueltos_clientes numeric := 0;
--   v_valor_venta_potencial numeric := 0;
--   v_productos_sin_precio bigint := 0;
--   v_deuda_proveedores numeric := 0;
--   v_por_cobrar jsonb;
--   v_zona text;
-- BEGIN
--   v_tenant_id := auth_tenant_id();
--   SELECT zona_horaria INTO v_zona FROM tenant WHERE id_tenant = v_tenant_id;
-- 
--   SELECT
--     COALESCE(SUM(costo_ingreso), 0) INTO v_capital_propio
--   FROM item_producto
--   WHERE id_tenant = v_tenant_id AND tipo_ingreso = 'compra' AND estado_item IN ('disponible', 'reservado');
-- 
--   SELECT
--     COALESCE(SUM(costo_ingreso), 0) INTO v_mercaderia_terceros
--   FROM item_producto
--   WHERE id_tenant = v_tenant_id AND tipo_ingreso = 'consignacion' AND estado_item IN ('disponible', 'reservado');
-- 
--   SELECT
--     COALESCE(SUM(costo_ingreso), 0) INTO v_devueltos_clientes
--   FROM item_producto
--   WHERE id_tenant = v_tenant_id AND estado_item = 'devuelto_cliente';
-- 
--   SELECT
--     COALESCE(SUM(p.precio_venta), 0) INTO v_valor_venta_potencial
--   FROM item_producto ip
--   JOIN producto p ON p.id_producto = ip.id_producto
--   WHERE ip.id_tenant = v_tenant_id AND ip.estado_item IN ('disponible', 'reservado');
-- 
--   SELECT
--     COUNT(*) INTO v_productos_sin_precio
--   FROM producto
--   WHERE id_tenant = v_tenant_id AND precio_venta = 0 AND activo = true;
-- 
--   DECLARE
--     v_a_cobrar numeric := 0;
--     v_vence_este_mes numeric := 0;
--     v_vencido numeric := 0;
--     v_cuotas_vencidas bigint := 0;
--     v_clientes_con_deuda bigint := 0;
--     v_hoy date;
--   BEGIN
--     v_hoy := (now() AT TIME ZONE v_zona)::date;
-- 
--     SELECT
--       COALESCE(SUM(monto - monto_pagado), 0) INTO v_a_cobrar
--     FROM cuota_financiada
--     WHERE id_tenant = v_tenant_id AND estado IN ('pendiente', 'parcial');
-- 
--     SELECT
--       COALESCE(SUM(monto - monto_pagado), 0) INTO v_vence_este_mes
--     FROM cuota_financiada
--     WHERE id_tenant = v_tenant_id AND estado IN ('pendiente', 'parcial')
--       AND date_trunc('month', (fecha_vencimiento AT TIME ZONE v_zona)::timestamp)::date = date_trunc('month', v_hoy::timestamp)::date;
-- 
--     SELECT
--       COALESCE(SUM(monto - monto_pagado), 0) INTO v_vencido
--     FROM cuota_financiada
--     WHERE id_tenant = v_tenant_id AND estado IN ('pendiente', 'parcial')
--       AND (fecha_vencimiento AT TIME ZONE v_zona)::date < v_hoy;
-- 
--     SELECT
--       COUNT(*) INTO v_cuotas_vencidas
--     FROM cuota_financiada
--     WHERE id_tenant = v_tenant_id AND estado IN ('pendiente', 'parcial')
--       AND (fecha_vencimiento AT TIME ZONE v_zona)::date < v_hoy;
-- 
--     SELECT
--       COUNT(DISTINCT v.id_cliente) INTO v_clientes_con_deuda
--     FROM cuota_financiada cf
--     JOIN venta v ON v.id_venta = cf.id_venta
--     WHERE cf.id_tenant = v_tenant_id AND cf.estado IN ('pendiente', 'parcial') AND v.id_cliente IS NOT NULL;
-- 
--     v_por_cobrar := jsonb_build_object(
--       'a_cobrar', v_a_cobrar,
--       'vence_este_mes', v_vence_este_mes,
--       'vencido', v_vencido,
--       'cuotas_vencidas', v_cuotas_vencidas,
--       'clientes_con_deuda', v_clientes_con_deuda
--     );
--   END;
-- 
--   DECLARE
--     v_a_rendir numeric := 0;
--     v_rendiciones_sin_pagar numeric := 0;
--   BEGIN
--     SELECT COALESCE(SUM(monto_proveedor), 0) INTO v_a_rendir
--     FROM v_linea_venta
--     WHERE id_tenant = v_tenant_id
--       AND id_rendicion IS NULL
--       AND excluida_rendicion = false
--       AND monto_proveedor > 0
--       AND estado_venta = 'registrada'
--       AND devuelta = false;
-- 
--     SELECT COALESCE(SUM(monto_total), 0) INTO v_rendiciones_sin_pagar
--     FROM rendicion_proveedor
--     WHERE id_tenant = v_tenant_id AND estado = 'pendiente';
-- 
--     v_deuda_proveedores := v_a_rendir + v_rendiciones_sin_pagar;
--   END;
-- 
--   RETURN QUERY SELECT
--     v_capital_propio,
--     v_mercaderia_terceros,
--     v_devueltos_clientes,
--     v_valor_venta_potencial,
--     v_productos_sin_precio,
--     v_por_cobrar,
--     v_deuda_proveedores;
-- END;
-- $$;

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
  WHERE id_tenant = v_tenant_id AND tipo_ingreso = 'compra' AND estado_item IN ('disponible', 'reservado', 'en_revendedora');

  SELECT
    COALESCE(SUM(costo_ingreso), 0) INTO v_mercaderia_terceros
  FROM item_producto
  WHERE id_tenant = v_tenant_id AND tipo_ingreso = 'consignacion' AND estado_item IN ('disponible', 'reservado', 'en_revendedora');

  SELECT
    COALESCE(SUM(costo_ingreso), 0) INTO v_devueltos_clientes
  FROM item_producto
  WHERE id_tenant = v_tenant_id AND estado_item = 'devuelto_cliente';

  SELECT
    COALESCE(SUM(p.precio_venta), 0) INTO v_valor_venta_potencial
  FROM item_producto ip
  JOIN producto p ON p.id_producto = ip.id_producto
  WHERE ip.id_tenant = v_tenant_id AND ip.estado_item IN ('disponible', 'reservado', 'en_revendedora');

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
