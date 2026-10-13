import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BloqueResumen } from './BloqueResumen'
import { BloqueGanancia } from './BloqueGanancia'
import { BloqueMovimientoPlata } from './BloqueMovimientoPlata'
import { GraficoTendencia } from './GraficoTendencia'
import { BloqueCobrar } from './BloqueCobrar'
import { BloqueError } from './BloqueError'

describe('Componentes de Reportes (Bloques 1-5)', () => {
  const mockResultados = {
    mes: '2026-10-01',
    ventas_brutas: 1000,
    anulaciones: 0,
    ventas_netas: 1000,
    costo_mercaderia: 400,
    ganancia_sobre_ventas: 600,
    gastos: 200,
    comision_liquidada: 0,
    comision_pendiente_estimada: 0,
    ganancia_final: 400,
    porcentaje_ganancia: 0.4,
    cantidad_ventas: 10,
    ticket_promedio: 100,
  }

  const mockFlujo = {
    mes: '2026-10-01',
    cobrado: 1000,
    devuelto_clientes: 0,
    costo_procesamiento: 50,
    neto_cobros: 950,
    compras_mercaderia: 300,
    pagos_proveedores: 100,
    gastos: 200,
    flujo_neto: 350,
    por_acreditar: { 'MercadoPago': 500 }
  }

  const mockPosicion = {
    capital_propio: 1000,
    mercaderia_terceros: 0,
    devueltos_clientes: 0,
    valor_venta_potencial: 2000,
    productos_sin_precio: 0,
    deuda_proveedores: 0,
    por_cobrar: {
      a_cobrar: 1500,
      vence_este_mes: 500,
      vencido: 1000,
      cuotas_pendientes: 5,
      cuotas_vencidas: 3,
      clientes_con_deuda: 2,
      planes_activos: 2,
    }
  }

  it('renderiza BloqueResumen', () => {
    render(
      <BloqueResumen 
        resultados={mockResultados} 
        resultadosPrev={null}
        flujo={mockFlujo}
        flujoPrev={null}
        posicion={mockPosicion}
        tieneGastos={true}
      />
    )
    expect(screen.getByText('Vendiste')).toBeDefined()
    expect(screen.getByText('Te quedó de ganancia')).toBeDefined()
    expect(screen.getByText('Entró a caja')).toBeDefined()
    expect(screen.getByText('Te deben')).toBeDefined()
  })

  it('renderiza BloqueGanancia', () => {
    render(<BloqueGanancia resultados={mockResultados} tieneGastos={true} />)
    expect(screen.getByText('Cómo se arma tu ganancia')).toBeDefined()
    expect(screen.getByText('Vendiste (neto)')).toBeDefined()
    expect(screen.getByText('Menos costo de mercadería')).toBeDefined()
  })

  it('renderiza BloqueMovimientoPlata', () => {
    render(<BloqueMovimientoPlata flujo={mockFlujo} tieneGastos={true} />)
    expect(screen.getByText('Movimiento de plata')).toBeDefined()
    expect(screen.getByText('MercadoPago')).toBeDefined()
  })

  it('renderiza GraficoTendencia (estado vacío si no hay serie)', () => {
    render(<GraficoTendencia serie={[]} tieneGastos={true} />)
    expect(screen.getByText('No hay datos para la tendencia.')).toBeDefined()
  })

  it('renderiza GraficoTendencia con serie', () => {
    const serieMock = [{ mes: '2026-10-01', ventas_netas: 100, ganancia_sobre_ventas: 50, ganancia_final: 20, cobrado_neto: 80 }]
    render(<GraficoTendencia serie={serieMock} tieneGastos={true} />)
    expect(screen.getByRole('img')).toBeDefined()
  })

  it('renderiza BloqueCobrar', () => {
    render(<BloqueCobrar porCobrar={mockPosicion.por_cobrar} puedeVerVentas={true} />)
    expect(screen.getByText('Lo que te deben')).toBeDefined()
    expect(screen.getByText('Ya vencido')).toBeDefined()
    expect(screen.getByRole('link')).toBeDefined()
  })

  it('renderiza BloqueError', () => {
    render(<BloqueError onRetry={() => {}} />)
    expect(screen.getByText('Reintentar')).toBeDefined()
  })
})

import { BloqueMercaderia } from './BloqueMercaderia'
import { BloqueProveedores } from './BloqueProveedores'
import { BloqueGastos } from './BloqueGastos'
import { BloqueRanking } from './BloqueRanking'

// mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/reportes'
}))

describe('Componentes de Reportes (Bloques 6-9)', () => {
  const mockPosicion = {
    capital_propio: 1000,
    mercaderia_terceros: 200,
    devueltos_clientes: 0,
    valor_venta_potencial: 2000,
    productos_sin_precio: 3,
    deuda_proveedores: 400,
    por_cobrar: null
  }

  it('renderiza BloqueMercaderia', () => {
    render(<BloqueMercaderia posicion={mockPosicion} />)
    expect(screen.getByText('Tu stock hoy')).toBeDefined()
    expect(screen.getByText('3 productos sin precio')).toBeDefined()
  })

  it('renderiza BloqueProveedores', () => {
    render(<BloqueProveedores posicion={mockPosicion} />)
    expect(screen.getByText('Lo que debés')).toBeDefined()
    expect(screen.getByText('A proveedores')).toBeDefined()
    expect(screen.getByText('Ver rendiciones pendientes →')).toBeDefined()
  })

  it('renderiza BloqueGastos', () => {
    const presupuestos = [
      { id_categoria_gasto: '1', nombre: 'Alquiler', gastado: 500, presupuesto_mensual: 1000, consumido_pct: 0.5 }
    ]
    render(<BloqueGastos presupuestos={presupuestos} mesHasta="2026-10-31" />)
    expect(screen.getByText('Gastos vs. Presupuesto')).toBeDefined()
    expect(screen.getByText('Alquiler')).toBeDefined()
  })

  it('renderiza BloqueGastos vacío', () => {
    render(<BloqueGastos presupuestos={[]} mesHasta="2026-10-31" />)
    expect(screen.getByText('No hay gastos ni presupuestos cargados en este mes.')).toBeDefined()
  })

  it('renderiza BloqueRanking', () => {
    const ranking = [
      { id_producto: '1', nombre: 'Remera', unidades_vendidas: 10, monto_vendido: 1000, ganancia: 500, porcentaje_ventas: null }
    ]
    render(<BloqueRanking ranking={ranking} ordenActual="ganancia" />)
    expect(screen.getByText('Los que más rinden')).toBeDefined()
    expect(screen.getByText('Remera')).toBeDefined()
    expect(screen.getByText('Exportar CSV')).toBeDefined()
  })
})
