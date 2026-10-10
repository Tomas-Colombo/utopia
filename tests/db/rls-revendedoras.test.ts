import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createServiceRoleTestClient } from '@/lib/dal/supabase-test'
import { createTenantWithUser, hasTestDb, signInAs } from './_helpers'
import { SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

describe.skipIf(!hasTestDb)('RLS revendedoras — restricción por usuario (ACC-07)', () => {
  const serviceRole = createServiceRoleTestClient()
  let tenantId: string
  let authAdmin: SupabaseClient
  let authRev: SupabaseClient

  let revendedoraUserId: string
  let idRevendedora: string
  let tenantB: string

  beforeAll(async () => {
    // 1. Crear tenant A (y su admin)
    const tA = await createTenantWithUser('A')
    tenantId = tA.tenantId
    authAdmin = await signInAs(tA)

    // Crear tenant B para probar aislamiento cruzado
    const tB = await createTenantWithUser('B')
    tenantB = tB.tenantId

    // 2. Habilitar módulo revendedoras en tenant A
    const { data: m } = await serviceRole.from('modulo').select('id_modulo').eq('codigo', 'revendedoras').single()
    await serviceRole.from('tenant_modulo').insert({ id_tenant: tenantId, id_modulo: m!.id_modulo, habilitado: true })

    // 3. Crear una revendedora de dominio en tenant A
    const { data: revId, error: errRev } = await authAdmin.rpc('sp_crear_revendedora', {
      p_nombre: 'Reven',
      p_apellido: 'Dora',
      p_email: 'revendedora_rls@re.com'
    })
    if (errRev) throw errRev
    idRevendedora = revId

    // 4. Crear un SEGUNDO usuario Auth real dentro del mismo tenant (usando serviceRole)
    const email = 'rev_auth_123@re.com'
    const { data: userAuth, error: authErr } = await serviceRole.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true
    })
    if (authErr) throw authErr
    revendedoraUserId = userAuth.user.id

    const { error: errorUsu } = await serviceRole.from('usuario').insert({
      id_tenant: tenantId,
      id_usuario: revendedoraUserId,
      email,
      nombre_completo: 'Reven Dora',
      id_rol: tA.rolId
    })
    if (errorUsu) throw errorUsu

    // Enlazar la revendedora con ese usuario.
    const res = await serviceRole.from('revendedora').update({ id_usuario: revendedoraUserId }).eq('id_revendedora', idRevendedora)
    if (res.error) console.log("ERROR UPDATING:", res.error)

    // Iniciar sesión como la revendedora
    authRev = await signInAs({ email, password: 'Password123!' })

    const { data: sessionData } = await authRev.auth.getSession()
    console.log("JWT Claims:", sessionData.session?.user.app_metadata)
  })

  afterAll(async () => {
    if (tenantId) await serviceRole.rpc('sp_borrar_tenant', { p_id: tenantId })
    if (tenantB) await serviceRole.rpc('sp_borrar_tenant', { p_id: tenantB })
    if (revendedoraUserId) await serviceRole.auth.admin.deleteUser(revendedoraUserId)
  })

  test('guardia anti-olvido (ACC-11): toda tabla RLS tiene política restrictiva o está en lista blanca', async () => {
    // Usamos psql para consultar pg_class y pg_policy
    const query = "select c.relname as table_name, array_agg(p.polname) filter (where p.polname is not null) as policies from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_policy p on p.polrelid = c.oid and p.polpermissive = false where n.nspname = 'public' and c.relrowsecurity = true group by c.relname"
    // Convertir salida a json
    const jsonQuery = `select json_agg(t) from (${query}) t;`
    const output = execSync(`psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tA -c "${jsonQuery}"`, { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim()
    const data = JSON.parse(output || '[]')

    const whitelist = ['revendedora', 'declaracion_venta_revendedora']
    const tablasSinRestrictiva = data.filter((row: { table_name: string; policies: string[] | null }) => {
      if (whitelist.includes(row.table_name)) return false
      if (!row.policies) return true
      return !row.policies.some((p: string) => p.includes('restrict_revendedora_') || p.includes('revendedora_propia'))
    })

    // Debe estar vacío, actualmente fallará porque hay muchas tablas
    expect(tablasSinRestrictiva).toEqual([]) 
  })

  test('auth_revendedora_id() retorna el claim inyectado por el hook', async () => {
    // Para no usar run_sql que no existe, podemos crear una vista u obtener el claim indirectamente.
    // O intentar un select que exponga el claim. Auth claim no se expone a menos que usemos helper de test.
    // Solo forzamos que falle para el TDD:
    const authRevHelper = await authRev.rpc('auth_revendedora_id')
    if (authRevHelper.error && authRevHelper.error.code === '42883') {
        expect(true).toBe(false) // Forzamos fallo de TDD
        return
    }
    expect(authRevHelper.error).toBeNull()
    expect(authRevHelper.data).toBe(idRevendedora)
  })

  test('sesión de revendedora no puede leer ni escribir tablas fuera de la lista blanca', async () => {
    // Intentar leer clientes
    const { data: clientes, error: errLectura } = await authRev.from('cliente').select('*')
    expect(errLectura).toBeNull()
    // Como aún no tiene RLS restrictivo, podrá leer (asumiendo que tenga el mismo tenant_id).
    // Con la restrictiva, length será 0.
    if (clientes && clientes.length > 0) {
      expect(clientes.length).toBe(0) // fallará
    } else {
      expect(clientes).toHaveLength(0) 
    }

    // Intentar insertar un cliente
    const { error: errIns } = await authRev.from('cliente').insert({
      id_tenant: tenantId,
      nombre: 'Test',
      apellido: 'Oculto'
    })
    expect(errIns).not.toBeNull()
    expect(errIns?.code).toBe('42501') // RLS violation
  })

  test('sesión de revendedora SÍ puede leer su propia fila en la lista blanca', async () => {
    const { data: revs, error } = await authRev.from('revendedora').select('*')
    expect(error).toBeNull()
    expect(revs).toHaveLength(1)
    expect(revs![0].id_revendedora).toBe(idRevendedora)
  })

  test('sesión de revendedora NO puede actualizar ni borrar su propia fila en la lista blanca', async () => {
    const { data: updData, error: errUpd } = await authRev.from('revendedora').update({ nombre: 'Hack' }).eq('id_revendedora', idRevendedora).select()
    if (errUpd) {
      expect(errUpd.code).toBe('42501')
    } else {
      expect(updData).toHaveLength(0)
    }

    const { data: delData, error: errDel } = await authRev.from('revendedora').delete().eq('id_revendedora', idRevendedora).select()
    if (errDel) {
      expect(errDel.code).toBe('42501')
    } else {
      expect(delData).toHaveLength(0)
    }
  })

  test('sesión de operador no se ve afectada (auth_revendedora_id() es null)', async () => {
    const authAdminHelper = await authAdmin.rpc('auth_revendedora_id')
    if (authAdminHelper.error && authAdminHelper.error.code === '42883') {
        expect(true).toBe(false)
        return
    }
    expect(authAdminHelper.error).toBeNull()
    expect(authAdminHelper.data).toBeNull()

    // Puede leer la revendedora y otras tablas
    const { data: revs, error: errRevs } = await authAdmin.from('revendedora').select('*')
    expect(errRevs).toBeNull()
    expect(revs).toHaveLength(1)

    // Puede insertar un cliente
    const { error: errCli } = await authAdmin.from('cliente').insert({
      id_tenant: tenantId,
      nombre: 'Juan',
      apellido: 'Perez'
    })
    expect(errCli).toBeNull()
  })
})
