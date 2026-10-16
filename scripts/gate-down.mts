/**
 * DOWN check for `pnpm gate:db`: runs the `-- DOWN:` block of every migration
 * that is new on this branch against the freshly reset local database, inside
 * a transaction that always ends in ROLLBACK.
 *
 * Why: the DOWN blocks were written and never executed. A rollback is needed
 * exactly when things are already on fire, which is the worst moment to find
 * out it references a function that no longer exists.
 *
 * Convention (docs/protocolo-agentes.md): the DOWN block is the run of comment
 * lines after `-- DOWN:`; each line loses its `-- ` prefix and becomes SQL.
 * Prose goes in lines prefixed `-- NOTE:`, which are skipped.
 *
 * Connection: the same local psql defaults as tests/db/_helpers.ts
 * (SUPABASE_DB_HOST/PORT/USER/NAME, PGPASSWORD); if psql is not on PATH it
 * falls back to `docker exec` into the Supabase db container.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

export type EstadoDown = 'OK' | 'ERROR' | 'SIN BLOQUE DOWN' | 'SIN SQL EJECUTABLE' | 'NO REVERSIBLE' | 'MODIFICADA' | 'NOT RUN'

export interface ResultadoDown {
  archivo: string
  estado: EstadoDown
  detalle: string
}

export interface BloqueDown {
  /** Executable SQL lines, prefix stripped, NOTE lines removed. */
  sql: string[]
  /** Line in the original file each `sql` entry came from (1-based). */
  origen: number[]
  /** The NOTE lines, kept to detect documented irreversibility. */
  notas: string[]
}

const CONTENEDOR_DB = 'supabase_db_utopia'

/** Returns null when the file has no `-- DOWN:` header line. */
export function extraerDown(contenido: string): BloqueDown | null {
  const lineas = contenido.split(/\r?\n/)
  const inicio = lineas.findIndex((l) => /^\s*--\s*DOWN\s*:/i.test(l))
  if (inicio < 0) return null

  const bloque: BloqueDown = { sql: [], origen: [], notas: [] }
  const agregar = (texto: string, numero: number) => {
    if (/^\s*NOTE:/i.test(texto)) {
      bloque.notas.push(texto.trim())
    } else {
      bloque.sql.push(texto)
      bloque.origen.push(numero)
    }
  }

  // `-- DOWN: drop table x;` on the header line itself.
  const resto = lineas[inicio].replace(/^\s*--\s*DOWN\s*:\s*/i, '')
  if (resto.trim()) agregar(resto, inicio + 1)

  for (let i = inicio + 1; i < lineas.length; i++) {
    const linea = lineas[i]
    if (!/^\s*--/.test(linea) || /^\s*--\s*UP\s*:/i.test(linea)) break
    agregar(linea.replace(/^\s*--\s?/, ''), i + 1)
  }
  return bloque
}

/** True when the block has at least one line that is not blank or a comment. */
export function tieneSqlEjecutable(bloque: BloqueDown): boolean {
  return bloque.sql.some((l) => l.trim() !== '' && !l.trim().startsWith('--'))
}

/**
 * Anything that could end the wrapping transaction or escape psql. The check
 * must never COMMIT, so a DOWN containing these is refused, not executed.
 */
export function sentenciaProhibida(bloque: BloqueDown): string | null {
  const prohibida = bloque.sql.find(
    (l) => /^\s*(commit|rollback|abort)\b/i.test(l) || /^\s*end\s+(transaction|work)\b/i.test(l) || /^\s*\\/.test(l),
  )
  return prohibida?.trim() ?? null
}

/** `ALTER TYPE ... ADD VALUE` in the UP part (outside comments). */
export function agregaValorEnum(contenido: string): boolean {
  const codigo = contenido
    .split(/\r?\n/)
    .filter((l) => !/^\s*--/.test(l))
    .join('\n')
  return /alter\s+type\s+\S+\s+add\s+value/i.test(codigo)
}

export function declaraNoReversible(bloque: BloqueDown): boolean {
  return [...bloque.notas, ...bloque.sql].some((l) => /no reversible|irreversible|add value/i.test(l))
}

// ─── git ─────────────────────────────────────────────────────────────

function git(args: string[]): { code: number; salida: string } {
  const r = spawnSync('git', args, { encoding: 'utf8' })
  return { code: r.status ?? 1, salida: (r.stdout ?? '').trim() }
}

/** Migrations touched on this branch vs `base`, committed or not, sorted. */
export function migracionesDeLaRama(base: string): string[] {
  const listas = [
    git(['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`, '--', 'supabase/migrations']),
    git(['diff', '--name-only', '--diff-filter=d', 'HEAD', '--', 'supabase/migrations']),
    git(['ls-files', '--others', '--exclude-standard', '--', 'supabase/migrations']),
  ]
  const archivos = new Set(
    listas.flatMap((l) => l.salida.split('\n')).filter((f) => f.endsWith('.sql')),
  )
  return [...archivos].sort()
}

function estaEnBase(base: string, archivo: string): boolean {
  return git(['cat-file', '-e', `${base}:${archivo}`]).code === 0
}

// ─── psql ────────────────────────────────────────────────────────────

function psql(entrada: string): { code: number; error: string } {
  const env = { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'postgres' }
  const comunes = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--echo-errors']
  const local = spawnSync(
    'psql',
    [
      '-h', process.env.SUPABASE_DB_HOST || '127.0.0.1',
      '-p', process.env.SUPABASE_DB_PORT || '54322',
      '-U', process.env.SUPABASE_DB_USER || 'postgres',
      '-d', process.env.SUPABASE_DB_NAME || 'postgres',
      ...comunes,
    ],
    { input: entrada, encoding: 'utf8', env },
  )
  const r = local.error
    ? spawnSync('docker', ['exec', '-i', CONTENEDOR_DB, 'psql', '-U', 'postgres', '-d', 'postgres', ...comunes], {
        input: entrada,
        encoding: 'utf8',
      })
    : local
  return { code: r.status ?? 1, error: `${r.error?.message ?? ''}${r.stderr ?? ''}`.trim() }
}

/** First `ERROR:` line, plus the original file line when psql names one. */
function resumirError(stderr: string, mapa: Map<number, string>): string {
  const lineaError = stderr.split(/\r?\n/).find((l) => l.includes('ERROR:')) ?? stderr.split(/\r?\n/)[0] ?? ''
  const numero = Number(/<stdin>:(\d+):/.exec(lineaError)?.[1])
  const ubicacion = mapa.get(numero)
  const mensaje = lineaError.replace(/^psql:<stdin>:\d+:\s*/, '').trim()
  return ubicacion ? `${mensaje} — en ${ubicacion}` : mensaje
}

// ─── check ───────────────────────────────────────────────────────────

/**
 * DOWNs are applied newest-first and cumulatively: the DOWN of migration N is
 * tried after the DOWNs of every newer migration of the branch, because that
 * is the order a real rollback runs in. All in one transaction, always rolled
 * back. The first failure stops the chain (older ones would fail on it too).
 */
export function verificarDowns(base: string, rutaLog: string): ResultadoDown[] {
  const resultados: ResultadoDown[] = []
  const ejecutables: { archivo: string; bloque: BloqueDown }[] = []

  for (const archivo of migracionesDeLaRama(base)) {
    const contenido = readFileSync(archivo, 'utf8')
    if (estaEnBase(base, archivo)) {
      const original = git(['show', `${base}:${archivo}`]).salida
      if (original.replace(/\r\n/g, '\n').trim() !== contenido.replace(/\r\n/g, '\n').trim()) {
        resultados.push({ archivo, estado: 'MODIFICADA', detalle: `ya está en ${base}: corregí con una migración nueva` })
      }
      continue
    }
    const bloque = extraerDown(contenido)
    const enumNoReversible = agregaValorEnum(contenido)
    if (!bloque) {
      resultados.push({ archivo, estado: 'SIN BLOQUE DOWN', detalle: 'falta el encabezado -- DOWN:' })
    } else if (!tieneSqlEjecutable(bloque)) {
      if (enumNoReversible && declaraNoReversible(bloque)) {
        resultados.push({ archivo, estado: 'NO REVERSIBLE', detalle: 'ALTER TYPE ... ADD VALUE (documentado)' })
      } else {
        resultados.push({ archivo, estado: 'SIN SQL EJECUTABLE', detalle: 'el DOWN solo tiene comentarios' })
      }
    } else {
      const prohibida = sentenciaProhibida(bloque)
      if (prohibida) {
        resultados.push({ archivo, estado: 'ERROR', detalle: `sentencia no permitida en un DOWN: ${prohibida}` })
      } else {
        ejecutables.push({ archivo, bloque })
      }
    }
  }

  const log: string[] = []
  const aplicados: { archivo: string; bloque: BloqueDown }[] = []
  let cortado: string | null = null

  for (const actual of [...ejecutables].reverse()) {
    if (cortado) {
      resultados.push({ archivo: actual.archivo, estado: 'NOT RUN', detalle: `falló antes el DOWN de ${cortado}` })
      continue
    }
    aplicados.push(actual)
    const entrada = ['begin;', "set local statement_timeout = '120s';"]
    const mapa = new Map<number, string>()
    for (const { archivo, bloque } of aplicados) {
      bloque.sql.forEach((linea, i) => {
        entrada.push(linea)
        mapa.set(entrada.length, `${archivo}:${bloque.origen[i]}`)
      })
    }
    entrada.push('rollback;')

    const r = psql(`${entrada.join('\n')}\n`)
    log.push(`### ${actual.archivo} (exit ${r.code})`, r.error, '')
    if (r.code === 0) {
      const nota = agregaValorEnum(readFileSync(actual.archivo, 'utf8')) ? ' (el ADD VALUE del enum no se revierte)' : ''
      resultados.push({ archivo: actual.archivo, estado: 'OK', detalle: `aplicado y revertido con ROLLBACK${nota}` })
    } else {
      resultados.push({ archivo: actual.archivo, estado: 'ERROR', detalle: resumirError(r.error, mapa) })
      cortado = actual.archivo
    }
  }

  writeFileSync(rutaLog, `${log.join('\n')}\n`)
  return resultados.sort((a, b) => a.archivo.localeCompare(b.archivo))
}
