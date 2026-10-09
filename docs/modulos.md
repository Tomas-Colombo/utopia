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
| `revendedoras` | `revendedoras` | `revendedoras` |
| `ventas` | `ventas` | `ventas` |
| — (sin ruta propia) | — | `reservas` |

Permisos existentes (9): administracion, consignaciones, gastos, inventario,
precios, rendiciones, reportes, revendedoras, ventas. **No existen** `clientes`, `cuotas` ni
`proveedores` como permiso.

Esto es deliberado: clientes y cuotas viven bajo el permiso de ventas;
proveedores bajo el de inventario.

Verificado contra los `layout.tsx` el 2026-10-06. La columna DAL sale del
listado de `lib/dal/`; el vínculo `proveedores` → `inventario` en DAL no está
verificado (revisar antes de afirmarlo).

## Provisión de nuevos clientes (Tenants)

Al ejecutar el script de provisión de tenants (`pnpm provision-tenant`), el comportamiento por defecto (sin pasar la opción `--modulos`) habilita **todo** el catálogo de módulos.
Es importante notar que **Revendedoras** es un módulo opcional y vendible por separado. Si un cliente no contrata este módulo, se debe aprovisionar pasando explícitamente la bandera `--modulos` con la lista exacta de módulos que sí contrató, excluyendo a `revendedoras` (por ejemplo: `--modulos ventas,inventario,administracion,precios`).
