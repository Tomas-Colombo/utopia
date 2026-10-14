# Mapa de módulos

"Módulo" significa tres cosas distintas. Esta tabla las une. Fuente de verdad
de los permisos: `CATALOGO_PERMISOS` en `lib/types/administracion.ts` y el seed
de la tabla `modulo`. Si cambia el mapeo, se actualiza acá en el mismo commit.

| Ruta `app/(app)/` | Permiso que exige el layout (`ver`) | Dominio DAL `lib/dal/` |
| --- | --- | --- |
| `administracion` | `administracion` | `administracion` |
| `clientes` | `ventas` | `clientes` |
| `consignaciones` | `consignaciones` | `consignaciones` |
| `cuotas` | `ventas` | `cuotas` |
| `gastos` | `gastos` | `gastos` |
| `inventario` | `inventario` | `inventario` |
| `precios` | `precios` | `precios` |
| `proveedores` | `inventario` | (dentro de `inventario`) |
| `rendiciones` | `rendiciones` | `rendiciones` |
| `reportes` | `reportes` | `reportes` |
| `ventas` | `ventas` | `ventas` |
| — (sin ruta propia) | — | `reservas` |

Permisos existentes (8): administracion, consignaciones, gastos, inventario,
precios, rendiciones, reportes, ventas. **No existen** `clientes`, `cuotas` ni
`proveedores` como permiso.

Esto es deliberado: clientes y cuotas viven bajo el permiso de ventas;
proveedores bajo el de inventario.

Verificado contra los `layout.tsx` el 2026-10-06. La columna DAL sale del
listado de `lib/dal/`; el vínculo `proveedores` → `inventario` en DAL no está
verificado (revisar antes de afirmarlo).
