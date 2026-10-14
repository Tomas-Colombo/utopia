# REQ-RV-ACC — Acceso de la revendedora (login real)

**Change**: `modulo-revendedoras`
La revendedora entra con usuario y contraseña, ve **solo lo suyo** (qué tiene en poder,
cuánto vendió, cuánto le debe al local) y **declara** lo que vendió. El local confirma.

## Por qué hace falta seguridad por usuario (y qué cambia)

Hoy `auth_tenant_id()` es el único helper y las 40 policies (36 tablas) filtran solo por
tenant. Una sesión de revendedora vería costos, proveedores, ventas de otras revendedoras y
gastos con solo usar la clave pública. `requireModuleRole` no ayuda: es una guarda de
aplicación, no un límite de datos.

**Enfoque: denegar por defecto.** En vez de reescribir las 36 policies una por una, se agrega
una policy `RESTRICTIVE` por tabla. Una restrictiva se combina con AND con las existentes, así
que no puede abrir nada por error: solo puede cerrar.

## ACC-01 Identidad

- **REQ-RV-ACC-01** Una revendedora con acceso es una fila de `usuario` (con `rol`) enlazada por
  `revendedora.id_usuario` (único, parcial no nulo). El hook `custom_access_token_hook`
  (`00008`) agrega el claim `id_revendedora` cuando `revendedora.id_usuario = user_id` y lo
  quita si no (nunca un claim viejo). Helper `auth_revendedora_id()` análogo a
  `auth_tenant_id()`, leyendo de `auth.jwt()`.
- **REQ-RV-ACC-02** El claim lo escribe **solo** el hook, nunca el cliente. Un usuario del
  local jamás lo tiene. Se testea: sesión de operador → `auth_revendedora_id()` es null.
- **REQ-RV-ACC-03** Rol `Revendedora` por tenant, con
  `permisos = {"revendedoras": ["ver_propio","declarar"]}`. Dos acciones nuevas en
  `CATALOGO_PERMISOS` (`ver_propio`, `declarar`) separadas de `ver` para que el rol
  administrativo y el de revendedora no se confundan. El rol **aparece en la lista de roles**
  de Administración como cualquier otro, pero sus permisos están bloqueados (no se le pueden
  agregar módulos). Un trigger impide asignar a un `usuario` enlazado a una revendedora
  cualquier rol con otros módulos o acciones, y impide enlazar a una revendedora un usuario
  con otro rol. Se crea al habilitar el módulo, junto con la semilla de comisiones.
- **REQ-RV-ACC-04** **El acceso se crea como cualquier usuario limitado del local** (DR-17).
  Dos entradas, una sola acción de servidor:
  1. *Administración → Usuarios → Nuevo usuario*: al elegir el rol `Revendedora`, el formulario
     exige elegir una revendedora **sin acceso** de la lista. Otros roles no muestran ese campo.
  2. Atajo *"Dar acceso"* en la ficha de la revendedora: precarga el rol y la revendedora.
  La acción exige el permiso que ya gobierna crear usuarios (`administracion/crear`) **y**
  `revendedoras/editar`. Crea el usuario de Auth, la fila `usuario` y el enlace en una
  operación, con el patrón `inviteUsuario` (compensación si falla un paso). `tenantId` sale de
  la sesión verificada, nunca del input. El **enlace** es lo que activa el aislamiento de
  datos: un usuario con rol `Revendedora` sin enlace queda sin acceso a nada.
  Revocar acceso = desactivar el usuario y poner `id_usuario = null`; la revendedora y su
  historial se conservan. Restablecer contraseña usa el flujo existente de Administración.
- **REQ-RV-ACC-05** Los usuarios del local (empleados con permisos limitados) siguen como hoy:
  sin claim `id_revendedora`, ven los datos de su tenant según su rol. Lo nuevo es solo para
  revendedoras, porque son externas al negocio.

## ACC-02 Aislamiento en la base (REQ-RV-ACC-10…)

- **REQ-RV-ACC-10** **Todas** las tablas con RLS reciben una policy
  `RESTRICTIVE for all to authenticated using (auth_revendedora_id() is null)`, **salvo** las
  tablas de la lista blanca de §ACC-03. Una sesión de revendedora no lee ni escribe nada fuera
  de esa lista, ni siquiera de su propio tenant.
- **REQ-RV-ACC-11** **Guardia anti-olvido.** Un test de DB enumera `pg_policies`/`pg_class` y
  falla si existe una tabla de `public` con RLS que no tenga la policy restrictiva ni esté en
  la lista blanca. Así una tabla futura no queda abierta a las revendedoras por omisión.
- **REQ-RV-ACC-12** `auth_revendedora_id()` es la **única** fuente de identidad; ninguna función
  ni acción de revendedora recibe `id_revendedora` como parámetro de entrada.

## ACC-03 Lista blanca (lo único que una revendedora puede tocar)

| Tabla | Lectura | Escritura | Filtro |
|---|---|---|---|
| `declaracion_venta_revendedora` | sí | `insert` | `id_revendedora = auth_revendedora_id()` |
| `revendedora` (su propia fila) | sí | no | idem |

Todo lo demás —consignaciones, ítems, productos, ventas, liquidaciones, pagos— lo ve **solo a
través de funciones de lectura** (siguiente punto). Nunca por `select` directo: las tablas
de ítems y líneas de venta tienen columnas de costo, y RLS filtra filas, no columnas.

## ACC-04 Lecturas con lista blanca de columnas

- **REQ-RV-ACC-20** Funciones `rvp_*` (`rvp_mi_stock`, `rvp_mis_ventas`, `rvp_mi_cuenta`,
  `rvp_mis_liquidaciones`) que:
  1. derivan la identidad de `auth_revendedora_id()` (jamás de un argumento) y levantan
     `no-revendedora` si es null;
  2. fijan `search_path`;
  3. devuelven un conjunto **explícito** de columnas. **Nunca**: `costo_*`, `costo_snapshot`,
     `monto_ganancia`, `id_proveedor`, `monto_proveedor`, datos de otras revendedoras, ni la
     regla completa de comisión de otras.
  4. validan que el módulo `revendedoras` esté habilitado para su tenant.
- **REQ-RV-ACC-21** Estas funciones son `SECURITY DEFINER`. **Es una excepción explícita a
  "lecturas `INVOKER`, nunca `DEFINER`"**, justificada porque RLS no puede ocultar columnas.
  **Aprobada por el usuario (2026-10-09).** Hay que actualizar esa regla en `AGENTS.md` en el mismo commit
  (alcance: prefijo `rvp_`, identidad solo del claim, columnas listadas, test de snapshot).
- **REQ-RV-ACC-22** Test de snapshot por función: el payload no contiene ninguna de las
  columnas prohibidas. Es el test que mantiene honesta la lista cuando el payload crece.
- **REQ-RV-ACC-23** Contenido de `rvp_mi_cuenta` (lo que ella pidió): piezas en su poder
  (cantidad y valor **a precio de venta**), vendido, comisión devengada, **adeudado al local**
  (ventas confirmadas sin liquidar + liquidaciones pendientes − pagos), pagado, y declaraciones
  pendientes de confirmar. La comisión mostrada antes de liquidar se rotula "estimada".

## ACC-05 Declaración de venta

- **REQ-RV-ACC-30** `declaracion_venta_revendedora` (`id_item`, `id_revendedora`, `fecha`,
  `nota`, `estado` `pendiente|confirmada|rechazada`, `id_venta` null, `motivo_rechazo`,
  `confirmada_por`, timestamps). Una declaración **no** mueve stock, ni plata, ni comisión.
- **REQ-RV-ACC-31** `sp_declarar_venta_revendedora(p_id_item, p_nota)` (`INVOKER`): valida
  `ACC` rol y módulo, que el ítem esté `en_revendedora` **de ella**, y que no haya otra
  declaración pendiente del mismo ítem (índice único parcial). Ella no informa precio ni
  medio de pago: el precio lo resuelve el sistema al confirmar (`precio-no-resoluble` si no se
  puede). Puede retirar una declaración `pendiente` (`sp_retirar_declaracion`).
- **REQ-RV-ACC-32** `sp_confirmar_declaracion_venta` (acción `revendedoras/crear` del local):
  llama a `sp_registrar_venta` con `canal='revendedora'` y enlaza `id_venta`.
  `sp_rechazar_declaracion_venta` exige motivo. Ambos auditan.
- **REQ-RV-ACC-33** Mientras esté pendiente, el ítem sigue figurando en su poder y la
  pantalla de ella muestra "pendiente de confirmar". El stock del local nunca depende de lo
  que ella escribe sin confirmación.

## ACC-06 Superficie de la aplicación

- **REQ-RV-ACC-40** Grupo de rutas propio `app/(revendedora)/mi-cuenta/**`, con su layout:
  exige sesión, `session.idRevendedora` no nulo y `requireModuleRole(session,'revendedoras','ver_propio')`.
  Sin Sidebar administrativo. Todo en español, voseo.
- **REQ-RV-ACC-41** `app/(app)/layout.tsx` redirige a `/mi-cuenta` cualquier sesión con
  `idRevendedora`. Una revendedora no renderiza ninguna pantalla del local ni siquiera vacía.
  `Session` suma `idRevendedora` (de `sp_session_context`).
- **REQ-RV-ACC-42** `requireModuleRole` rechaza `no-permission` por construcción (su rol solo
  tiene `revendedoras`), y las acciones administrativas de `revendedoras` exigen acciones que
  su rol **no** tiene (`ver`, `crear`, `liquidar`…). Se testea cada acción administrativa
  invocada con una sesión de revendedora.
- **REQ-RV-ACC-43** `proxy.ts` no cambia: la autoridad sigue siendo la base y el layout.

## ACC-07 Pruebas de aislamiento (matriz obligatoria)

Con dos revendedoras A y B del mismo tenant y una tercera de otro tenant:

1. A no ve filas, ni conteos, de B (directo ni por `rvp_*`).
2. A no puede `select` en `item_producto`, `producto`, `detalle_venta`, `venta`, `costo_*`,
   `proveedor`, `gasto_negocio`, `cliente`, `usuario`, `rol`: resultado vacío o error.
3. A no puede `insert/update/delete` en ninguna tabla fuera de la lista blanca.
4. A no puede declarar un ítem de B, ni un ítem `disponible`.
5. A no puede ejecutar `sp_*` administrativos (`sp_registrar_venta`, `sp_generar_liquidacion`,
   `sp_confirmar_declaracion_venta`, …).
6. `rvp_*` con módulo deshabilitado → `modulo-revendedoras-deshabilitado`.
7. Sesión de operador con `auth_revendedora_id() is null` conserva **todo** su comportamiento
   actual: la suite existente sigue verde sin tocar una aserción.
8. Payload de cada `rvp_*` sin columnas prohibidas (ACC-22).
