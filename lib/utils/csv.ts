/**
 * Sanitiza valores de texto para evitar inyecciones CSV en Excel/Sheets.
 * Si el texto empieza con `=`, `+`, `-` o `@`, se le antepone un apóstrofe `'`.
 */
export function sanitizeCsvValue(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`
  }
  return str
}

/**
 * Escapa comillas y sanitiza el valor.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return '""'
  const sanitized = sanitizeCsvValue(value)
  return `"${sanitized.replace(/"/g, '""')}"`
}

/**
 * Devuelve el opuesto del número para columnas que restan,
 * evitando el formato "--100" que rompe Excel.
 */
export function csvNegative(value: number | null | undefined): string | number {
  if (value == null) return ''
  return -value
}

/**
 * Descarga el contenido CSV con BOM UTF-8 para que Excel lo abra bien.
 */
export function downloadCsv(filename: string, csvContent: string) {
  // BOM UTF-8
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
