import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
