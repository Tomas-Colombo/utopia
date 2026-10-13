import { createServerClient } from '../supabase'
import type {
  AmbitoComision,
  ReglaComisionConEscalas,
  ResolucionComision,
} from '@/lib/types/comisiones'
import type {
  CrearReglaGeneralInput,
  GuardarComisionPropiaInput,
  TerminarReglaInput,
} from '@/lib/validation/comisiones'

export function extractErrorSlug(error: unknown): string {
  if (!error) return 'error-desconocido'
  const errObj =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : null
  const code = typeof errObj?.code === 'string' ? errObj.code : ''
  const msg = typeof errObj?.message === 'string' ? errObj.message : String(error)

  if (
    code === '23P01' ||
    msg.includes('regla-solapada') ||
    msg.includes('regla_comision_general_no_solapada') ||
    msg.includes('regla_comision_propia_no_solapada') ||
    msg.includes('solapada')
  ) {
    return 'regla-solapada'
  }

  const cleaned = msg.replace(/^.*sp_[a-zA-Z0-9_]+:\s*/, '').trim()
  const candidate = cleaned.split(':')[0]?.trim().toLowerCase() || ''

  if (candidate && /^[a-z0-9_-]+$/.test(candidate)) {
    return candidate
  }

  return 'error-desconocido'
}

/**
 * Lista las reglas de comisión activas con sus escalas ordenadas por fecha de vigencia descendente.
 */
export async function listReglasComision(
  ambito?: AmbitoComision,
): Promise<ReglaComisionConEscalas[]> {
  const supabase = await createServerClient()
  let query = supabase
    .from('regla_comision')
    .select(`
      id_regla,
      id_tenant,
      ambito,
      id_revendedora,
      nombre,
      vigente_desde,
      vigente_hasta,
      activo,
      created_at,
      updated_at,
      escala_comision (
        id_escala,
        id_tenant,
        id_regla,
        objetivo_desde,
        porcentaje,
        created_at
      )
    `)
    .order('vigente_desde', { ascending: false })

  if (ambito) {
    query = query.eq('ambito', ambito)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Error al listar reglas de comisión: ${error.message}`)
  }

  return (data || []).map((r) => ({
    id_regla: r.id_regla,
    id_tenant: r.id_tenant,
    ambito: r.ambito as AmbitoComision,
    id_revendedora: r.id_revendedora,
    nombre: r.nombre,
    vigente_desde: r.vigente_desde,
    vigente_hasta: r.vigente_hasta,
    activo: r.activo,
    created_at: r.created_at,
    updated_at: r.updated_at,
    escalas: (r.escala_comision || []).map(
      (e: {
        id_escala: string
        id_tenant: string
        id_regla: string
        objetivo_desde: number | string
        porcentaje: number | string
        created_at: string
      }) => ({
        id_escala: e.id_escala,
        id_tenant: e.id_tenant,
        id_regla: e.id_regla,
        objetivo_desde: Number(e.objetivo_desde),
        porcentaje: Number(e.porcentaje),
        created_at: e.created_at,
      }),
    ),
  }))
}

/**
 * Obtiene el estado de comisión para una revendedora:
 * - Regla propia vigente (si tiene)
 * - Regla general vigente (fallback)
 * - Resolución actual de SQL vía fn_resolver_comision
 */
export async function getComisionRevendedora(idRevendedora: string): Promise<{
  resolucion: ResolucionComision
  reglaPropia: ReglaComisionConEscalas | null
  reglaGeneral: ReglaComisionConEscalas | null
}> {
  const supabase = await createServerClient()
  const hoy = new Date().toISOString().split('T')[0]

  // 1. Resolver vía SP
  const { data: resData, error: resErr } = await supabase.rpc(
    'fn_resolver_comision',
    {
      p_id_revendedora: idRevendedora,
      p_fecha: hoy,
      p_monto_periodo: 0,
      p_ambito: 'revendedora',
    },
  )

  let resolucion: ResolucionComision = {
    porcentaje: 0,
    origen: 'ninguna',
    id_regla: null,
    sin_regla: true,
  }

  if (!resErr && resData) {
    const raw = Array.isArray(resData) ? resData[0] : resData
    resolucion = {
      porcentaje: Number(raw.porcentaje),
      origen: raw.origen,
      id_regla: raw.id_regla,
      sin_regla: Boolean(raw.sin_regla),
    }
  }

  // 2. Traer reglas de revendedora para contextualizar la UI
  const todas = await listReglasComision('revendedora')

  const reglaPropia =
    todas.find(
      (r) =>
        r.id_revendedora === idRevendedora &&
        r.activo &&
        r.vigente_desde <= hoy &&
        (r.vigente_hasta === null || r.vigente_hasta >= hoy),
    ) ??
    todas.find((r) => r.id_revendedora === idRevendedora && r.activo) ??
    null

  const reglaGeneral =
    todas.find(
      (r) =>
        r.id_revendedora === null &&
        r.activo &&
        r.vigente_desde <= hoy &&
        (r.vigente_hasta === null || r.vigente_hasta >= hoy),
    ) ??
    todas.find((r) => r.id_revendedora === null && r.activo) ??
    null

  return {
    resolucion,
    reglaPropia,
    reglaGeneral,
  }
}

/**
 * Crea una regla general de comisión (revendedora o local).
 */
export async function crearReglaGeneral(
  data: CrearReglaGeneralInput,
): Promise<{ ok: true; id_regla: string } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const { data: resData, error } = await supabase.rpc('sp_crear_regla_comision', {
    p_ambito: data.ambito,
    p_nombre: data.nombre,
    p_id_revendedora: null,
    p_vigente_desde: data.vigente_desde,
    p_vigente_hasta: data.vigente_hasta || null,
    p_escalas: data.escalas,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true, id_regla: resData }
}

/**
 * Guarda o actualiza la comisión propia de una revendedora (DR-16).
 * Admite porcentaje fijo o escala de tramos.
 */
export async function guardarComisionPropia(
  data: GuardarComisionPropiaInput,
): Promise<{ ok: true; id_regla: string } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const tramos =
    data.tipo === 'fijo'
      ? [{ objetivo_desde: 0, porcentaje: data.porcentajeFijo ?? 0 }]
      : data.escalas || []

  if (tramos.length === 0) {
    return { ok: false, reason: 'escala-comision-invalida' }
  }

  const nombre =
    data.tipo === 'fijo'
      ? `Comisión fija ${data.porcentajeFijo ?? 0}%`
      : 'Escala personalizada por tramos'

  const { data: resData, error } = await supabase.rpc('sp_crear_regla_comision', {
    p_ambito: 'revendedora',
    p_nombre: nombre,
    p_id_revendedora: data.id_revendedora,
    p_vigente_desde: data.vigente_desde,
    p_vigente_hasta: data.vigente_hasta || null,
    p_escalas: tramos,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true, id_regla: resData }
}

/**
 * Finaliza la vigencia de una regla de comisión (para dar paso a una nueva sin solapamiento).
 */
export async function terminarRegla(
  data: TerminarReglaInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const supabase = await createServerClient()
  const fechaTermino =
    data.vigente_hasta || new Date().toISOString().split('T')[0]

  const { error } = await supabase.rpc('sp_terminar_regla_comision', {
    p_id_regla: data.id_regla,
    p_vigente_hasta: fechaTermino,
  })

  if (error) {
    return { ok: false, reason: extractErrorSlug(error) }
  }

  return { ok: true }
}
