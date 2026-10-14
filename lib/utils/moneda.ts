export function formatearMoneda(n: number): string {
  const formateador = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  
  const formateado = formateador.format(Math.abs(n)).replace(/\u00A0/g, ' ')
  return n < 0 ? `-${formateado}` : formateado
}

export function formatearPorcentaje(n: number): string {
  const formateador = new Intl.NumberFormat('es-AR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  
  return formateador.format(n / 100).replace(/\u00A0/g, ' ')
}

export function formatearVariacion(
  actual: number,
  anterior: number
): { texto: string; direccion: 'sube' | 'baja' | 'igual' | 'sin-base' } {
  if (anterior === 0) {
    return {
      texto: 'sin datos del período anterior',
      direccion: 'sin-base',
    }
  }

  const dif = actual - anterior
  if (dif === 0) {
    return {
      texto: '0,0%',
      direccion: 'igual',
    }
  }

  const pct = Math.abs(dif / anterior) * 100
  const formateador = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

  return {
    texto: `${formateador.format(pct)}%`,
    direccion: dif > 0 ? 'sube' : 'baja',
  }
}
