'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import {
  TIPO_CUENTA_DESTINO_LABEL,
  type CuentaDestinoRow,
  type TipoCuentaDestino,
} from '@/lib/types/ventas'
import {
  actualizarCuentaDestinoAction,
  crearCuentaDestinoAction,
  marcarCuentaPredeterminadaAction,
} from '../actions'

const TIPOS: TipoCuentaDestino[] = ['efectivo', 'banco', 'billetera_virtual']

/**
 * ABM de cuentas de cobro. La cuenta predeterminada es la que usa el server
 * cuando una venta no detalla su cobranza, así que siempre tiene que haber
 * una: por eso se puede cambiar cuál es, pero no dejar el tenant sin ninguna.
 */
export function CuentasView({ cuentas }: { cuentas: CuentaDestinoRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCuentaDestino>('banco')
  const [titular, setTitular] = useState('')
  const [identificador, setIdentificador] = useState('')
  const [error, setError] = useState<string | null>(null)

  function crear() {
    if (nombre.trim().length < 2) return setError('Nombre muy corto')
    setError(null)
    start(async () => {
      const res = await crearCuentaDestinoAction({
        nombre,
        tipo,
        titular: titular || null,
        identificador: identificador || null,
      })
      if (!res.ok) return setError(explicar(res.reason))
      setNombre('')
      setTitular('')
      setIdentificador('')
      setCreando(false)
      toast.success('Cuenta creada')
      router.refresh()
    })
  }

  function toggleActivo(c: CuentaDestinoRow) {
    start(async () => {
      const res = await actualizarCuentaDestinoAction({
        id: c.id_cuenta_destino,
        patch: { activo: !c.activo },
      })
      if (!res.ok) return toast.error('No se pudo actualizar', explicar(res.reason))
      router.refresh()
    })
  }

  function hacerPredeterminada(c: CuentaDestinoRow) {
    start(async () => {
      const res = await marcarCuentaPredeterminadaAction({ id: c.id_cuenta_destino })
      if (!res.ok) return toast.error('No se pudo actualizar', explicar(res.reason))
      toast.success('Cuenta predeterminada', c.nombre)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Los lugares donde entra la plata de las ventas. La predeterminada se
          usa cuando una venta no detalla su cobranza.
        </p>
        <Button
          type="button"
          onClick={() => {
            setCreando((v) => !v)
            setError(null)
          }}
          aria-expanded={creando}
        >
          {creando ? 'Cerrar' : 'Nueva cuenta'}
        </Button>
      </div>

      {creando && (
        <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field htmlFor="c-nombre" label="Nombre" required error={error ?? undefined}>
            <Input
              id="c-nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Caja, Santander, Mercado Pago…"
              invalid={!!error}
            />
          </Field>
          <Field htmlFor="c-tipo" label="Tipo" required>
            <select
              id="c-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCuentaDestino)}
              className="w-full"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {TIPO_CUENTA_DESTINO_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="c-titular" label="Titular">
            <Input
              id="c-titular"
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              placeholder="A nombre de"
            />
          </Field>
          <Field
            htmlFor="c-ident"
            label="Identificador"
            hint="CBU, alias, o últimos 4 dígitos de la tarjeta"
          >
            <Input
              id="c-ident"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
            />
          </Field>
          <div className="md:col-span-2">
            <Button
              type="button"
              onClick={crear}
              disabled={pending || nombre.trim().length < 2}
            >
              {pending ? 'Creando…' : 'Crear cuenta'}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Identificador</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cuentas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No hay cuentas cargadas.
                </td>
              </tr>
            ) : (
              cuentas.map((c) => (
                <tr key={c.id_cuenta_destino} className="border-b border-border-2">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.nombre}</span>
                      {c.es_predeterminada && <Badge variant="success">Predeterminada</Badge>}
                    </div>
                    {c.titular && <div className="text-xs text-muted">{c.titular}</div>}
                  </td>
                  <td className="px-4 py-3">{TIPO_CUENTA_DESTINO_LABEL[c.tipo]}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.identificador ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.activo ? (
                      <span className="text-xs uppercase font-mono text-success">Activa</span>
                    ) : (
                      <span className="text-xs uppercase font-mono text-muted">Inactiva</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {!c.es_predeterminada && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => hacerPredeterminada(c)}
                          disabled={pending}
                        >
                          Predeterminada
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActivo(c)}
                          disabled={pending}
                        >
                          {c.activo ? 'Desactivar' : 'Activar'}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function explicar(reason: string): string {
  if (reason === 'nombre-invalido') return 'El nombre es muy corto.'
  if (reason.includes('cuenta_destino_nombre_uk')) return 'Ya existe una cuenta con ese nombre.'
  return reason
}
