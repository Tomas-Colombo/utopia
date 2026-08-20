import { describe, expect, it } from 'vitest'
import { desgloseCosto, nombreCliente, type DesgloseCostoGuardado } from './ventas'

describe('nombreCliente', () => {
  it('sin cliente devuelve Mostrador', () => {
    expect(nombreCliente(null)).toBe('Mostrador')
    expect(nombreCliente(undefined)).toBe('Mostrador')
  })

  it('usa el nombre completo que arma la DB', () => {
    expect(nombreCliente({ nombre: 'Juan', nombre_completo: 'Juan Pérez' })).toBe('Juan Pérez')
  })

  it('cae al nombre cuando no vino el nombre completo', () => {
    // Pasa en los selects que no piden `nombre_completo` — mejor mostrar el
    // nombre que un string vacío.
    expect(nombreCliente({ nombre: 'Juan Pérez' })).toBe('Juan Pérez')
    expect(nombreCliente({ nombre: 'Juan', nombre_completo: null })).toBe('Juan')
  })

  it('cae al nombre si el nombre completo vino en blanco', () => {
    expect(nombreCliente({ nombre: 'Juan', nombre_completo: '   ' })).toBe('Juan')
  })

  it('un cliente anterior a 00058 muestra su nombre tal cual se cargó', () => {
    // apellido NULL ⇒ la columna generada es sólo el nombre.
    expect(
      nombreCliente({ nombre: 'María del Carmen Pérez', nombre_completo: 'María del Carmen Pérez' }),
    ).toBe('María del Carmen Pérez')
  })
})

describe('desgloseCosto', () => {
  it('un pago anterior a 00057 (`{}`) no tiene desglose', () => {
    expect(desgloseCosto({} as DesgloseCostoGuardado)).toBeNull()
  })

  it('reconoce el desglose sin tarifario', () => {
    const d: DesgloseCostoGuardado = {
      sin_tarifario: true,
      costo_total: 0,
      neto: 100,
      dias_acreditacion: 0,
    }
    expect(desgloseCosto(d)).toBe(d)
  })

  it('reconoce el desglose completo', () => {
    const d: DesgloseCostoGuardado = {
      sin_tarifario: false,
      id_arancel_cobro: 'ar-1',
      arancel_pct: 6.29,
      arancel_monto: 6.29,
      iva_arancel_pct: 21,
      iva_arancel_monto: 1.32,
      retenciones: [],
      costo_total: 7.61,
      neto: 92.39,
      dias_acreditacion: 18,
    }
    expect(desgloseCosto(d)).toBe(d)
  })
})
