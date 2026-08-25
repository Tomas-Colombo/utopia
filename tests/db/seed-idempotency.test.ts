import { describe, expect, it } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { hasTestDb } from './_helpers'

const SEEDED_MODULO_CODES = [
  'inventario',
  'ventas',
  'precios',
  'consignaciones',
  'rendiciones',
  'gastos',
  'reportes',
  'administracion',
]

describe.skipIf(!hasTestDb)('seed idempotency — modulo catalog (REQ-MTD-12, spec 3.5)', () => {
  it('running the seed insert twice does not change the row count', async () => {
    const serviceRole = createServiceRoleTestClient()

    const insertModuloCatalog = () =>
      serviceRole
        .from('modulo')
        .upsert(
          SEEDED_MODULO_CODES.map((codigo) => ({ codigo, nombre: codigo })),
          { onConflict: 'codigo', ignoreDuplicates: true },
        )

    await insertModuloCatalog()
    const { count: firstCount } = await serviceRole
      .from('modulo')
      .select('id_modulo', { count: 'exact', head: true })
      .in('codigo', SEEDED_MODULO_CODES)

    await insertModuloCatalog()
    const { count: secondCount } = await serviceRole
      .from('modulo')
      .select('id_modulo', { count: 'exact', head: true })
      .in('codigo', SEEDED_MODULO_CODES)

    expect(secondCount).toBe(firstCount)
    expect(firstCount).toBe(SEEDED_MODULO_CODES.length)
  })
})
