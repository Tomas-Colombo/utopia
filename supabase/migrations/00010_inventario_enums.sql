-- 00010_inventario_enums.sql
-- UP: enums for Etapa 3 (Inventario) — item state machine, ingreso type,
--     proveedor type. State machine transitions are enforced by
--     `sp_transicion_item_producto` in 00016 (design ítem-state-machine,
--     Planificacion.txt Etapa 3 §71 "no se puede llevar un ítem a un
--     estado inválido").
-- DOWN:
--   drop type if exists tipo_proveedor;
--   drop type if exists tipo_ingreso;
--   drop type if exists estado_item;

-- Item lifecycle (physical unit of inventory). One QR per item.
--   disponible → reservado → vendido       (venta directa o desde reserva)
--   disponible → devuelto                  (nunca ingresó al stock efectivo)
--   reservado  → disponible                (reserva liberada/cancelada)
--   vendido    → devuelto_cliente          (devolución del cliente)
--   vendido    → devuelto                  (devolución al proveedor luego de venta) — via ajuste
--   disponible → devuelto (consignación)   (devolución al proveedor sin venta)
--   cualquier  → baja                      (baja lógica por ajuste de inventario)
create type estado_item as enum (
  'disponible',
  'reservado',
  'vendido',
  'devuelto',
  'devuelto_cliente',
  'baja'
);

-- Tipo de ingreso de mercadería (Planificacion.txt Etapa 3 §66).
-- `compra`      = mercadería propia; costo se paga al ingresar.
-- `consignacion`= mercadería del proveedor; se paga cuando se vende
--                 (RendicionProveedor, Etapa 7).
create type tipo_ingreso as enum ('compra', 'consignacion');

-- Tipo de proveedor. `mayorista`/`particular` es la distinción operativa
-- del anexo; extender si aparecen otros tipos.
create type tipo_proveedor as enum ('mayorista', 'particular', 'consignatario');
