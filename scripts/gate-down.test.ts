import { describe, expect, it } from 'vitest'
import {
  agregaValorEnum,
  declaraNoReversible,
  extraerDown,
  sentenciaProhibida,
  tieneSqlEjecutable,
} from './gate-down.mts'

const migracion = [
  '-- 00200_ejemplo.sql',
  '-- UP: crea la tabla x.',
  '--',
  '-- DOWN:',
  '-- NOTE: borra la tabla y la función nueva.',
  '-- drop function if exists fn_x();',
  '-- drop table if exists x;',
  '',
  'create table x (id int);',
  '-- drop table y;',
].join('\n')

describe('extraerDown', () => {
  it('toma las líneas de comentario tras -- DOWN: sin el prefijo y separa las NOTE', () => {
    const bloque = extraerDown(migracion)
    expect(bloque?.sql).toEqual(['drop function if exists fn_x();', 'drop table if exists x;'])
    expect(bloque?.origen).toEqual([6, 7])
    expect(bloque?.notas).toEqual(['NOTE: borra la tabla y la función nueva.'])
  })

  it('corta el bloque en la primera línea que no es comentario', () => {
    expect(extraerDown(migracion)?.sql).not.toContain('drop table y;')
  })

  it('acepta el SQL en la misma línea del encabezado', () => {
    expect(extraerDown('-- DOWN: drop table tenant;\ncreate table tenant();')?.sql).toEqual([
      'drop table tenant;',
    ])
  })

  it('corta en un -- UP: posterior', () => {
    expect(extraerDown('-- DOWN:\n-- drop table a;\n-- UP:\n-- create table a();')?.sql).toEqual([
      'drop table a;',
    ])
  })

  it('devuelve null sin encabezado DOWN', () => {
    expect(extraerDown('create table a();')).toBeNull()
  })

  it('maneja finales de línea CRLF', () => {
    expect(extraerDown('-- DOWN:\r\n-- drop table a;\r\n\r\nselect 1;')?.sql).toEqual(['drop table a;'])
  })
})

describe('tieneSqlEjecutable', () => {
  it('es falso cuando el DOWN solo tiene comentarios anidados (-- -- ...)', () => {
    const bloque = extraerDown('-- DOWN:\n-- -- Ver definición previa en 00093.\n--\nselect 1;')
    expect(bloque && tieneSqlEjecutable(bloque)).toBe(false)
  })

  it('es verdadero con al menos una sentencia', () => {
    const bloque = extraerDown(migracion)
    expect(bloque && tieneSqlEjecutable(bloque)).toBe(true)
  })
})

describe('sentenciaProhibida', () => {
  it.each(['commit;', 'rollback;', 'end transaction;', '\\! rm -rf /'])('rechaza %s', (linea) => {
    const bloque = extraerDown(`-- DOWN:\n-- drop table a;\n-- ${linea}\nselect 1;`)
    expect(bloque && sentenciaProhibida(bloque)).toBe(linea)
  })

  it('no confunde el end; de un cuerpo plpgsql', () => {
    const bloque = extraerDown('-- DOWN:\n-- create function f() returns void as $$ begin\n-- end;\n-- $$ language plpgsql;\nselect 1;')
    expect(bloque && sentenciaProhibida(bloque)).toBeNull()
  })
})

describe('ALTER TYPE ... ADD VALUE', () => {
  it('detecta el ADD VALUE fuera de comentarios', () => {
    expect(agregaValorEnum("alter type forma_pago add value if not exists 'x';")).toBe(true)
    expect(agregaValorEnum("-- alter type forma_pago add value 'x';")).toBe(false)
  })

  it('reconoce el DOWN que lo declara no reversible', () => {
    const bloque = extraerDown('-- DOWN:\n-- NOTE: el ADD VALUE no es reversible en Postgres.\nselect 1;')
    expect(bloque && declaraNoReversible(bloque)).toBe(true)
  })
})
