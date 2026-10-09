# Prompt de slice — modulo-revendedoras

Copiar, completar `<N>` y pegar al agente ejecutor. Un slice por vez.
El revisor (otro agente, distinto del ejecutor) valida cada slice antes del siguiente.

~~~text
Slice <N> — <nombre del slice>. Spec: openspec/changes/modulo-revendedoras/tasks.md,
sección "Slice <N>". Requisitos que cierra: los REQ-RV-* indicados en esa sección.

Antes de escribir código:
1. Leé AGENTS.md y docs/protocolo-agentes.md.
2. Leé openspec/changes/modulo-revendedoras/: proposal.md (decisiones DR-1…DR-17, están
   CERRADAS, no las reabras), design.md, tasks.md y las specs/REQ-RV-*.md que cita el slice.
3. Leé los archivos que vas a tocar. Si vas a modificar un sp_*, una función SQL o un trigger,
   copiá su ÚLTIMA definición: rg -l "function <nombre>" supabase/migrations | sort | tail -1
   Nunca edites una migración ya aplicada. La próxima migración libre es 00075 o la que
   siga según `ls supabase/migrations`; numerá en orden de aplicación.
4. Antes de escribir código Next.js, leé la guía relevante de node_modules/next/dist/docs/.
5. Verificá que se cumple el gate de la Fase 0 de tasks.md (finanzas-panel cerrado y
   aprobación del usuario). Si algo no se cumple, PARÁ y decímelo.
6. Decime en 3-5 líneas qué vas a hacer y qué NO vas a tocar. ESPERÁ mi OK.

Reglas de este slice:
- Test primero (TDD): escribilo, mostrame que falla, después implementá.
- Arquitectura de AGENTS.md sin excepciones: SQL solo en lib/dal; escrituras por sp_*;
  cada Server Action con las 3 puertas (requireModuleRole → safeParse con strictObject →
  DAL con parsed.data) y devuelve { ok } | { ok:false, reason } con reason kebab-case.
- Lecturas rf_* y vistas: SECURITY INVOKER. Única excepción aprobada: funciones rvp_*
  (Slice 9c), con identidad solo del claim y columnas listadas.
- Todo tenant-scoped: id_tenant + RLS. Cada punto de la matriz de bloqueo de
  specs/REQ-RV-MOD.md que toque el slice lleva su test (módulo apagado, sin permiso).
- Toda migración lleva un -- DOWN: completo y lo probás sobre una base recién migrada.
- Todo slug nuevo que levante un sp_* va a lib/errores/mensajes.ts (español, voseo, punto
  final, sin jerga) y al inventario de lib/errores/mensajes.test.ts.
- Textos de UI en español con voseo. Código y comentarios del dominio en español;
  components/ui/** en inglés. Comentarios: el porqué, no el qué.
- No cambies una aserción para que pase sin decirme si el error era del test o del código,
  citando la línea del spec.
- Alcance cerrado: nada fuera de la lista del slice. Si ves algo más (deuda, otro módulo),
  anotalo en el reporte y NO lo hagas.
- Commits: Conventional Commits, asunto y cuerpo en español. NUNCA Co-Authored-By ni
  atribución de IA. Trabajá en la rama feat/modulo-revendedoras-slice-<N>. No hagas push
  ni abras PR sin mi OK. Agregá archivos por nombre, nunca git add -A.

Al terminar: corré el checklist de cierre de docs/protocolo-agentes.md, pegá el reporte
con el formato de ese documento y PARÁ. No empieces el slice <N+1>. Incluí además:
- Lista de archivos creados/modificados (git show --stat HEAD).
- Para cada REQ del slice: cómo lo verificaste (test o comando) o "no verificado".
- Decisiones que te apartan del spec, aunque sean chicas.
- Qué NO pudiste correr (Docker/DB, pantalla, e2e) y por qué. Sin salida pegada, no hay claim.

Después de mi revisión vas a recibir feedback con errores a corregir. Corregilos en el
mismo slice (commits nuevos, sin reescribir historia) y volvé a reportar. Recién con mi
"slice aprobado" se avanza.
~~~
