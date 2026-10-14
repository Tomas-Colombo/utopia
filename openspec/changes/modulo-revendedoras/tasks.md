# Tasks — modulo-revendedoras

**Delivery**: PRs encadenados, ≤400 líneas cada uno (`openspec/config.yaml`).
**Strict TDD**: activo. Test primero, verlo fallar, después implementar.
**Primera migración**: `00076` (hay 75). Renumerar si `finanzas-panel` u otro cambio suma antes.
**Protocolo**: `docs/protocolo-agentes.md` — un slice por vez, checklist de cierre con
salida cruda, reporte con "no verificado" honesto. El ejecutor no avanza sin OK.

Leyenda: `[ ]` pendiente · `[x]` hecho y verificado.

## Fase 0 — Gate humano

- [ ] Aprobación escrita del usuario sobre `proposal.md §4` (DR-1…DR-17). Ya aprobados: DR-13 (excepción DEFINER) y rol `Revendedora` bloqueado.
- [ ] `finanzas-panel` cerrado (todas sus tareas tildadas y mergeado). **No empezar antes.**
- [ ] Confirmar con el cliente las decisiones DR-4 (período), DR-5 (cambios), DR-6 (% del local);
  si no hay respuesta rige el fallback ya cerrado.

> Antes de cada slice: leer `AGENTS.md`, `docs/modulos.md`, `docs/protocolo-agentes.md`, y la
> **última** definición de cada `sp_*`/función que se va a tocar
> (`rg -l "function <nombre>" supabase/migrations | sort | tail -1`).
> Antes de escribir código Next.js, la guía relevante de `node_modules/next/dist/docs/`.

## Slice 1 — Módulo y entidad (~400) · REQ-RV-MOD-01…05, 08, 09, DB-01

- [x] Test primero: rol sin `revendedoras` rechazado; tenant con módulo apagado → `module-disabled`;
  tenants A/B aislados; inserción cruzada rechazada.
- [x] Migración `00076_revendedora.sql`: fila en `modulo`, tabla `revendedora`, RLS, trigger,
  `sp_crear/editar/baja_revendedora` con `auditoria` y chequeo de `tenant_modulo`. `-- DOWN:` probado.
- [x] `supabase/seed.sql`, `CATALOGO_PERMISOS`, `MODULO_NOMBRE`, `docs/modulos.md`, Sidebar.
- [x] `lib/types`, `lib/validation/revendedoras.ts`, `lib/dal/revendedoras/`, slugs en `mensajes.ts`.
- [x] `app/(app)/revendedoras/` (layout `ver`, lista, `nuevo`, `[id]`) con Server Actions de tres puertas.
- [x] Test: `RolesModal`/`PermisosEditor` muestran el módulo y `permisosSchema` lo acepta.
- [x] Doc de provisión (REQ-RV-MOD-06).

## Slice 1b — Seguridad por usuario (~400) ⚠⚠ · REQ-RV-ACC-01, 02, 10…12

Prerrequisito de todo lo que lee una revendedora. `/judgment-day` antes de empezar.

- [x] Test primero (matriz ACC-07, puntos 1–3 y 7): sesión de revendedora sin acceso a nada
  fuera de la lista blanca; sesión de operador sin cambios; **la suite existente en verde**.
- [x] Migración: `revendedora.id_usuario` único parcial; hook con claim `id_revendedora`
  (partir de la última definición de `custom_access_token_hook`); `auth_revendedora_id()`.
  **Paso manual**: el hook está registrado a mano en cada proyecto Supabase; verificar que sigue activo.
- [x] Migración: policy `RESTRICTIVE` en las 36 tablas, generada y revisada, con `-- DOWN:` probado.
- [x] Guardia anti-olvido (ACC-11) como test de DB.
- [x] Documentar la regla nueva en `AGENTS.md` (la "RLS solo por tenant" deja de ser absoluta).

## Slice 1c — Alta del login de la revendedora (~300) · REQ-RV-ACC-03, 04

- [ ] Rol `Revendedora` (creado al habilitar el módulo), acciones `ver_propio`/`declarar` en el catálogo,
  triggers de consistencia rol↔enlace.
- [ ] Acción única "dar acceso" / "revocar acceso" con dos entradas (DR-17): *Administración → Usuarios*
  (al elegir rol `Revendedora`, exige elegir una revendedora sin acceso) y atajo en la ficha. Patrón
  `inviteUsuario` con compensación; `tenantId` de la sesión; exige `administracion/crear` y `revendedoras/editar`.
- [ ] `RolesModal` muestra el rol `Revendedora` con permisos bloqueados.
- [ ] `Session.idRevendedora`; `app/(app)/layout.tsx` redirige a `/mi-cuenta`.
- [ ] Tests: cada acción administrativa rechazada con sesión de revendedora (ACC-42).

## Slice 2 — Estado `en_revendedora` (~250) ⚠ · REQ-RV-DB-02

- [x] `00081_estado_en_revendedora.sql` — **solo** el `ADD VALUE`.
- [x] `00082_transicion_en_revendedora.sql` — matriz de transiciones (test tabla-manejada completo).
- [x] Auditar los 19 archivos de `EstadoItem`; guardia `never` en badges; test.
- [x] Auditar `rf_finanzas_posicion`/mercadería/capital propio por enumeraciones de estado y decidir.
- [x] `/code-review` sobre `consignaciones` e `inventario` antes de extender.

## Slice 3 — Consignación de salida: schema + SP (~400) · REQ-RV-DB-03

- [x] Test primero: confirmar mueve estado; `reservado` rechazado; mismo ítem en dos abiertas
  rechazado; devolución restaura; cerrar con ítems en poder rechazado; auditoría; aislamiento.
- [x] `00084_consignacion_revendedora.sql` y `00085_consignacion_revendedora_functions.sql`
  (tablas, índice parcial, 6 SPs, `rf_stock_por_tenencia`). `-- DOWN:` probado.
- [x] Slugs nuevos en `mensajes.ts` + inventario del test.

## Slice 4 — Consignación de salida: UI (~400)

- [x] `app/(app)/revendedoras/[id]/consignaciones/` lista, detalle, `nueva` (reutiliza el patrón
  de lookup de `app/api/consignaciones/lookup-item`), devolución con rama dañado.
- [x] Columna/filtro de tenencia en inventario, **condicionados** a `hasModuleAccess`.
- [x] Playwright: entregar → desaparece de disponibilidad central → devolver → vuelve.
- [ ] Verificación en pantalla (claro, oscuro, móvil, consola y red sin errores).

## Slice 5 — Motor de comisiones (~400) · REQ-RV-DB-04

- [x] `lib/comisiones/__fixtures__/escalas.ts` primero; test unitario y test de DB sobre la misma tabla.
- [x] `00086_comisiones.sql`: enums, `regla_comision`, `escala_comision`, `EXCLUDE` de vigencias,
  `fn_resolver_comision`, semilla al habilitar módulo (`sp_toggle_tenant_modulo`).
- [x] `lib/comisiones/resolver-comision.ts`; editor de la regla general en `revendedoras/comisiones/` y
  **editor de comisión propia en la ficha de cada revendedora** (escala o % fijo, muestra si rige la
  propia o la general). Test: cambiar la regla no altera liquidaciones ya generadas.
- [x] `/code-review` sobre `precios` (el resolutor que se espeja).

## Slice 6a — Venta por canal: schema + trigger + SP (~400) ⚠⚠ · REQ-RV-DB-05

Mayor riesgo del cambio. `/judgment-day` sobre `ventas` antes de empezar.

- [ ] **Primero**: correr el set completo de ventas con `canal` por defecto; debe quedar verde.
- [ ] Tests nuevos: venta de ítem que no tiene → rechazada; sin `id_revendedora` → check; local sin
  cambios; módulo apagado → `modulo-revendedoras-deshabilitado`; UPDATE directo de línea → rechazado.
- [ ] `00082_venta_canal.sql` (columnas + trigger de inmutabilidad ampliado),
  `00083_sp_registrar_venta_canal.sql` (desde `00068`), `00084_anular_venta_revendedora.sql`
  (DR-7, desde `00070`/`00071`).
- [ ] Contrato DAL↔SQL: pegar lado a lado firma del SP y parámetros del DAL.

## Slice 6b — Venta por canal: finanzas (~350) ⚠ · REQ-RV-DB-08

- [ ] **Escenario dorado de revendedoras** en `specs/golden.md`, calculado a mano, antes de implementar.
- [ ] `00091_finanzas_comision.sql`: `v_linea_venta`, `rf_finanzas_resultados`, `_flujo`, `_posicion`
  (todas desde su última definición). `INVOKER`. (Nota: `pago_revendedora` y deuda de revendedoras entran en Slice 7a con las tablas correspondientes).
- [ ] DAL `lib/dal/reportes/finanzas.ts` y tipos; sin aritmética de dinero en TS.

## Slice 6c — Venta por canal: UI (~300)

- [ ] Selector de canal en `NuevaVentaView` (oculto sin módulo/permiso); Server Action exige
  `revendedoras/crear` si `canal != local`; lookup acotado a lo que la revendedora tiene.
- [ ] Preview de comisión en `CobranzaPanel` rotulado "estimación".
- [ ] Canal en `VentasFiltros`/lista, **ignorado** si el módulo está apagado.
- [ ] Playwright: venta de revendedora de punta a punta; y con módulo apagado el selector no existe.

## Slice 6d — Pago de venta de revendedora (~250) · REQ-RV-DB-05b

- [x] `alter type medio_pago add value 'cuenta_revendedora'` en migración propia.
- [x] `sp_registrar_venta` registra el pago con ese medio solo en canal revendedora; finanzas
  lo excluye de `cobrado`. Test de cuadre y de caja. **Va antes de dar por terminado el 6a.**

## Slice 4b — Panel de gestión del local (~400) · REQ-RV-ADM

Después de la consignación (Slice 4) y antes de la liquidación: da visibilidad temprana.

- [x] Test primero: panel con 2 tenants; filtros; permisos por acción; 200 revendedoras sin N+1.
- [x] `rf_panel_revendedoras` (`INVOKER`) y DAL; `/revendedoras` pasa a ser el panel con
  tarjetas, filtros y CSV; ficha con pestañas; vista "quién tiene qué" (ADM-12).
- [x] Las pestañas de Ventas, Cuenta y Liquidaciones se completan en los slices 6c y 7b.

## Slice 7a — Liquidación: schema + SP (~400) ⚠⚠ · REQ-RV-DB-06

`/judgment-day` sobre `rendiciones` antes de empezar.

- [ ] Tests primero: tramo por total del período y no por venta; excluidas no se sellan; no se
  liquida dos veces; venta registrada entre preview y commit se captura; anular venta liquidada
  rechazado; pago a cuenta de otro tenant rechazado; sin acción `liquidar` rechazado.
- [ ] `00094_liquidacion_revendedora.sql`, `00095_liquidacion_functions.sql`
  (desde la última `sp_generar_rendicion`). `-- DOWN:` probado.

## Slice 7b — Liquidación: UI (~380)

- [x] `[id]/cuenta/`, `liquidaciones/` (lista, `nueva` con preview y exclusión, detalle con pago).
  Acción `liquidar` gobierna generar/pagar. Espejo de `app/(app)/rendiciones/`.
- [x] Playwright: preview → excluir línea → generar → marcar pagada.

## Slice 8 — Cambios de producto (~400) · REQ-RV-DB-07

- [x] Tests: stock conservado; línea original excluida; comisión total invariante; cambio sobre
  venta liquidada rechazado; origen local vs. revendedora (`tests/db/cambio-venta-local.test.ts`, `tests/db/cambio-venta-revendedora.test.ts`, `tests/db/cambio-venta-rechazos.test.ts`).
- [x] `00098_cambio_venta.sql`, `00099_sp_registrar_cambio.sql`, `00100_finanzas_cambio.sql`, `00101_panel_revendedoras_cambio.sql`; acción en `VentaDetalleView` condicionada al módulo para canal revendedora.

## Slice 9 — Reportes (~350) · REQ-RV-DB-08

- [x] `00102_reportes_revendedoras.sql`: `rf_perfil_revendedora`, `rf_cumplimiento_objetivos`, `rf_resumen_canal` (`INVOKER`).
- [x] `bloquesVisibles` + bloque `revendedoras` (test de visibilidad por módulo y permiso);
  `BloqueError` aislado; CSV con `csvNegative`.
- [x] `tests/db/reportes-revendedoras.test.ts` con fixture fijo y cifras calculadas a mano.

## Slice 9b — Declaración de venta: DB (~350) · REQ-RV-ACC-30…33

- [x] Test primero (ACC-07 puntos 4–6): declarar ítem ajeno o `disponible` rechazado; doble
  declaración pendiente rechazada; confirmar crea venta canal revendedora y enlaza `id_venta`;
  rechazar exige motivo; ella no puede confirmar.
- [x] Migración: tabla, índice único parcial, SPs `declarar/retirar/confirmar/rechazar`.

## Slice 9c — Funciones `rvp_*` (~350) ⚠ · REQ-RV-ACC-20…23

Excepción DEFINER (DR-13) **aprobada por el usuario el 2026-10-09**; no volver a pedirla. Alcance: solo funciones `rvp_*`.

- [ ] Test primero: snapshot sin columnas prohibidas, aislamiento A/B/otro tenant, módulo apagado.
- [ ] `rvp_mi_stock`, `rvp_mis_ventas`, `rvp_mi_cuenta`, `rvp_mis_liquidaciones`; `search_path`
  fijo, identidad solo del claim. Actualizar la regla de `AGENTS.md`.

## Slice 9d — Pantallas de la revendedora y confirmación del local (~400)

- [ ] `app/(revendedora)/mi-cuenta/`: stock en poder, ventas, deuda, declarar y retirar. Móvil
  primero (ella usa el celular), claro/oscuro.
- [ ] Bandeja de declaraciones pendientes para el local en `revendedoras/declaraciones`
  (acción `crear`), con confirmar y rechazar.
- [ ] Playwright: ella declara → ve "pendiente" → el local confirma → ella ve la deuda actualizada;
  y una segunda revendedora no ve nada de la primera.
- [ ] Verificación en pantalla.

## Slice 10 — Cierre

- [ ] Matriz de bloqueo de `REQ-RV-MOD` completa: un test por fila.
- [ ] Matriz de aislamiento `REQ-RV-ACC-07` completa.
- [ ] `docs/modulos.md`, `AGENTS.md` (si cambia una regla) y este `tasks.md` al día.
- [ ] `pnpm typecheck && pnpm lint && npx vitest run --exclude "tests/db/**" && pnpm build` y
  `supabase db reset` + `npx vitest run tests/db` con conteos pegados.
- [ ] Revisión del diff completo por un revisor distinto del ejecutor.

## Resumen

| Slice | Entrega | Riesgo |
|---|---|---|
| 1 | Módulo, permisos, entidad | Medio |
| 2 | Estado `en_revendedora` | Alto |
| 3–4 | Consignación de salida | Medio |
| 5 | Comisiones | Medio |
| 6a–c | Venta por canal + finanzas | **Muy alto** |
| 7a–b | Liquidación | **Muy alto** |
| 8 | Cambios | Alto |
| 9 | Reportes | Medio |
| 4b | Panel de gestión del local | Medio |
| 1b–1c | Seguridad por usuario y alta de login | **Muy alto** |
| 6d | Pago de venta de revendedora | Alto |
| 9b–9d | Declaración, `rvp_*` y pantallas de la revendedora | Alto |
| 10 | Cierre y matriz de bloqueo | Bajo |

Migraciones previstas desde `00076`; numerarlas en el orden real de aplicación (~20).
