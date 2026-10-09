# Protocolo de trabajo con agentes

Cómo se encarga y se cierra una porción de trabajo (un *slice*) cuando lo hace
un agente de IA. Las reglas permanentes del proyecto viven en `AGENTS.md`; acá
está el procedimiento. Nació de los errores del módulo de finanzas, así que
cada punto responde a algo que pasó.

## Quién hace qué

| Rol | Hace | No hace |
| --- | --- | --- |
| **Ejecutor** (el agente que escribe) | Código, tests, migraciones, commit. Reporta con salida cruda. | Aprobarse a sí mismo. Avanzar al siguiente slice sin OK. |
| **Revisor** (otro agente, distinto del ejecutor) | Lee el diff contra el spec y verifica por su cuenta (typecheck, lint, tests). | Escribir el código que revisa. |
| **Persona** | Prueba en pantalla, corre `tests/db` con Docker, contrasta números con datos reales, da el OK. | Confiar en un resumen sin evidencia. |

Un resumen del ejecutor es una pista. El diff y la salida de los comandos son la evidencia.

## Plantilla del prompt de slice

Copiar, completar lo que está entre `<>` y pegar al ejecutor.

~~~text
Slice <N> — <nombre>. Spec: openspec/changes/<cambio>/tasks.md, sección "Slice <N>".
Requisitos que cierra: <REQ-...>.

Antes de escribir código:
1. Leé AGENTS.md y docs/protocolo-agentes.md.
2. Leé el spec del slice y los archivos que vas a tocar. Si vas a modificar un
   sp_*, copiá su ÚLTIMA definición: rg -l "function <sp>" supabase/migrations | sort | tail -1
3. Decime en 3-5 líneas qué vas a hacer y qué NO vas a tocar. Esperá mi OK.

Reglas de este slice:
- Test primero (TDD): escribilo, mostrame que falla, después implementá.
- Lecturas (rf_*) y vistas: SECURITY INVOKER. Nunca SECURITY DEFINER.
- Toda migración nueva lleva un -- DOWN: completo y lo probás (ver checklist).
- Todo slug nuevo que levante un sp_* va a lib/errores/mensajes.ts. El test
  lib/errores/slugs-migraciones.test.ts lo exige.
- No cambies una aserción para que pase sin decirme si el error era del test o del código.
- Alcance cerrado: nada fuera de la lista del spec. Si ves algo más, anotalo y no lo hagas.

Al terminar: corré el checklist de cierre, pegá el reporte con el formato de
docs/protocolo-agentes.md y PARÁ. No empieces el slice <N+1>.
~~~

## Checklist de cierre (definición de hecho)

El ejecutor no dice "listo" hasta tener todo esto, con la salida pegada.

1. **Gate completo**, encadenado:
   ```bash
   pnpm typecheck && pnpm lint && npx vitest run --exclude "tests/db/**" && pnpm build
   ```
   Si el lint tiene errores, el gate falló, aunque el build pase.
2. **Base de datos**, si el slice toca SQL: `supabase db reset` y después la suite
   **completa**: `npx vitest run tests/db`. No alcanza con los tests nuevos: una
   migración puede romper tests viejos (pasó con la cascada de incobrables).
   Reportar archivos y cantidad de tests, no solo "verde".
3. **DOWN probado**: aplicar el bloque `-- DOWN:` sobre la base recién migrada y
   comprobar que no falla. Ojo con el orden: una función SQL depende de las que usa.
4. **Contrato DAL ↔ SQL**, si el slice toca un `rpc(...)`: pegar lado a lado la
   firma del `sp_*` y los parámetros que envía el DAL. TypeScript no los cruza.
5. **Mutaciones**: `requireModuleRole` primero, `safeParse` con `strictObject`,
   `parsed.data` al DAL. Revisarlo en cada Server Action nueva.
6. **Pantallas**: ver la pantalla de verdad (claro, oscuro, ancho móvil, consola y
   red sin errores). Un test de render no reemplaza esto. Si el agente no puede
   abrir un navegador, escribe "no verificado en pantalla" y lo hace la persona.
7. **Commit limpio**:
   - Agregar archivos por nombre, no con `git add -A`.
   - Sin scripts de prueba ni credenciales (`scratch/`, `*.mjs` sueltos).
   - Mostrar `git status` (limpio) y `git show --stat HEAD`.
   - Confirmar que la migración nueva está dentro del commit.
8. **Docs**: tildar en `tasks.md` solo lo hecho y verificado, con los números de
   migración reales. Los ítems no verificados quedan sin tildar.

## Formato del reporte de cierre

```text
Slice <N> — <nombre>
Commit: <hash>

Verificado (con salida pegada):
- gate: <typecheck / lint / tests unitarios / build>
- tests/db: <archivos> archivos, <tests> tests
- DOWN: <aplicado sin errores / no aplica>

No verificado:
- <pantalla / base cloud / lo que no se pudo correr, y por qué>

Decisiones que me apartan del spec:
- <ninguna / cuáles y por qué>
```

Un "no verificado" honesto vale más que un "todo verde" sin salida.

## Qué sigue pendiente aunque el slice cierre

Lo que el ejecutor no puede comprobar y queda para la persona antes de mergear:

- Prueba en pantalla de los flujos tocados.
- Los chequeos contra la base real (datos históricos que una migración modifica).
- La revisión del diff completo por un revisor distinto del ejecutor.
