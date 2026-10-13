import { describe, it, expect } from 'vitest'
import {
  CASOS_RESOLUCION_FIXTURE,
  REGLAS_FIXTURE,
} from './__fixtures__/escalas'
import {
  resolverComision,
  estimarComision,
  type ReglaComisionConEscalas,
} from './resolver-comision'

describe('Motor de comisiones (TS preview / resolución pura)', () => {
  // Convertir las reglas del fixture a la estructura de dominio tipada
  const reglas: ReglaComisionConEscalas[] = REGLAS_FIXTURE.map((r, idx) => ({
    id_regla: `regla-uuid-${idx}`,
    id_tenant: 'tenant-test-1',
    ambito: r.ambito,
    nombre: r.nombre,
    id_revendedora: r.revendedora_key ? `rev-${r.revendedora_key}` : null,
    vigente_desde: r.vigente_desde,
    vigente_hasta: r.vigente_hasta,
    activo: r.activo,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    escalas: r.escalas.map((e, eIdx) => ({
      id_escala: `escala-uuid-${idx}-${eIdx}`,
      id_tenant: 'tenant-test-1',
      id_regla: `regla-uuid-${idx}`,
      objetivo_desde: e.objetivo_desde,
      porcentaje: e.porcentaje,
      created_at: '2026-01-01T00:00:00Z',
    })),
  }))

  describe('Casos de prueba sobre matriz de fixtures', () => {
    for (const caso of CASOS_RESOLUCION_FIXTURE) {
      it(`${caso.id}: ${caso.descripcion}`, () => {
        const idRevendedora = caso.revendedora_key
          ? `rev-${caso.revendedora_key}`
          : null

        const res = resolverComision(reglas, {
          idRevendedora,
          ambito: caso.ambito ?? 'revendedora',
          fecha: caso.fecha,
          montoPeriodo: caso.monto,
        })

        expect(res.porcentaje).toBe(caso.esperado.porcentaje)
        expect(res.origen).toBe(caso.esperado.origen)
        expect(res.sin_regla).toBe(caso.esperado.sin_regla)
      })
    }
  })

  describe('estimarComision (preview en UI)', () => {
    it('calcula estimación sobre monto válido redondeado a 2 decimales', () => {
      const res = estimarComision(10500, 15)
      expect(res).toEqual({
        porcentaje: 15,
        montoEstimado: 1575,
      })
    })

    it('devuelve 0 si porcentaje o precio son menores o iguales a cero', () => {
      expect(estimarComision(0, 15)).toEqual({ porcentaje: 15, montoEstimado: 0 })
      expect(estimarComision(10000, 0)).toEqual({ porcentaje: 0, montoEstimado: 0 })
      expect(estimarComision(-500, 10)).toEqual({ porcentaje: 10, montoEstimado: 0 })
    })
  })
})
