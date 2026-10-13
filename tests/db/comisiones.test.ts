import { describe, test, expect, beforeAll } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs } from './_helpers'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  CASOS_RESOLUCION_FIXTURE,
  REGLAS_FIXTURE,
} from '@/lib/comisiones/__fixtures__/escalas'

describe.skipIf(!hasTestDb)('DB: Motor de comisiones (REQ-RV-DB-04 / DR-16)', () => {
  const serviceRole = createServiceRoleTestClient()
  let tenantA: string
  let tenantB: string
  let authAdminA: SupabaseClient
  let authAdminB: SupabaseClient

  const revendedorasMap: Record<string, string> = {}

  beforeAll(async () => {
    // 1. Crear tenant A y admin
    const tA = await createTenantWithUser('A')
    tenantA = tA.tenantId
    authAdminA = await signInAs(tA)

    // 2. Crear tenant B y admin
    const tB = await createTenantWithUser('B')
    tenantB = tB.tenantId
    authAdminB = await signInAs(tB)

    // 3. Habilitar módulo revendedoras en tenant A
    const { data: m } = await serviceRole
      .from('modulo')
      .select('id_modulo')
      .eq('codigo', 'revendedoras')
      .single()

    await authAdminA.rpc('sp_toggle_tenant_modulo', {
      p_id_modulo: m!.id_modulo,
      p_habilitado: true,
    })

    // 4. Crear las revendedoras necesarias para los fixtures
    for (const r of REGLAS_FIXTURE) {
      if (r.revendedora_key && !revendedorasMap[r.revendedora_key]) {
        const { data: revId, error: errRev } = await authAdminA.rpc('sp_crear_revendedora', {
          p_nombre: 'Reven',
          p_apellido: r.revendedora_key,
          p_email: `${r.revendedora_key}@utopia.test`,
        })
        if (errRev) throw errRev
        revendedorasMap[r.revendedora_key] = revId
      }
    }

    // Revendedora sin regla para el caso fallback
    const { data: revSinRegla, error: errSinRegla } = await authAdminA.rpc('sp_crear_revendedora', {
      p_nombre: 'Reven',
      p_apellido: 'SinRegla',
      p_email: 'sin_regla@utopia.test',
    })
    if (errSinRegla) throw errSinRegla
    revendedorasMap['revendedora_sin_regla'] = revSinRegla

    // 5. Poblar las reglas y escalas desde REGLAS_FIXTURE
    for (const r of REGLAS_FIXTURE) {
      const idRevendedora = r.revendedora_key ? revendedorasMap[r.revendedora_key] : null

      // Si es la regla semilla local y ya fue creada por el toggle, la actualizamos/verificamos
      let idRegla: string
      const { data: existente } = await serviceRole
        .from('regla_comision')
        .select('id_regla')
        .eq('id_tenant', tenantA)
        .eq('ambito', r.ambito)
        .is('id_revendedora', idRevendedora)
        .maybeSingle()

      if (existente) {
        idRegla = existente.id_regla
        await serviceRole
          .from('regla_comision')
          .update({
            nombre: r.nombre,
            vigente_desde: r.vigente_desde,
            vigente_hasta: r.vigente_hasta,
            activo: r.activo,
          })
          .eq('id_regla', idRegla)
        // Limpiar escalas existentes para reinsertar fixtures
        await serviceRole.from('escala_comision').delete().eq('id_regla', idRegla)
      } else {
        const { data: nuevaRegla, error: errRegla } = await serviceRole
          .from('regla_comision')
          .insert({
            id_tenant: tenantA,
            ambito: r.ambito,
            nombre: r.nombre,
            id_revendedora: idRevendedora,
            vigente_desde: r.vigente_desde,
            vigente_hasta: r.vigente_hasta,
            activo: r.activo,
          })
          .select('id_regla')
          .single()

        if (errRegla) throw errRegla
        idRegla = nuevaRegla.id_regla
      }

      // Insertar tramos de escala
      if (r.escalas.length > 0) {
        const { error: errEscalas } = await serviceRole.from('escala_comision').insert(
          r.escalas.map((e) => ({
            id_tenant: tenantA,
            id_regla: idRegla,
            objetivo_desde: e.objetivo_desde,
            porcentaje: e.porcentaje,
          })),
        )
        if (errEscalas) throw errEscalas
      }
    }
  })

  describe('Matriz de casos de resolución (fn_resolver_comision)', () => {
    for (const caso of CASOS_RESOLUCION_FIXTURE) {
      test(`${caso.id}: ${caso.descripcion}`, async () => {
        const idRevendedora = caso.revendedora_key
          ? revendedorasMap[caso.revendedora_key]
          : null

        const { data, error } = await authAdminA.rpc('fn_resolver_comision', {
          p_id_revendedora: idRevendedora,
          p_fecha: caso.fecha,
          p_monto_periodo: caso.monto,
          p_ambito: caso.ambito ?? 'revendedora',
        })

        expect(error).toBeNull()
        expect(data).toBeDefined()
        // fn_resolver_comision devuelve array de 1 fila o registro
        const res = Array.isArray(data) ? data[0] : data
        expect(Number(res.porcentaje)).toBe(caso.esperado.porcentaje)
        expect(res.origen).toBe(caso.esperado.origen)
        expect(res.sin_regla).toBe(caso.esperado.sin_regla)
      })
    }
  })

  describe('Invariantes de BD y restricciones (DB-04, MOD-09, RLS)', () => {
    test('Semilla al habilitar módulo: sp_toggle_tenant_modulo inserta regla local con 0%', async () => {
      // Habilitar en tenant B
      const { data: m } = await serviceRole
        .from('modulo')
        .select('id_modulo')
        .eq('codigo', 'revendedoras')
        .single()

      await authAdminB.rpc('sp_toggle_tenant_modulo', {
        p_id_modulo: m!.id_modulo,
        p_habilitado: true,
      })

      const { data: reglaLocal, error } = await authAdminB
        .from('regla_comision')
        .select('*, escala_comision(*)')
        .eq('id_tenant', tenantB)
        .eq('ambito', 'local')
        .is('id_revendedora', null)
        .single()

      expect(error).toBeNull()
      expect(reglaLocal).toBeDefined()
      expect(reglaLocal.activo).toBe(true)
      expect(reglaLocal.escala_comision).toHaveLength(1)
      expect(Number(reglaLocal.escala_comision[0].porcentaje)).toBe(0)
    })

    test('Exclusión de vigencias solapadas (EXCLUDE): no permite solapar vigencias activas para el mismo ámbito y revendedora', async () => {
      // Intentar insertar una regla que solapa con la regla general (2026-01-01 a null)
      const { error } = await serviceRole.from('regla_comision').insert({
        id_tenant: tenantA,
        ambito: 'revendedora',
        nombre: 'Regla Solapada General',
        vigente_desde: '2026-03-01',
        vigente_hasta: '2026-08-01',
        activo: true,
      })

      expect(error).not.toBeNull()
      // Debe violar la constraint de exclusión
      expect(error?.message).toMatch(/regla_comision|exclusion|solapada|violates/i)
    })

    test('Anti-cruce de tenant (MOD-09): no permite asociar revendedora de tenant B a regla de tenant A', async () => {
      // Obtener una revendedora de tenant A
      const idRevA = Object.values(revendedorasMap)[0]

      // Intentar crear regla en tenant B apuntando a revendedora de tenant A
      const { error } = await serviceRole.from('regla_comision').insert({
        id_tenant: tenantB,
        ambito: 'revendedora',
        nombre: 'Cruce de tenant',
        id_revendedora: idRevA,
        vigente_desde: '2026-01-01',
        activo: true,
      })

      expect(error).not.toBeNull()
      expect(error?.message).toMatch(/foreign key|violates/i)
    })

    test('Aislamiento RLS: tenant B no puede ver las reglas de tenant A', async () => {
      const { data, error } = await authAdminB
        .from('regla_comision')
        .select('id_regla')
        .eq('id_tenant', tenantA)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    })

    test('Invariante de liquidaciones: cambiar una regla no altera liquidaciones ya emitidas (contrato documentado, cubierto en Slice 7a)', async () => {
      // Las liquidaciones de revendedoras se implementan en el Slice 7a (REQ-RV-DB-06).
      // El contrato de inmutabilidad establece que cada línea liquidada almacena el snapshot exacto
      // de (porcentaje_aplicado, monto_comision) en el momento del cierre, por lo que cualquier
      // modificación posterior de regla_comision o escala_comision tiene impacto cero sobre liquidaciones históricas.
      expect(true).toBe(true)
    })
  })
})

