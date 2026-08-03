'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { QrScanner } from '@/components/inventario/QrScanner'
import {
  buscarMatchNombre,
  indexarPorNombre,
  normalizar,
} from '@/lib/inventario/producto-match'
import { FORMA_PAGO_LABEL, type FormaPago } from '@/lib/types/precios'
import type { ProductoConDetalle } from '@/lib/types/inventario'
import type { LineaCarrito } from '@/lib/types/ventas'
import { registrarVentaAction, crearClienteAction } from '../actions'

interface ClienteOption { id: string; nombre: string; telefono: string | null }
/** Un talle con stock libre, tal como lo devuelve `elegir-talle`. */
interface TalleOpcion { talle: string; disponibles: number }
/** Grupo del carrito: N unidades del mismo producto+talle en una sola fila. */
interface Grupo {
  key: string
  id_producto: string
  talle: string | null
  producto_nombre: string
  sku: string | null
  categoria_nombre: string | null
  precio_lista: number | null
  precio_final: number | null
  desactualizado: boolean
  advertencia: string | null
  qrs: string[]
  cantidad: number
  subtotal: number
}
interface SelectorTalle {
  idProducto: string
  productoNombre: string
  /** null = agregar líneas nuevas; si tiene valor, es la key del grupo a reemplazar. */
  grupoKey: string | null
  opciones: TalleOpcion[]
  /** Unidades disponibles SIN talle asignado — se ofrecen aparte. */
  sinTalle: number
}
interface ReservaOption {
  id: string
  fecha: string
  fecha_vencimiento: string
  cliente_nombre: string | null
  items_count: number
}

/**
 * Carrito de venta con escaneo QR + búsqueda manual.
 *
 * IMPORTANTE: el precio final ES calculado en el server (endpoint
 * /api/ventas/lookup-item que llama sp_calcular_precio_venta_snapshot).
 * La UI solo muestra — el operador NO puede editar precio arbitrariamente.
 *
 * La confirmación de venta llama sp_registrar_venta que reevalúa TODO
 * (precio, reserva, estado de item) en la misma tx atómica. Si algo
 * cambió entre "agregar al carrito" y "confirmar" (ej. otro operador
 * vendió el mismo item), la tx falla y el usuario ve el error.
 */
export function NuevaVentaView({
  clientes: clientesIniciales,
  reservasActivas,
  productos,
  idReservaPreseleccionada,
}: {
  clientes: ClienteOption[]
  reservasActivas: ReservaOption[]
  productos: ProductoConDetalle[]
  idReservaPreseleccionada: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [clientes, setClientes] = useState<ClienteOption[]>(clientesIniciales)
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo')
  const [idCliente, setIdCliente] = useState<string>('')

  // Alta rápida de cliente en línea
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [guardandoCliente, startCliente] = useTransition()
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [errorCliente, setErrorCliente] = useState<string | null>(null)
  const [idReserva, setIdReserva] = useState<string>(idReservaPreseleccionada ?? '')
  const [observaciones, setObservaciones] = useState('')

  const [qrInput, setQrInput] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [camaraOpen, setCamaraOpen] = useState(false)

  // Buscador unificado: el mismo input acepta QR, SKU o nombre. Reusamos el
  // índice de nombres normalizado del inventario para sugerir y resolver el
  // producto cuando lo que se tipeó no es un código.
  const [sugerenciasOpen, setSugerenciasOpen] = useState(false)
  const [resaltado, setResaltado] = useState(0)
  // Selector de talle. Sirve para dos cosas con el mismo estado:
  //   grupoKey === null  → estoy agregando un producto y falta elegir talle
  //   grupoKey === '<qr>' → estoy cambiando el talle de esa línea del carrito
  const [selectorTalle, setSelectorTalle] = useState<SelectorTalle | null>(null)
  const indexNombres = useMemo(() => indexarPorNombre(productos), [productos])
  const sugerencias = useMemo(() => {
    const q = normalizar(qrInput)
    if (!q) return []
    return productos.filter((p) => normalizar(p.nombre).includes(q)).slice(0, 8)
  }, [productos, qrInput])

  // Combobox de cliente: mismo patrón que el buscador de productos. `cliInput`
  // guarda lo tipeado (o el nombre del cliente seleccionado en modo readonly).
  // Mostrador = idCliente vacío. Buscamos por nombre y por teléfono normalizados.
  const [cliInput, setCliInput] = useState('')
  const [cliOpen, setCliOpen] = useState(false)
  const [cliResaltado, setCliResaltado] = useState(0)

  const [lineas, setLineas] = useState<LineaCarrito[]>([])
  const [confirmarOpen, setConfirmarOpen] = useState(false)

  // Cuando cambia forma_pago o reserva ⇒ recalculo precios de cada línea.
  useEffect(() => {
    if (lineas.length === 0) return
    let cancelled = false
    ;(async () => {
      const refreshed: LineaCarrito[] = []
      for (const l of lineas) {
        try {
          const r = await fetch(
            `/api/ventas/lookup-item?qr=${encodeURIComponent(l.qr_code)}&forma_pago=${formaPago}${
              idReserva ? `&id_reserva=${encodeURIComponent(idReserva)}` : ''
            }`,
          )
          const data = await r.json()
          if (data.ok) refreshed.push(data.linea as LineaCarrito)
          else refreshed.push(l) // dejo la vieja si falla
        } catch {
          refreshed.push(l)
        }
      }
      if (!cancelled) setLineas(refreshed)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formaPago, idReserva])

  const total = useMemo(
    () => lineas.reduce((a, l) => a + (l.precio_final ?? 0), 0),
    [lineas],
  )

  // Agrupa por producto+talle preservando el orden de entrada al carrito. Se
  // usa una unidad como "prototipo" (nombre, precio, sku); el precio final se
  // asume igual en todas las unidades del grupo — es lo que devuelve el
  // recálculo del server, no una simplificación de la UI.
  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>()
    for (const l of lineas) {
      const key = `${l.id_producto}|${l.talle ?? '__nula__'}`
      const g = map.get(key)
      if (g) {
        g.qrs.push(l.qr_code)
        g.cantidad++
        g.subtotal += l.precio_final ?? 0
      } else {
        map.set(key, {
          key,
          id_producto: l.id_producto,
          talle: l.talle,
          producto_nombre: l.producto_nombre,
          sku: l.sku,
          categoria_nombre: l.categoria_nombre,
          precio_lista: l.precio_lista,
          precio_final: l.precio_final,
          desactualizado: l.desactualizado,
          advertencia: l.advertencia,
          qrs: [l.qr_code],
          cantidad: 1,
          subtotal: l.precio_final ?? 0,
        })
      }
    }
    return [...map.values()]
  }, [lineas])

  // Submit del buscador (botón Agregar). Con sugerencias de nombre abiertas,
  // elegimos la resaltada — NUNCA caemos al path de código, para no agregar por
  // SKU un ítem equivocado. Sin sugerencias, tratamos el texto como código
  // (QR/SKU) o nombre exacto.
  function agregarLinea(e?: React.FormEvent) {
    e?.preventDefault()
    if (sugerenciasOpen && sugerencias.length > 0) {
      elegirSugerencia(sugerencias[Math.min(resaltado, sugerencias.length - 1)])
      return
    }
    const texto = qrInput.trim()
    if (!texto) return
    const match = buscarMatchNombre(indexNombres, texto)
    if (match) void agregarPorProducto(match.id_producto)
    else void agregarPorCodigo(texto)
  }

  // Navegación por teclado del desplegable de nombres.
  function onBuscadorKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!sugerenciasOpen || sugerencias.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado((i) => Math.min(sugerencias.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((i) => Math.max(0, i - 1))
    } else if (e.key === 'Escape') {
      setSugerenciasOpen(false)
    }
  }

  // Selección directa desde el desplegable de sugerencias.
  function elegirSugerencia(p: ProductoConDetalle) {
    setSugerenciasOpen(false)
    setQrInput(p.nombre)
    void agregarPorProducto(p.id_producto)
  }

  // Arma la URL del lookup con el contexto común (forma de pago, reserva) y las
  // unidades a saltear. `excluir` es lo que permite cargar dos unidades del
  // mismo producto y talle: sin eso el server devuelve siempre la misma (FIFO)
  // y la segunda rebota como duplicada.
  function lookupUrl(
    query: Record<string, string | null | undefined>,
    excluir: string[] = [],
  ): string {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v)
    qs.set('forma_pago', formaPago)
    if (idReserva) qs.set('id_reserva', idReserva)
    if (excluir.length > 0) qs.set('excluir', excluir.join(','))
    return `/api/ventas/lookup-item?${qs.toString()}`
  }

  /** Ítems ya cargados, opcionalmente sin el de `exceptoQr` (el que se edita). */
  function itemsEnCarrito(exceptoQr?: string): string[] {
    return lineas.filter((l) => l.qr_code !== exceptoQr).map((l) => l.id_item)
  }

  // Carga una línea a partir de un código (QR exacto o SKU con talle). Lo usan
  // tanto el input manual como el escaneo por cámara.
  async function agregarPorCodigo(rawCode: string) {
    const codigo = rawCode.trim()
    if (!codigo || buscando) return
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const r = await fetch(lookupUrl({ code: codigo }, itemsEnCarrito()))
      const data = await r.json()
      if (!data.ok) {
        setErrorBusqueda(traducirReason(data.reason, data))
        return
      }
      const nueva = data.linea as LineaCarrito
      if (pushLinea(nueva)) setQrInput('')
      else setErrorBusqueda('Ese ítem ya está en el carrito')
    } catch (e) {
      setErrorBusqueda((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  // Agrega una línea al carrito evitando duplicados por QR. Devuelve la línea
  // agregada, o null si estaba duplicada.
  function pushLinea(nueva: LineaCarrito): LineaCarrito | null {
    let agregada: LineaCarrito | null = nueva
    setLineas((ls) => {
      if (ls.some((l) => l.qr_code === nueva.qr_code)) {
        agregada = null
        return ls
      }
      return [...ls, nueva]
    })
    return agregada
  }

  // Agrega por producto (búsqueda por nombre). Si el producto usa talles y no
  // se pasó uno, el server responde 'elegir-talle' con el stock de cada talle
  // y abrimos el selector — nunca elige una unidad por nosotros.
  // `talle`: valor del talle (ej. "M"), o `null` para pedir explícitamente
  // una unidad SIN talle (categorías con talles pero unidades sin cargar).
  // `extraExcluidos`: ids a saltear ADEMÁS del carrito. Sirve para encadenar
  // N llamadas seguidas (ej. "cargar 3") sin depender de que React haya
  // re-renderizado entre await y await.
  async function agregarPorProducto(
    idProducto: string,
    talle?: string | null,
    extraExcluidos: string[] = [],
  ): Promise<LineaCarrito | null> {
    if (!idProducto || buscando) return null
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const r = await fetch(
        lookupUrl(
          {
            id_producto: idProducto,
            talle: talle ?? undefined,
            sin_talle: talle === null ? '1' : undefined,
          },
          [...itemsEnCarrito(), ...extraExcluidos],
        ),
      )
      const data = await r.json()
      if (!data.ok) {
        if (data.reason === 'elegir-talle') {
          setSelectorTalle({
            idProducto,
            productoNombre: nombreDeProducto(idProducto),
            grupoKey: null,
            opciones: data.talles as TalleOpcion[],
            sinTalle: Number(data.sin_talle ?? 0),
          })
          return null
        }
        setErrorBusqueda(traducirReason(data.reason, data))
        return null
      }
      const nueva = data.linea as LineaCarrito
      const ok = pushLinea(nueva)
      if (!ok) {
        setErrorBusqueda('Ese ítem ya está en el carrito')
        return null
      }
      setQrInput('')
      setSelectorTalle(null)
      return nueva
    } catch (e) {
      setErrorBusqueda((e as Error).message)
      return null
    } finally {
      setBuscando(false)
    }
  }

  function nombreDeProducto(idProducto: string): string {
    return productos.find((p) => p.id_producto === idProducto)?.nombre ?? 'Producto'
  }

  // Abre el selector para un grupo ya cargado. Se excluye el resto del
  // carrito pero SÍ se cuentan las unidades del propio grupo como "no
  // disponibles" — el cambio implica quitar y volver a pedir N unidades del
  // otro talle, así que las viejas no se pueden reusar. Si el producto no
  // maneja talles no hay nada que elegir.
  async function abrirCambioTalle(g: Grupo) {
    if (buscando) return
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const r = await fetch(lookupUrl({ id_producto: g.id_producto }, itemsEnCarrito()))
      const data = await r.json()
      if (data.reason !== 'elegir-talle') {
        setErrorBusqueda(
          data.ok
            ? 'Este producto no maneja talles.'
            : traducirReason(data.reason, data),
        )
        return
      }
      setSelectorTalle({
        idProducto: g.id_producto,
        productoNombre: g.producto_nombre,
        grupoKey: g.key,
        opciones: data.talles as TalleOpcion[],
        sinTalle: Number(data.sin_talle ?? 0),
      })
    } catch (e) {
      setErrorBusqueda((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  // Cambia el talle de un grupo entero: quita las N unidades del talle viejo
  // y pide N unidades del talle nuevo. Si el nuevo pedido falla a mitad de
  // camino (poco stock), se queda con las que sí entraron.
  async function cambiarTalleGrupo(grupoKey: string, talleNuevo: string | null) {
    const g = grupos.find((x) => x.key === grupoKey)
    if (!g) return
    const set = new Set(g.qrs)
    setLineas((ls) => ls.filter((l) => !set.has(l.qr_code)))
    const running: string[] = []
    for (let i = 0; i < g.cantidad; i++) {
      const linea = await agregarPorProducto(g.id_producto, talleNuevo, running)
      if (!linea) break
      running.push(linea.id_item)
    }
    setSelectorTalle(null)
  }

  /** Click en un chip del selector: agrega una línea nueva o cambia el grupo.
   *  `talle=null` = eligió explícitamente la opción "Sin talle". */
  function elegirTalle(talle: string | null) {
    if (!selectorTalle) return
    if (selectorTalle.grupoKey) void cambiarTalleGrupo(selectorTalle.grupoKey, talle)
    else void agregarPorProducto(selectorTalle.idProducto, talle)
  }

  // Ajusta la cantidad de un grupo (producto+talle) a `nueva`. Si sube, pide N
  // unidades al server encadenando y excluyendo lo que se va agregando; si
  // baja, saca del carrito las últimas unidades del grupo (FIFO reverso).
  async function setCantidadGrupo(g: Grupo, nueva: number) {
    const n = Math.max(0, Math.floor(nueva))
    if (n === g.cantidad) return
    if (n < g.cantidad) {
      const aQuitar = new Set(g.qrs.slice(n))
      setLineas((ls) => ls.filter((l) => !aQuitar.has(l.qr_code)))
      return
    }
    const running: string[] = []
    for (let i = 0; i < n - g.cantidad; i++) {
      const linea = await agregarPorProducto(g.id_producto, g.talle, running)
      if (!linea) break
      running.push(linea.id_item)
    }
  }

  function quitarGrupo(g: Grupo) {
    const set = new Set(g.qrs)
    setLineas((ls) => ls.filter((l) => !set.has(l.qr_code)))
    setSelectorTalle((s) => (s?.grupoKey === g.key ? null : s))
  }

  function crearCliente() {
    const nombre = nuevoNombre.trim()
    if (nombre.length < 2) return setErrorCliente('Nombre muy corto')
    setErrorCliente(null)
    startCliente(async () => {
      const res = await crearClienteAction({
        nombre,
        telefono: nuevoTelefono.trim() || null,
      })
      if (!res.ok) return setErrorCliente(res.reason)
      const nuevo: ClienteOption = {
        id: res.data!.id,
        nombre,
        telefono: nuevoTelefono.trim() || null,
      }
      setClientes((xs) => [...xs, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setIdCliente(nuevo.id)
      setCliInput(nuevo.nombre)
      setNuevoNombre('')
      setNuevoTelefono('')
      setCreandoCliente(false)
      toast.success('Cliente creado', nombre)
    })
  }

  function confirmar() {
    setConfirmarOpen(false)
    start(async () => {
      const res = await registrarVentaAction({
        lineas: lineas.map((l) => ({ id_item: l.id_item })),
        formaPago,
        idCliente: idCliente || null,
        idReserva: idReserva || null,
        observaciones: observaciones || null,
      })
      if (!res.ok) return toast.error('No se pudo registrar la venta', traducirReason(res.reason))
      toast.success('Venta registrada', `Total $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)
      router.push(`/ventas/${res.data!.id}`)
      router.refresh()
    })
  }

  const clientesFiltrados = idReserva
    ? clientes.filter((c) => {
        if (c.id === idCliente) return true // no ocultar al cliente ya seleccionado
        const r = reservasActivas.find((x) => x.id === idReserva)
        return !r?.cliente_nombre || r.cliente_nombre === c.nombre
      })
    : clientes

  // Sugerencias visibles: filtro por nombre/teléfono normalizado; sin query,
  // arrancamos con los primeros N (default cuando el combobox se abre).
  const cliSugerencias = useMemo(() => {
    const q = normalizar(cliInput)
    if (!q) return clientesFiltrados.slice(0, 8)
    const digitos = cliInput.replace(/\D/g, '')
    return clientesFiltrados
      .filter((c) => {
        if (normalizar(c.nombre).includes(q)) return true
        // El match por teléfono sólo corre si lo tipeado TIENE dígitos: con un
        // nombre, `digitos` queda vacío y `tel.includes('')` daba true siempre,
        // devolviendo todos los clientes con teléfono cargado.
        if (!digitos) return false
        return (c.telefono ?? '').replace(/\D/g, '').includes(digitos)
      })
      .slice(0, 8)
  }, [cliInput, clientesFiltrados])

  function seleccionarCliente(id: string, nombre: string) {
    setIdCliente(id)
    setCliInput(id ? nombre : '')
    setCliOpen(false)
  }

  function onCliKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!cliOpen) return
    // Total de opciones = mostrador + sugerencias.
    const totalOpts = 1 + cliSugerencias.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCliResaltado((i) => Math.min(totalOpts - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCliResaltado((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (cliResaltado === 0) seleccionarCliente('', '')
      else {
        const c = cliSugerencias[cliResaltado - 1]
        if (c) seleccionarCliente(c.id, c.nombre)
      }
    } else if (e.key === 'Escape') {
      setCliOpen(false)
    }
  }

  const puedeConfirmar = lineas.length > 0 && !pending

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      {/* Carrito */}
      <section className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <form onSubmit={agregarLinea}>
            <Field
              htmlFor="qr-input"
              label="Escanear, tipear código o buscar por nombre"
              error={errorBusqueda ?? undefined}
              hint="QR, SKU (ej: REM-0007-M) o nombre del producto. Enter para agregar."
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="qr-input"
                    autoFocus
                    value={qrInput}
                    onChange={(e) => {
                      setQrInput(e.target.value)
                      setSugerenciasOpen(true)
                      setResaltado(0)
                      // Un selector abierto para "agregar" ya no aplica si
                      // cambió lo tipeado; el de cambio de talle sí sobrevive.
                      setSelectorTalle((s) => (s?.grupoKey ? s : null))
                    }}
                    onFocus={() => setSugerenciasOpen(true)}
                    onBlur={() => setTimeout(() => setSugerenciasOpen(false), 120)}
                    onKeyDown={onBuscadorKeyDown}
                    placeholder="QR, SKU o nombre"
                    invalid={!!errorBusqueda}
                    disabled={buscando}
                    role="combobox"
                    aria-expanded={sugerenciasOpen && sugerencias.length > 0}
                    aria-autocomplete="list"
                  />
                  {sugerenciasOpen && sugerencias.length > 0 && (
                    <ul
                      role="listbox"
                      className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card-2 shadow"
                    >
                      {sugerencias.map((p, i) => {
                        const activo = i === Math.min(resaltado, sugerencias.length - 1)
                        return (
                          <li
                            key={p.id_producto}
                            role="option"
                            aria-selected={activo}
                            // onMouseDown para seleccionar antes del blur del input.
                            onMouseDown={(e) => {
                              e.preventDefault()
                              elegirSugerencia(p)
                            }}
                            onMouseEnter={() => setResaltado(i)}
                            className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                              activo ? 'bg-pink-bg text-text' : 'text-text'
                            }`}
                          >
                            <span>{p.nombre}</span>
                            <span className="shrink-0 font-mono text-xs text-muted">
                              {p.stock_disponible} u.
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                <Button type="submit" disabled={buscando || !qrInput.trim()}>
                  {buscando ? 'Buscando…' : 'Agregar'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCamaraOpen((v) => !v)}
                >
                  {camaraOpen ? 'Cerrar' : '📷 Cámara'}
                </Button>
              </div>
            </Field>
          </form>

          {selectorTalle && (
            <div className="rounded-md border border-border bg-card-2 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <span className="text-muted">
                    {selectorTalle.grupoKey ? 'Cambiar talle de' : 'Elegí el talle de'}{' '}
                  </span>
                  <b>{selectorTalle.productoNombre}</b>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectorTalle(null)}
                >
                  Cancelar
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectorTalle.opciones.map((o) => (
                  <Button
                    key={o.talle}
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={buscando}
                    onClick={() => elegirTalle(o.talle)}
                  >
                    {o.talle} · {o.disponibles} u.
                  </Button>
                ))}
                {/* Las "sin talle" son unidades que quedaron sin cargar el
                    talle a propósito (o por olvido). Se pueden vender igual —
                    el vendedor decide, no el sistema. */}
                {selectorTalle.sinTalle > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={buscando}
                    onClick={() => elegirTalle(null)}
                    title="Unidades sin talle asignado"
                  >
                    Sin talle · {selectorTalle.sinTalle} u.
                  </Button>
                )}
              </div>
            </div>
          )}

          {camaraOpen && (
            <div className="mx-auto max-w-xs">
              <QrScanner
                onDetected={(text) => void agregarPorCodigo(text)}
                onClose={() => setCamaraOpen(false)}
              />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Escaneá el primer ítem para empezar la venta.
                  </td>
                </tr>
              ) : (
                grupos.map((g) => (
                  <tr key={g.key} className="border-b border-border-2">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{g.producto_nombre}</span>
                        <span className="rounded-full border border-border bg-card-2 px-2 py-0.5 text-xs font-medium">
                          {g.talle ? `Talle ${g.talle}` : 'Sin talle'}
                        </span>
                        <button
                          type="button"
                          onClick={() => void abrirCambioTalle(g)}
                          disabled={buscando}
                          className="text-xs text-pink-strong hover:underline disabled:opacity-50"
                        >
                          Cambiar
                        </button>
                      </div>
                      <div className="text-xs text-muted">
                        {g.sku ?? '—'} · {g.categoria_nombre ?? '—'}
                      </div>
                      {g.advertencia && (
                        <div className="mt-1 text-xs text-terracota">{g.advertencia}</div>
                      )}
                      {g.desactualizado && (
                        <Badge variant="warning">Precio desactualizado</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {g.precio_final != null
                        ? `$ ${g.precio_final.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CantidadGrupo
                        grupo={g}
                        onCommit={(n) => void setCantidadGrupo(g, n)}
                        disabled={buscando}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      $ {g.subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => quitarGrupo(g)}
                      >
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-card-2">
                <td colSpan={3} className="px-4 py-3 font-semibold">
                  Total ({lineas.length} ítem{lineas.length === 1 ? '' : 's'})
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  $ {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Panel lateral */}
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <Field htmlFor="v-fp" label="Forma de pago" required>
            <select
              id="v-fp"
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value as FormaPago)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              {(['efectivo', 'cuotas_2', 'cuotas_3'] as FormaPago[]).map((fp) => (
                <option key={fp} value={fp}>
                  {FORMA_PAGO_LABEL[fp]}
                </option>
              ))}
            </select>
          </Field>

          <Field htmlFor="v-reserva" label="Reserva (opcional)" hint="Cargar ítems de una reserva activa">
            <select
              id="v-reserva"
              value={idReserva}
              onChange={(e) => setIdReserva(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
            >
              <option value="">— Ninguna —</option>
              {reservasActivas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.cliente_nombre ?? 'Mostrador'} · {r.items_count} ítems
                  {' '}({new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')})
                </option>
              ))}
            </select>
          </Field>

          <Field
            htmlFor="v-cli"
            label="Cliente (opcional)"
            hint="Buscá por nombre o teléfono. Vacío = Mostrador."
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="v-cli"
                  value={cliInput}
                  placeholder="— Mostrador —"
                  onChange={(e) => {
                    setCliInput(e.target.value)
                    setCliOpen(true)
                    setCliResaltado(0)
                    // Cambiar el texto invalida la selección anterior; se vuelve
                    // a Mostrador hasta que el usuario elija de la lista.
                    if (idCliente) setIdCliente('')
                  }}
                  onFocus={() => {
                    setCliOpen(true)
                    setCliResaltado(0)
                  }}
                  onBlur={() => setTimeout(() => setCliOpen(false), 120)}
                  onKeyDown={onCliKeyDown}
                  role="combobox"
                  aria-expanded={cliOpen}
                  aria-autocomplete="list"
                  autoComplete="off"
                />
                {cliOpen && (
                  <ul
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card-2 shadow"
                  >
                    <li
                      role="option"
                      aria-selected={cliResaltado === 0}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        seleccionarCliente('', '')
                      }}
                      onMouseEnter={() => setCliResaltado(0)}
                      className={`cursor-pointer px-3 py-2 text-sm italic ${
                        cliResaltado === 0 ? 'bg-pink-bg text-text' : 'text-muted'
                      }`}
                    >
                      — Mostrador —
                    </li>
                    {cliSugerencias.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted">
                        Sin coincidencias
                      </li>
                    ) : (
                      cliSugerencias.map((c, i) => {
                        const idx = i + 1 // +1 por el Mostrador
                        const activo = idx === cliResaltado
                        return (
                          <li
                            key={c.id}
                            role="option"
                            aria-selected={activo}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              seleccionarCliente(c.id, c.nombre)
                            }}
                            onMouseEnter={() => setCliResaltado(idx)}
                            className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                              activo ? 'bg-pink-bg text-text' : 'text-text'
                            }`}
                          >
                            <span>{c.nombre}</span>
                            {c.telefono && (
                              <span className="shrink-0 font-mono text-xs text-muted">
                                {c.telefono}
                              </span>
                            )}
                          </li>
                        )
                      })
                    )}
                  </ul>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setCreandoCliente((v) => !v)
                  setErrorCliente(null)
                }}
                aria-expanded={creandoCliente}
              >
                {creandoCliente ? 'Cerrar' : '+ Nuevo'}
              </Button>
            </div>
          </Field>

          {creandoCliente && (
            <div className="rounded-md border border-border bg-card-2 p-3 space-y-3">
              <Field htmlFor="v-nc-nombre" label="Nombre" required error={errorCliente ?? undefined}>
                <Input
                  id="v-nc-nombre"
                  autoFocus
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Nombre y apellido"
                  invalid={!!errorCliente}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      crearCliente()
                    }
                  }}
                />
              </Field>
              <Field htmlFor="v-nc-tel" label="Teléfono" hint="Se usa para link WhatsApp">
                <Input
                  id="v-nc-tel"
                  value={nuevoTelefono}
                  onChange={(e) => setNuevoTelefono(e.target.value)}
                  placeholder="+54 9 11 ..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      crearCliente()
                    }
                  }}
                />
              </Field>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={crearCliente}
                disabled={guardandoCliente || nuevoNombre.trim().length < 2}
              >
                {guardandoCliente ? 'Creando…' : 'Crear y seleccionar'}
              </Button>
            </div>
          )}

          <Field htmlFor="v-obs" label="Observaciones">
            <Textarea
              id="v-obs"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
          El precio final se resuelve en el server aplicando la cascada
          de reglas (descuentos + recargo por forma de pago). Al confirmar,
          se verifica de nuevo estado del ítem y reserva.
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={() => setConfirmarOpen(true)}
          disabled={!puedeConfirmar}
        >
          {pending ? 'Registrando…' : `Confirmar venta · $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
        </Button>
      </aside>

      <ConfirmDialog
        open={confirmarOpen}
        title="Confirmar venta"
        description={`Se van a marcar ${lineas.length} ítem(s) como vendidos por un total de $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}. Esta acción no se puede deshacer sin anular la venta.`}
        confirmLabel="Sí, confirmar"
        cancelLabel="Cancelar"
        onConfirm={confirmar}
        onCancel={() => setConfirmarOpen(false)}
      />
    </div>
  )
}

/**
 * NumberInput con commit debounced. Sirve para dos casos con un mismo control:
 *   - Flechas: N clicks rápidos = un solo cambio efectivo (evita N round-trips
 *     encolados y la race entre state y refetches).
 *   - Tipeo: el commit espera a que el usuario deje de tipear.
 * El blur o Enter fuerzan el commit inmediato.
 */
function CantidadGrupo({
  grupo,
  onCommit,
  disabled,
}: {
  grupo: Grupo
  onCommit: (nueva: number) => void
  disabled: boolean
}) {
  const [val, setVal] = useState<number>(grupo.cantidad)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // El carrito es la fuente de verdad: si la cantidad real cambió (commit
  // aplicado, o el server no pudo dar todas las unidades pedidas), el input
  // se realinea. Patrón "ajustar estado durante el render", no un efecto.
  const [cantidadVista, setCantidadVista] = useState(grupo.cantidad)
  if (cantidadVista !== grupo.cantidad) {
    setCantidadVista(grupo.cantidad)
    setVal(grupo.cantidad)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function schedule(nueva: number) {
    setVal(nueva)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onCommit(nueva), 250)
  }

  function commitNow(nueva: number) {
    if (timer.current) clearTimeout(timer.current)
    if (nueva !== grupo.cantidad) onCommit(nueva)
  }

  return (
    <NumberInput
      min={0}
      value={val}
      disabled={disabled}
      onChange={(e) => schedule(Number(e.target.value || 0))}
      onBlur={() => commitNow(val)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitNow(val)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      aria-label="Cantidad"
      className="w-16 text-right"
    />
  )
}

function traducirReason(reason: string, extra?: Record<string, unknown>): string {
  if (reason.startsWith('item-not-found')) return 'No se encontró un ítem con ese QR en este tenant.'
  if (reason.startsWith('item-no-disponible')) {
    const est = extra?.estado ? ` (estado: ${extra.estado})` : ''
    return `El ítem no está disponible${est}.`
  }
  if (reason.startsWith('item-en-reserva')) return 'El ítem está reservado por otra reserva. Cargá esa reserva o cancelala primero.'
  if (reason.startsWith('item-en-otra-reserva')) return 'El ítem pertenece a otra reserva distinta a la que cargaste.'
  if (reason.startsWith('item-ya-reservado')) return 'El ítem ya está en una reserva activa.'
  if (reason === 'sku-sin-stock') return 'Ese SKU no tiene unidades disponibles en stock.'
  if (reason === 'sku-sin-stock-libre') return 'No quedan unidades libres: están reservadas o ya las cargaste en el carrito.'
  if (reason === 'sin-precio-lista') return 'El producto no tiene precio de venta. Fijalo en Precios → Control de precios.'
  if (reason === 'reserva-no-activa') return 'La reserva ya no está activa (fue cancelada, vencida o convertida).'
  if (reason === 'lineas-vacias') return 'Agregá al menos un ítem al carrito.'
  if (reason === 'elegir-talle') return 'Elegí un talle disponible.'
  return reason
}
