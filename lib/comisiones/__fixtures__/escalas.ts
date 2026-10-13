/**
 * Fixture de escalas y reglas de comisiones.
 *
 * UNA SOLA tabla de configuración y casos de prueba que alimenta:
 * 1. El test unitario puro de TypeScript (`lib/comisiones/resolver-comision.test.ts`).
 * 2. El test de base de datos (`tests/db/comisiones.test.ts`).
 *
 * Cubre:
 * - Borde exacto de tramo (monto justo en el umbral).
 * - Debajo del primer tramo (regla que arranca por encima de 0).
 * - Porcentaje fijo (DR-16: un único tramo con objetivo_desde = 0).
 * - Vigencias: fecha dentro del rango, regla vencida, regla futura.
 * - Caída de regla propia a general si la propia está vencida.
 * - Fallback sin regla (NR-34: devuelve 0 con sin_regla = true, nunca excepción).
 * - Semilla de local (DR-6: porcentaje 0 para local).
 */

export interface TramoEscalaFixture {
  objetivo_desde: number
  porcentaje: number
}

export interface ReglaComisionFixture {
  id_regla_key: string
  ambito: 'revendedora' | 'local'
  nombre: string
  revendedora_key?: string
  vigente_desde: string
  vigente_hasta: string | null
  activo: boolean
  escalas: TramoEscalaFixture[]
}

export interface CasoResolucionFixture {
  id: string
  descripcion: string
  revendedora_key?: string
  ambito?: 'revendedora' | 'local'
  fecha: string
  monto: number
  esperado: {
    porcentaje: number
    origen: 'propia' | 'general' | 'ninguna'
    sin_regla: boolean
  }
}

/** Configuración de reglas que se inserta o simula para los tests */
export const REGLAS_FIXTURE: ReglaComisionFixture[] = [
  {
    id_regla_key: 'regla_general_revendedoras',
    ambito: 'revendedora',
    nombre: 'Escala General Revendedoras',
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    activo: true,
    escalas: [
      { objetivo_desde: 0, porcentaje: 10 },
      { objetivo_desde: 50000, porcentaje: 15 },
      { objetivo_desde: 100000, porcentaje: 20 },
    ],
  },
  {
    id_regla_key: 'regla_propia_fijo',
    ambito: 'revendedora',
    nombre: 'Comisión Propia Fija 12%',
    revendedora_key: 'revendedora_fija',
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    activo: true,
    escalas: [{ objetivo_desde: 0, porcentaje: 12 }],
  },
  {
    id_regla_key: 'regla_propia_con_piso',
    ambito: 'revendedora',
    nombre: 'Comisión con piso de $50.000',
    revendedora_key: 'revendedora_piso',
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    activo: true,
    escalas: [
      { objetivo_desde: 50000, porcentaje: 18 },
      { objetivo_desde: 100000, porcentaje: 25 },
    ],
  },
  {
    id_regla_key: 'regla_propia_vencida',
    ambito: 'revendedora',
    nombre: 'Comisión Propia Vencida',
    revendedora_key: 'revendedora_vencida',
    vigente_desde: '2025-01-01',
    vigente_hasta: '2025-12-31',
    activo: true,
    escalas: [{ objetivo_desde: 0, porcentaje: 30 }],
  },
  {
    id_regla_key: 'regla_propia_futura',
    ambito: 'revendedora',
    nombre: 'Comisión Propia Futura',
    revendedora_key: 'revendedora_futura',
    vigente_desde: '2027-01-01',
    vigente_hasta: null,
    activo: true,
    escalas: [{ objetivo_desde: 0, porcentaje: 40 }],
  },
  {
    id_regla_key: 'regla_semilla_local',
    ambito: 'local',
    nombre: 'Comisión Vendedor Local (Semilla 0%)',
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    activo: true,
    escalas: [{ objetivo_desde: 0, porcentaje: 0 }],
  },
]

/** Tabla única de casos de prueba */
export const CASOS_RESOLUCION_FIXTURE: CasoResolucionFixture[] = [
  {
    id: 'general_borde_inferior_tramo_1',
    descripcion: 'Monto 0 en regla general: aplica primer tramo (10%)',
    fecha: '2026-06-15',
    monto: 0,
    esperado: { porcentaje: 10, origen: 'general', sin_regla: false },
  },
  {
    id: 'general_intermedio_tramo_1',
    descripcion: 'Monto intermedio 25.000: aplica primer tramo (10%)',
    fecha: '2026-06-15',
    monto: 25000,
    esperado: { porcentaje: 10, origen: 'general', sin_regla: false },
  },
  {
    id: 'general_borde_exacto_tramo_2',
    descripcion: 'Monto exactamente en el borde 50.000: aplica segundo tramo (15%)',
    fecha: '2026-06-15',
    monto: 50000,
    esperado: { porcentaje: 15, origen: 'general', sin_regla: false },
  },
  {
    id: 'general_intermedio_tramo_2',
    descripcion: 'Monto 75.000: aplica segundo tramo (15%)',
    fecha: '2026-06-15',
    monto: 75000,
    esperado: { porcentaje: 15, origen: 'general', sin_regla: false },
  },
  {
    id: 'general_borde_exacto_tramo_3',
    descripcion: 'Monto exactamente en el borde 100.000: aplica tercer tramo (20%)',
    fecha: '2026-06-15',
    monto: 100000,
    esperado: { porcentaje: 20, origen: 'general', sin_regla: false },
  },
  {
    id: 'general_superior_tramo_3',
    descripcion: 'Monto 250.000 por encima del último tramo: aplica tercer tramo (20%)',
    fecha: '2026-06-15',
    monto: 250000,
    esperado: { porcentaje: 20, origen: 'general', sin_regla: false },
  },
  {
    id: 'propia_fijo_independiente_monto',
    descripcion: 'Revendedora con % fijo (12%): aplica 12% con origen propia',
    revendedora_key: 'revendedora_fija',
    fecha: '2026-06-15',
    monto: 80000,
    esperado: { porcentaje: 12, origen: 'propia', sin_regla: false },
  },
  {
    id: 'propia_debajo_del_primer_tramo',
    descripcion: 'Revendedora con piso de 50.000: monto 30.000 no alcanza el tramo → 0% con origen propia',
    revendedora_key: 'revendedora_piso',
    fecha: '2026-06-15',
    monto: 30000,
    esperado: { porcentaje: 0, origen: 'propia', sin_regla: false },
  },
  {
    id: 'propia_borde_tramo_con_piso',
    descripcion: 'Revendedora con piso de 50.000: monto 50.000 alcanza primer tramo (18%)',
    revendedora_key: 'revendedora_piso',
    fecha: '2026-06-15',
    monto: 50000,
    esperado: { porcentaje: 18, origen: 'propia', sin_regla: false },
  },
  {
    id: 'propia_vencida_cae_a_general',
    descripcion: 'Regla propia vencida en 2025: en 2026 cae a la regla general (15% para 60.000)',
    revendedora_key: 'revendedora_vencida',
    fecha: '2026-06-15',
    monto: 60000,
    esperado: { porcentaje: 15, origen: 'general', sin_regla: false },
  },
  {
    id: 'propia_futura_cae_a_general',
    descripcion: 'Regla propia inicia en 2027: en 2026 cae a la regla general (20% para 110.000)',
    revendedora_key: 'revendedora_futura',
    fecha: '2026-06-15',
    monto: 110000,
    esperado: { porcentaje: 20, origen: 'general', sin_regla: false },
  },
  {
    id: 'sin_regla_fallback',
    descripcion: 'Revendedora en fecha sin regla general vigente (año 2020) → 0% sin_regla',
    revendedora_key: 'revendedora_sin_regla',
    fecha: '2020-01-01',
    monto: 50000,
    esperado: { porcentaje: 0, origen: 'ninguna', sin_regla: true },
  },
  {
    id: 'local_semilla_cero',
    descripcion: 'Venta de canal local con semilla 0%: aplica 0% origen general',
    ambito: 'local',
    fecha: '2026-06-15',
    monto: 150000,
    esperado: { porcentaje: 0, origen: 'general', sin_regla: false },
  },
]
