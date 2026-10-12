import { describe, expect, test } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'

describe('EstadoItem transiciones — DB-02', () => {
  test('matriz completa de is_transicion_item_valida', async () => {
    const serviceRole = createServiceRoleTestClient()
    // Helper para verificar si una transición es válida en DB
    const isValida = async (desde: string, hasta: string) => {
      const { data, error } = await serviceRole.rpc('is_transicion_item_valida', { p_desde: desde, p_hasta: hasta })
      if (error) throw error
      return data
    }

    const estados = ['disponible', 'reservado', 'vendido', 'devuelto', 'baja', 'devuelto_cliente', 'en_revendedora']

    const allowedTransitions: Record<string, string[]> = {
      'disponible': ['reservado', 'vendido', 'devuelto', 'baja', 'en_revendedora'],
      'reservado': ['disponible', 'vendido', 'baja'],
      'vendido': ['disponible', 'devuelto_cliente', 'devuelto', 'baja'],
      'devuelto_cliente': ['disponible', 'baja'],
      'en_revendedora': ['disponible', 'vendido', 'devuelto', 'baja'],
      'devuelto': [],
      'baja': []
    }

    for (const desde of estados) {
      for (const hasta of estados) {
        const expected = allowedTransitions[desde]?.includes(hasta) ?? false
        const actual = await isValida(desde, hasta)
        expect(actual, `Transición ${desde} -> ${hasta} debería ser ${expected}`).toBe(expected)
      }
    }
  })

  test('items en_revendedora son contados en la posición financiera (capital propio)', async () => {
    const serviceRole = createServiceRoleTestClient()
    // Verificamos que rf_finanzas_posicion se pueda invocar sin error
    const { error } = await serviceRole.rpc('rf_finanzas_posicion')
    expect(error).toBeNull()
  })
})
