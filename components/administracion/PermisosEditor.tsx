'use client'

import { CATALOGO_PERMISOS, MODULO_NOMBRE } from '@/lib/types/administracion'

/**
 * Matriz módulo × acción. Controlado. Cada checkbox agrega/quita del
 * array `permisos[modulo]`.
 */
export function PermisosEditor({
  value,
  onChange,
}: {
  value: Record<string, string[]>
  onChange: (v: Record<string, string[]>) => void
}) {
  function toggle(modulo: string, accion: string, on: boolean) {
    const current = value[modulo] ?? []
    const next = on ? [...current, accion] : current.filter((a) => a !== accion)
    const map = { ...value }
    if (next.length === 0) delete map[modulo]
    else map[modulo] = next
    onChange(map)
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left">Módulo</th>
            <th className="px-4 py-3 text-center">Ver</th>
            <th className="px-4 py-3 text-center">Crear</th>
            <th className="px-4 py-3 text-center">Editar</th>
            <th className="px-4 py-3 text-center">Eliminar</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(CATALOGO_PERMISOS).map(([mod, acciones]) => {
            const activas = value[mod] ?? []
            return (
              <tr key={mod} className="border-b border-border-2">
                <td className="px-4 py-3 font-medium">
                  {MODULO_NOMBRE[mod] ?? mod}
                </td>
                {(['ver', 'crear', 'editar', 'eliminar'] as const).map((accion) => {
                  const disponible = acciones.includes(accion)
                  const marcada = activas.includes(accion)
                  return (
                    <td key={accion} className="px-4 py-3 text-center">
                      {disponible ? (
                        <input
                          type="checkbox"
                          aria-label={`${mod} ${accion}`}
                          checked={marcada}
                          onChange={(e) => toggle(mod, accion, e.target.checked)}
                        />
                      ) : (
                        <span className="text-muted-2">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
