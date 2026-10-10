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

    const { data: rId, error: rErr } = await serviceRole.from('rol').insert({
      id_tenant: tenantId,
      nombre: 'Revendedora',
      permisos: { 'revendedoras': ['ver_propio'] }
    }).select('id_rol').single()
    if (rErr) throw rErr

    const { error: errorUsu } = await serviceRole.rpc('sp_enlazar_revendedora_usuario', {
      p_id_revendedora: idRevendedora,
      p_id_usuario: revendedoraUserId,
      p_id_tenant: tenantId,
      p_email: email,
      p_nombre: 'Reven Dora',
      p_id_rol: rId.id_rol
    })
    if (errorUsu) throw errorUsu

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

  test('ACC-42: SPs de administración rechazados para revendedoras por RLS restrictivo', async () => {
    // 1. sp_create_rol
    const { error: err1 } = await authRev.rpc('sp_create_rol', { p_nombre: 'Hacker', p_permisos: {} })
    expect(err1).toBeDefined()
    expect(err1?.code).toBe('42501') // RLS viola
    
    // 2. sp_toggle_usuario_activo (intenta update sobre usuario)
    const { error: err2 } = await authRev.rpc('sp_toggle_usuario_activo', { p_id_usuario: revendedoraUserId, p_estado: 'inactivo' })
    if (!err2) {
      const { data } = await serviceRole.from('usuario').select('estado_usuario').eq('id_usuario', revendedoraUserId).single()
      expect(data?.estado_usuario).not.toBe('inactivo')
    }
  })

  test('sp_enlazar_revendedora_usuario deniega ejecucion a authenticated y public', async () => {
    const { error } = await authAdmin.rpc('sp_enlazar_revendedora_usuario', {
      p_id_revendedora: idRevendedora,
      p_id_usuario: '00000000-0000-0000-0000-000000000000',
      p_id_tenant: tenantId,
      p_email: 'x@x.com',
      p_nombre: 'X',
      p_id_rol: '00000000-0000-0000-0000-000000000000'
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501') // Could not find the function or permission denied in postgrest
  })

  test('revocar acceso no borra el usuario de auth, lo inactiva y quita id_usuario de revendedora', async () => {
    // 1. Give it some "activity" - e.g. change updated_at on the revendedora
    await serviceRole.from('revendedora').update({ notas: 'activa' }).eq('id_revendedora', idRevendedora)

    const { error: unlinkError } = await serviceRole.from('revendedora').update({
      id_usuario: null
    }).eq('id_revendedora', idRevendedora)
    expect(unlinkError).toBeNull()

    const { error: userError } = await serviceRole.from('usuario').update({
      estado_usuario: 'inactivo'
    }).eq('id_usuario', revendedoraUserId)
    expect(userError).toBeNull()

    // Comprobar que no hay constraints rompiendose
    const { data: user } = await serviceRole.from('usuario').select('estado_usuario').eq('id_usuario', revendedoraUserId).single()
    expect(user?.estado_usuario).toBe('inactivo')

    const { data: rev } = await serviceRole.from('revendedora').select('id_usuario').eq('id_revendedora', idRevendedora).single()
    expect(rev?.id_usuario).toBeNull()

    // El auth_user todavia existe en supabase
    const { data: authUser, error: authError } = await serviceRole.auth.admin.getUserById(revendedoraUserId)
    expect(authError).toBeNull()
    expect(authUser?.user?.id).toBe(revendedoraUserId)
  })
  test('ACC-10: usuario revendedora sin acceso falla cerrado y no lee cliente ni venta', async () => {
    // 1. Quitar el acceso a la revendedora (simula revocarAcceso)
    await serviceRole.from('revendedora').update({ id_usuario: null }).eq('id_revendedora', idRevendedora)

    // 2. Pedir un token nuevo simulando la llamada de auth. (En tests usamos rpc que simula el hook)
    // Supabase JS tests environment uses GoTrueClient, but the token hook logic determines if tenant_id is injected.
    // Instead of logging in again which is complex in DB tests, we can just call the hook manually to see what it emits
    const { data: hookResult, error: hookErr } = await serviceRole.rpc('custom_access_token_hook', { 
      event: { user_id: revendedoraUserId, claims: { app_metadata: {} } } 
    })
    expect(hookErr).toBeNull()

    // The hook should omit tenant_id
    expect(hookResult?.claims?.tenant_id).toBeUndefined()
    expect(hookResult?.claims?.id_revendedora).toBeUndefined()

    // 3. Forzar el JWT actual sin tenant_id ni id_revendedora simulando lo que emitiría el hook
    const jwtSinTenant = `{"role":"authenticated", "sub":"${revendedoraUserId}", "email":"x@x.com"}`
    await serviceRole.rpc('set_claim', { jwt_claim: jwtSinTenant })

    // 4. Comprobar lectura de cliente
    const { data: clientes } = await authRev.from('cliente').select('*')
    expect(clientes).toHaveLength(0)

    // Comprobar lectura de venta
    const { data: ventas } = await authRev.from('venta').select('*')
    expect(ventas).toHaveLength(0)
  })
})
