# Protocolo de trabajo con agentes

Cómo se encarga, se verifica y se cierra un slice hecho por un agente. Las
reglas permanentes viven en `AGENTS.md`; acá está el procedimiento.

## Roles

| Rol | Hace | No hace |
| --- | --- | --- |
| **Ejecutor** | Código, tests, migraciones, commits. Corre el gate y pega `.gate/report.txt`. | Aprobarse a sí mismo. Tildar compuertas humanas. |
| **Revisor** (agente distinto del ejecutor) | Lee el diff contra el spec y corre el gate por su cuenta. | Escribir el código que revisa. |
| **Persona** | Prueba en pantalla, contrasta cifras con datos reales, decide en los puntos de parada y da el OK. | Confiar en un resumen sin el reporte del gate. |

## Plantilla de prompt del ejecutor

~~~text
Slice <N> — <nombre>. Spec: openspec/changes/<cambio>/tasks.md, "Slice <N>". Cierra: <REQ-...>.
Rama: <tipo>/<nombre> desde main, en tu propio worktree.
Leé AGENTS.md, este protocolo y el spec del slice. Antes de tocar un sp_*: pnpm sp:last <nombre>.
TDD: test primero (incluidos los casos negativos del spec), mostrá que falla, después implementá.
Alcance cerrado: lo que veas fuera del spec lo anotás en el reporte, no lo hacés.
Encadená las tareas del slice sin pedir OK salvo en un punto de parada (ver abajo).
Al terminar: pnpm gate:full, reporte con el formato de docs/protocolo-agentes.md y PARÁ.
<lo específico del slice: archivos, cifras del golden, permisos a probar>
~~~

## Formato del reporte

```text
Slice <N> — <nombre> | commits: <hash> <hash>

<contenido de .gate/report.txt, pegado tal cual>

No verificado: <pantalla / base cloud / lo que no se pudo correr, y por qué>
Decisiones fuera del spec: <ninguna / cuáles y por qué>
```

Máximo 10 líneas en el chat; el detalle va a archivos. Un "no verificado"
honesto es un reporte válido; inventar o completar una salida es el único error grave.

## Cuándo PARAR

Solo en puntos de decisión:

- Las cifras de un escenario financiero (lo que dice el golden o lo que muestra un reporte).
- Un cambio de alcance respecto del spec.
- Seguridad crítica: aislamiento entre tenants, RLS, una función DEFINER.

El resto se encadena y se reporta al final del slice.

## Cuándo preguntar

Parar y preguntar, sin resolverlo por cuenta propia, cuando el comportamiento
existente contradice el spec o la lógica de finanzas. Nunca cambiar por iniciativa propia:

- un `sp_*` compartido con otros módulos;
- archivos de configuración (tsconfig, next, eslint, playwright, vitest);
- una migración ya mergeada a main (se corrige con una migración nueva);
- `specs/golden.md`.

## Qué verifica cada nivel de gate

| Comando | Pasos | Cuándo |
| --- | --- | --- |
| `pnpm gate` | typecheck, lint (errores y avisos), unitarios | mientras se trabaja |
| `pnpm gate:db` | + `supabase db reset`, `tests/db` completa, DOWN de las migraciones nuevas | si el cambio toca SQL |
| `pnpm gate:full` | + `pnpm build` (cuenta rutas) | al cerrar un slice |

Se detiene en el primer fallo. Exit 0 = todo verificado, 1 = falló un paso,
2 = no verificado (sin Docker, Supabase apagado, sin `.env.local` o con los
tests de base salteados). El reporte queda en `.gate/report.txt` y
`.gate/report.json`; el log de cada paso, en `.gate/<paso>.log`.

El hook de pre-commit (`pnpm hooks:install`) corre typecheck y lint de los
archivos staged. Saltearlo con `--no-verify` solo con una justificación escrita
en el cuerpo del commit o en el reporte.

## Ramas y worktrees

Una rama por tarea, desde main. Un worktree por agente:

```bash
git worktree add ../utopia-<tarea> -b <tipo>/<tarea> main
```

Nunca dos agentes en el mismo árbol de trabajo: uno pisa los archivos del otro
y el gate de uno mide el código a medio escribir del otro.

## Tests de seguridad

Para los tests de aislamiento entre tenants y de funciones DEFINER, un chequeo
de regresión manual, una sola vez, al escribirlos: quitar la guarda (la
policy, el filtro por `auth_revendedora_id()`, la columna excluida) y
confirmar que el test falla. Un test de seguridad que nunca se vio fallar no
prueba nada. No hace falta para el resto de los tests.

## Convención del bloque DOWN

`pnpm gate:db` ejecuta el `-- DOWN:` de cada migración nueva de la rama, en
orden inverso, dentro de una transacción que siempre termina en ROLLBACK. El
bloque son las líneas de comentario que siguen a `-- DOWN:`; a cada una se le
quita el prefijo `-- ` y se ejecuta como SQL.

- Las notas en prosa van con prefijo `-- NOTE:` y se ignoran.
- Un DOWN sin SQL ejecutable (solo comentarios, o "ver definición en 00093")
  cuenta como fallo: hay que pegar la definición anterior completa.
- `ALTER TYPE ... ADD VALUE` no se puede revertir: se declara con una nota
  (`-- NOTE: el ADD VALUE no es reversible`) y se reporta como no reversible, no como error.
- Prohibido `COMMIT`, `ROLLBACK` y metacomandos de psql dentro del DOWN.

## Pendiente: CI

Hoy existe `.github/workflows/ci.yml`. El CI basado en `pnpm gate:full` lo
agrega el usuario. Cuando exista, el CI pasa a ser el árbitro: se podrán subir
ramas de feature y su resultado reemplaza al reporte local.
