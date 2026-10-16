# Tasks — modulo-revendedoras

**Estado (2026-10-16)**: slices 1 a 10 implementados e integrados en main. El detalle de cada
slice cerrado está en [`archive/tasks-completadas.md`](archive/tasks-completadas.md). Acá queda
solo lo abierto.

**Protocolo**: `docs/protocolo-agentes.md`. Antes de tocar un `sp_*`: `pnpm sp:last <nombre>`.
Antes de escribir código Next.js, la guía relevante de `node_modules/next/dist/docs/`.

Leyenda: `[ ]` pendiente · `[x]` hecho y verificado. Las compuertas humanas (Fase 0,
verificación en pantalla, revisión) las tilda la persona, nunca el agente.

## Fase 0 — Gate humano

- [ ] Aprobación escrita del usuario sobre `proposal.md §4` (DR-1…DR-17). Ya aprobados: DR-13 (excepción DEFINER) y rol `Revendedora` bloqueado.
- [ ] `finanzas-panel` cerrado (todas sus tareas tildadas y mergeado). **No empezar antes.**
- [ ] Confirmar con el cliente las decisiones DR-4 (período), DR-5 (cambios), DR-6 (% del local);
  si no hay respuesta rige el fallback ya cerrado.

## Abierto en slices implementados

### Slice 4 — Consignación de salida: UI

- [ ] Verificación en pantalla (claro, oscuro, móvil, consola y red sin errores).

### Slice 6b — Venta por canal: finanzas · REQ-RV-DB-08

- [ ] **Escenario dorado de revendedoras** en `specs/golden.md`, calculado a mano, antes de implementar.

### Slice 10 — Cierre

- [ ] Revisión del diff completo por un revisor distinto del ejecutor.

## Resumen

| Slice | Entrega | Estado |
|---|---|---|
| 1, 1b, 1c | Módulo, seguridad por usuario, alta de login | Hecho |
| 2, 3, 4 | Estado `en_revendedora`, consignación de salida | Hecho; falta verificación en pantalla del 4 |
| 4b | Panel de gestión del local | Hecho |
| 5 | Comisiones | Hecho |
| 6a, 6c, 6d | Venta por canal, UI, pago de venta | Hecho |
| 6b | Finanzas por canal | Hecho; el ítem del escenario dorado sigue sin tildar |
| 7a, 7b | Liquidación | Hecho |
| 8 | Cambios | Hecho |
| 9, 9b, 9c, 9d | Reportes, declaración, `rvp_*`, pantallas de la revendedora | Hecho |
| 10 | Cierre y matrices | Hecho; falta la revisión independiente |
