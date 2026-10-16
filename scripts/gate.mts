/**
 * Local verification gate. Three levels, each a superset of the previous one:
 *
 *   pnpm gate        typecheck + lint + unit tests
 *   pnpm gate:db     + supabase db reset + tests/db + DOWN check of new migrations
 *   pnpm gate:full   + next build
 *
 * Why a script and not a chain of `&&` in package.json: agents used to report
 * counts from memory ("all green, ~750 tests"). Here the counts are parsed
 * from each tool's own JSON output and written to `.gate/report.txt`, which is
 * the only evidence an agent is allowed to paste.
 *
 * Exit codes: 0 everything verified, 1 a step failed, 2 something could not
 * be verified (no Docker, Supabase stopped, no .env.local, DB suites skipped).
 * "Not verified" is never folded into "OK".
 *
 * Runs on Windows (cmd/PowerShell/Git Bash) and POSIX: every command goes
 * through the platform shell and nothing here is bash-only.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

type Nivel = 'gate' | 'gate:db' | 'gate:full'
type Estado = 'OK' | 'FAIL' | 'NOT VERIFIED' | 'NOT RUN'

interface Paso {
  nombre: string
  estado: Estado
  detalle: string
  /** Per-item detail (one line each) that goes to report.json, not to the console. */
  items?: string[]
}

/** The subset of Vitest's `--reporter=json` output this script reads. */
interface VitestJson {
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  numPendingTests: number
  numTodoTests: number
  testResults: { name: string; status: string }[]
}

const DIR = '.gate'

function correr(comando: string, log: string): { code: number; salida: string } {
  const r = spawnSync(comando, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  writeFileSync(`${DIR}/${log}.log`, `$ ${comando}\n\n${salida}`)
  return { code: r.status ?? 1, salida }
}

function leerJson<T>(ruta: string): T | null {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8')) as T
  } catch {
    return null
  }
}

function git(args: string): string {
  const r = spawnSync(`git ${args}`, { shell: true, encoding: 'utf8' })
  return (r.stdout ?? '').trim()
}

function parsearNivel(arg: string | undefined): Nivel {
  if (arg === undefined) return 'gate'
  if (arg === 'db') return 'gate:db'
  if (arg === 'full') return 'gate:full'
  console.error(`Nivel desconocido: "${arg}". Usá: pnpm gate | pnpm gate:db | pnpm gate:full`)
  process.exit(1)
}

// ─── Steps ───────────────────────────────────────────────────────────

function pasoTypecheck(): Paso {
  const { code, salida } = correr('pnpm typecheck', 'typecheck')
  if (code === 0) return { nombre: 'typecheck', estado: 'OK', detalle: '' }
  const errores = salida.match(/error TS\d+/g)?.length ?? 0
  return { nombre: 'typecheck', estado: 'FAIL', detalle: `${errores} errors, ver ${DIR}/typecheck.log` }
}

function pasoLint(): Paso {
  const salidaJson = `${DIR}/lint.json`
  const { code } = correr(`pnpm exec eslint --format json --output-file ${salidaJson}`, 'lint')
  const archivos = leerJson<{ errorCount: number; warningCount: number }[]>(salidaJson)
  if (!archivos) {
    return { nombre: 'lint', estado: 'FAIL', detalle: `eslint no generó reporte, ver ${DIR}/lint.log` }
  }
  const errores = archivos.reduce((n, a) => n + a.errorCount, 0)
  const avisos = archivos.reduce((n, a) => n + a.warningCount, 0)
  const detalle = `${errores} errors, ${avisos} warnings`
  return { nombre: 'lint', estado: code === 0 && errores === 0 ? 'OK' : 'FAIL', detalle }
}

/**
 * `exigirEjecucion`: the DB suites skip themselves when the `_TEST` env vars
 * are missing (tests/db/_helpers.ts), and a run where everything skipped
 * exits 0. That is "not verified", never "OK".
 */
function pasoVitest(nombre: string, filtro: string, exigirEjecucion: boolean): Paso {
  const salidaJson = `${DIR}/${nombre}.json`
  const { code } = correr(`npx vitest run ${filtro} --reporter=json --outputFile=${salidaJson}`, nombre)
  const r = leerJson<VitestJson>(salidaJson)
  if (!r) {
    return { nombre, estado: 'FAIL', detalle: `vitest no generó reporte, ver ${DIR}/${nombre}.log` }
  }
  const saltados = r.numPendingTests + r.numTodoTests
  const conteo =
    `${r.testResults.length} files / ${r.numTotalTests} tests` + (saltados ? `, ${saltados} skipped` : '')
  const archivosFallidos = r.testResults.filter((t) => t.status === 'failed').length
  if (code !== 0 || r.numFailedTests > 0 || archivosFallidos > 0) {
    return {
      nombre,
      estado: 'FAIL',
      detalle: `${r.numFailedTests} tests y ${archivosFallidos} files fallidos; ${conteo}`,
      items: r.testResults.filter((t) => t.status === 'failed').map((t) => t.name),
    }
  }
  if (exigirEjecucion && r.numPassedTests === 0) {
    return {
      nombre,
      estado: 'NOT VERIFIED',
      detalle: `todos los tests se saltearon (¿faltan las variables _TEST en .env.local?); ${conteo}`,
    }
  }
  return { nombre, estado: 'OK', detalle: conteo }
}

/** Why the DB levels cannot run here, or null when they can. */
function motivoSinBase(): string | null {
  if (!existsSync('.env.local')) return 'falta .env.local'
  if (correr('docker info', 'docker').code !== 0) return 'Docker no responde'
  if (correr('supabase status', 'supabase-status').code !== 0) {
    return 'Supabase local apagado: corré `supabase start`'
  }
  return null
}

function pasoDb(): Paso {
  if (correr('supabase db reset', 'db-reset').code !== 0) {
    return { nombre: 'db', estado: 'FAIL', detalle: `supabase db reset falló, ver ${DIR}/db-reset.log` }
  }
  return pasoVitest('db', 'tests/db', true)
}

function pasoBuild(): Paso {
  const { code, salida } = correr('pnpm build', 'build')
  if (code !== 0) return { nombre: 'build', estado: 'FAIL', detalle: `ver ${DIR}/build.log` }
  // Rows of Next's route table: "├ ○ /ventas", "└ ƒ /api/...".
  const rutas = salida.split(/\r?\n/).filter((l) => /^[┌├└]\s+\S+\s+\//.test(l)).length
  return { nombre: 'build', estado: 'OK', detalle: rutas ? `${rutas} routes` : 'rutas sin contar' }
}

// ─── Main ────────────────────────────────────────────────────────────

const nivel = parsearNivel(process.argv[2])
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR)

const commit = git('rev-parse --short HEAD')
const rama = git('branch --show-current')
const sucio = git('status --porcelain') !== ''
const fecha = new Date().toLocaleString('sv-SE')

const pasos: Paso[] = []
const huboFallo = () => pasos.some((p) => p.estado === 'FAIL')

/** Stops at the first failure: everything after it is reported as NOT RUN. */
function ejecutar(nombre: string, paso: () => Paso): void {
  if (huboFallo()) {
    pasos.push({ nombre, estado: 'NOT RUN', detalle: 'falló un paso anterior' })
    return
  }
  pasos.push(paso())
}

ejecutar('typecheck', pasoTypecheck)
ejecutar('lint', pasoLint)
ejecutar('unit', () => pasoVitest('unit', '--exclude "tests/db/**"', false))

if (nivel !== 'gate') {
  const sinBase = huboFallo() ? null : motivoSinBase()
  if (sinBase) {
    pasos.push({ nombre: 'db', estado: 'NOT VERIFIED', detalle: sinBase })
  } else {
    ejecutar('db', pasoDb)
  }
}

if (nivel === 'gate:full') ejecutar('build', pasoBuild)

const exitCode = huboFallo() ? 1 : pasos.some((p) => p.estado === 'NOT VERIFIED') ? 2 : 0
const resultado = (['OK', 'FAIL', 'NOT VERIFIED'] as const)[exitCode]

const lineas = [
  `${nivel}: ${resultado} (exit ${exitCode})`,
  ...pasos.map((p) => `${p.nombre}: ${p.estado}${p.detalle ? ` (${p.detalle})` : ''}`),
  `fecha: ${fecha} | commit: ${commit} (${rama})${sucio ? ' + cambios sin commitear' : ''}`,
]

writeFileSync(`${DIR}/report.txt`, `${lineas.join('\n')}\n`)
writeFileSync(
  `${DIR}/report.json`,
  `${JSON.stringify({ nivel, resultado, exitCode, fecha, commit, rama, sucio, pasos }, null, 2)}\n`,
)

console.log(lineas.join('\n'))
console.log(`Reporte: ${DIR}/report.txt (logs de cada paso en ${DIR}/)`)
process.exit(exitCode)
