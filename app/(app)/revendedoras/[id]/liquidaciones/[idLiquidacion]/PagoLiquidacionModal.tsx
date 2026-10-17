'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { mensajeDeError } from '@/lib/errores/mensajes'
import type { CuentaDestinoRow } from '@/lib/types/ventas'
import { formatearMoneda } from '@/lib/utils/moneda'
import { marcarLiquidacionPagadaAction } from '../actions'
import { Select } from '@/components/ui/Select'

interface PagoLiquidacionModalProps {
  open: boolean
  onClose: () => void
  idLiquidacion: string
  montoACobrar: number
  cuentas: CuentaDestinoRow[]
}

export function PagoLiquidacionModal({
  open,
  onClose,
  idLiquidacion,
  montoACobrar,
  cuentas,
}: PagoLiquidacionModalProps) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [idCuenta, setIdCuenta] = useState(() => cuentas[0]?.id_cuenta_destino || '')
  const [metodo, setMetodo] = useState('transferencia')
  const [referencia, setReferencia] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))

  function registrarPago() {
    if (!idCuenta) {
      return toast.error('Cuenta requerida', 'Seleccioná una cuenta destino para acreditar el cobro.')
    }

    start(async () => {
      const res = await marcarLiquidacionPagadaAction({
        id_liquidacion: idLiquidacion,
        id_cuenta: idCuenta,
        monto: montoACobrar,
        metodo: metodo.trim() || null,
        referencia: referencia.trim() || null,
        fecha: fecha || null,
      })

      if (!res.ok) {
        return toast.error('No se pudo registrar el pago', mensajeDeError(res.reason))
      }

      toast.success('Pago registrado', 'La liquidación fue marcada como pagada.')
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal
      open={open}
      title="Registrar pago de liquidación"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={registrarPago} disabled={pending || cuentas.length === 0}>
            {pending ? 'Registrando…' : 'Confirmar pago'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xs text-muted uppercase font-mono">Monto a cobrar</span>
          <div className="text-lg font-mono font-bold text-foreground">
            {formatearMoneda(montoACobrar)}
          </div>
          <span className="text-xs text-muted">
            El monto a acreditar debe coincidir exactamente con el total de la liquidación.
          </span>
        </div>

        <Field htmlFor="pago-cuenta" label="Cuenta de destino" required>
          {cuentas.length === 0 ? (
            <p className="text-xs text-destructive">
              No hay cuentas activas registradas en el negocio para recibir el pago.
            </p>
          ) : (
            <Select
              id="pago-cuenta"
              value={idCuenta}
              onChange={(e) => setIdCuenta(e.target.value)}
              className="px-3 py-2 text-sm"
            >
              {cuentas.map((c) => (
                <option key={c.id_cuenta_destino} value={c.id_cuenta_destino}>
                  {c.nombre} ({c.tipo})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field htmlFor="pago-fecha" label="Fecha de pago" required>
          <Input
            id="pago-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Field>

        <Field htmlFor="pago-metodo" label="Método de pago">
          <Input
            id="pago-metodo"
            placeholder="Transferencia, Efectivo, etc."
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
          />
        </Field>

        <Field htmlFor="pago-ref" label="Referencia de comprobante">
          <Input
            id="pago-ref"
            placeholder="N° de transferencia, recibo, etc."
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  )
}
