-- 00062_anular_venta_libera_item.sql
-- UP: permitir la transición `vendido -> disponible`.
--
--     ─── El bug ───────────────────────────────────────────────────────
--     `sp_anular_venta` (00023) devuelve cada ítem a `disponible`:
--
--         perform sp_transicion_item_producto(
--           r_det.id_item, 'disponible', 'ajuste', p_id_venta, 'anulacion_venta', p_ip);
--
--     …pero `is_transicion_item_valida` (00016) nunca aceptó esa transición:
--     desde `vendido` sólo permitía `devuelto_cliente`, `devuelto` y `baja`.
--     Resultado: anular una venta SIEMPRE falló con
--     `22023: invalid-transition: vendido -> disponible`, desde Etapa 5.
--
--     No lo detectó nadie porque el botón "Anular venta" no tenía cobertura:
--     `e2e/tests/ventas.spec.ts` no lo ejerce y no había tests de base sobre
--     ventas. Lo encontró `tests/db/cuotas.test.ts` al anular una venta
--     financiada para verificar que sus cuotas quedaran en `anulada`.
--
--     ─── Por qué se arregla acá y no en sp_anular_venta ───────────────
--     La alternativa era encadenar `vendido -> devuelto_cliente -> disponible`
--     sin tocar la máquina de estados. Se descartó: `devuelto_cliente`
--     significa que el cliente trajo la mercadería de vuelta, y en una
--     anulación eso NO pasó. Dejaría un hecho falso en la ficha del producto y
--     en `movimiento_item`, que es justamente el registro que se consulta para
--     entender qué le pasó a un ítem.
--
--     Anular una venta es afirmar que la venta no existió. El ítem vuelve a
--     estar disponible porque nunca dejó de estarlo.
--
--     ─── Qué NO se pierde ─────────────────────────────────────────────
--     La transición sigue siendo trazable: `sp_transicion_item_producto`
--     escribe SIEMPRE en `movimiento_item` (con `tipo_movimiento` y
--     `referencia_tipo = 'anulacion_venta'`) y en `auditoria`. Aflojar el
--     grafo de estados no afloja el rastro — sólo deja de rechazar un
--     movimiento que el sistema ya intentaba hacer y registrar.
--
--     `devuelto` y `baja` siguen siendo terminales, que es la restricción que
--     de verdad protege el inventario: de ahí no se vuelve.
-- DOWN: al final, comentado.

create or replace function is_transicion_item_valida(
  p_desde estado_item, p_hasta estado_item
) returns boolean language sql immutable as $$
  select case
    -- Alta (no hay estado previo): manejado por confirmar_ingreso, no por transición
    when p_desde = 'disponible'       and p_hasta in ('reservado', 'vendido', 'devuelto', 'baja') then true
    when p_desde = 'reservado'        and p_hasta in ('disponible', 'vendido', 'baja') then true
    -- `disponible` agregado en 00062: es la anulación de venta. Distinto de
    -- `devuelto_cliente`, que afirma que el cliente devolvió la mercadería.
    when p_desde = 'vendido'          and p_hasta in ('disponible', 'devuelto_cliente', 'devuelto', 'baja') then true
    when p_desde = 'devuelto_cliente' and p_hasta in ('disponible', 'baja') then true
    -- 'devuelto' y 'baja' son estados terminales (excepto reingreso manual = nuevo item)
    else false
  end;
$$;

grant execute on function is_transicion_item_valida(estado_item, estado_item) to authenticated;

-- ─── DOWN ────────────────────────────────────────────────────────────
--   -- Recrear la versión de 00016 (sin 'disponible' desde 'vendido').
--   -- OJO: con la versión vieja, sp_anular_venta vuelve a fallar siempre.
