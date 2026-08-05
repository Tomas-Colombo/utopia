'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { QrScanner } from '@/components/inventario/QrScanner'
import {
  SIN_TALLE_KEY,
  SelectorTalleMulti,
  type SelectorTalle,
  type TalleOpcion,
} from '@/components/ventas/SelectorTalleMulti'
import {
  buscarMatchNombre,
  indexarPorNombre,
  normalizar,
} from '@/lib/inventario/producto-match'
import {
  FORMA_PAGO_LABEL,
  type DescuentoDisponible,
  type DesgloseVenta,
  type FormaPago,
} from '@/lib/types/precios'
import type { ProductoConDetalle } from '@/lib/types/inventario'
import type {
  CuentaDestinoRow,
  LineaCarrito,
  ReservaDeProducto,
} from '@/lib/types/ventas'
import {
  CobranzaPanel,
  cobranzaCuadra,
  normalizarPagos,
  nuevoPago,
  type PagoBorrador,
} from './CobranzaPanel'
import { registrarVentaAction, crearClienteAction } from '../actions'

interface ClienteOption { id: string; nombre: string; telefono: string | null }
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
  /** Desglose del prototipo del grupo (todas las unidades comparten precio). */
  desglose: DesgloseVenta
  qrs: string[]
  cantidad: number
  subtotal: number
}
/** Set vacío estable — evita recrear uno por render en las filas sin selección. */
const EMPTY_SET: Set<string> = new Set()
interface ReservaOption {
  id: string
  fecha: string
  fecha_vencimiento: string
  cliente_nombre: string | null
  items_count: number
}

/**
 * Venta que arranca desde una reserva (acceso directo desde /ventas/reservas).
 * Los ítems viajan como QR: el precio se resuelve con el lookup normal, no con
 * el snapshot de la reserva, que puede haber quedado viejo.
 */
export interface PrecargaReserva {
  idReserva: string
  idCliente: string | null
  clienteNombre: string | null
  observaciones: string | null
  qrs: string[]
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
  reservasPorProducto,
  cuentas,
  precargaReserva,
}: {
  clientes: ClienteOption[]
  reservasActivas: ReservaOption[]
  productos: ProductoConDetalle[]
  /** Reservas activas que bloquean unidades, indexadas por id_producto. */
  reservasPorProducto: Record<string, ReservaDeProducto[]>
  cuentas: CuentaDestinoRow[]
  precargaReserva: PrecargaReserva | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()

  const [clientes, setClientes] = useState<ClienteOption[]>(clientesIniciales)
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo')
  const [idCliente, setIdCliente] = useState<string>(precargaReserva?.idCliente ?? '')

  // Alta rápida de cliente en línea
  const [creandoCliente, setCreandoCliente] = useState(false)
  const [guardandoCliente, startCliente] = useTransition()
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTelefono, setNuevoTelefono] = useState('')
  const [errorCliente, setErrorCliente] = useState<string | null>(null)
  // La venta se ata a UNA reserva. Vacío = venta suelta, y en ese caso el
  // campo ni se muestra: aparece recién cuando se carga un ítem reservado.
  const [idReserva, setIdReserva] = useState<string>(precargaReserva?.idReserva ?? '')
  const [observaciones, setObservaciones] = useState(precargaReserva?.observaciones ?? '')

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
  /**
   * Sugerencias por nombre Y por SKU, rankeadas: primero el SKU exacto, después
   * lo que empieza con lo tipeado, y al final las coincidencias en el medio.
   * Así tipear un SKU deja el producto correcto arriba de todo.
   *
   * No hay riesgo de que un QR escaneado matchee acá: el QR son 24 chars hex
   * (`gen_random_bytes(12)`), más largo que cualquier SKU, y el test es
   * "el SKU/nombre contiene lo tipeado" — nunca al revés.
   */
  const sugerencias = useMemo(() => {
    const q = normalizar(qrInput)
    if (!q) return []
    const puntaje = (p: ProductoConDetalle): number => {
      const sku = normalizar(p.sku ?? '')
      const nombre = normalizar(p.nombre)
      if (sku && sku === q) return 0
      if (sku && sku.startsWith(q)) return 1
      if (nombre.startsWith(q)) return 2
      if (sku && sku.includes(q)) return 3
      if (nombre.includes(q)) return 4
      return Number.POSITIVE_INFINITY
    }
    return productos
      .map((p) => ({ p, s: puntaje(p) }))
      .filter((x) => Number.isFinite(x.s))
      .sort((a, b) => a.s - b.s || a.p.nombre.localeCompare(b.p.nombre))
      .slice(0, 8)
      .map((x) => x.p)
  }, [productos, qrInput])

  // Combobox de cliente: mismo patrón que el buscador de productos. `cliInput`
  // guarda lo tipeado (o el nombre del cliente seleccionado en modo readonly).
  // Mostrador = idCliente vacío. Buscamos por nombre y por teléfono normalizados.
  const [cliInput, setCliInput] = useState(precargaReserva?.clienteNombre ?? '')
  const [cliOpen, setCliOpen] = useState(false)
  const [cliResaltado, setCliResaltado] = useState(0)

  const [lineas, setLineas] = useState<LineaCarrito[]>([])
  // Paso 2 del flujo: el cobro vive en un modal, no en la misma pantalla que
  // el carrito. Recién ahí aparece el botón de confirmar la venta.
  const [cobranzaOpen, setCobranzaOpen] = useState(false)

  // Cobranza: cómo se reparte el cobro entre cuentas. Arranca con un pago
  // único, que siempre vale el total (ver normalizarPagos).
  const [pagos, setPagos] = useState<PagoBorrador[]>(() => [nuevoPago(cuentas, 0)])

  // Tope físico de unidades por grupo (producto+talle). Evita que el vendedor
  // suba la cantidad de una fila más allá del stock real. Clave = grupo.key.
  const [stockPorGrupo, setStockPorGrupo] = useState<Record<string, number>>({})

  // Descuentos. Ninguno se aplica solo: el vendedor los elige.
  //   - `descuentosDisponibles`: catálogo aplicable a los productos del carrito
  //     (una fila por producto+descuento), refrescado cuando cambia el carrito.
  //   - `descuentosPanel`: ids de descuentos global/categoría/proveedor tildados
  //     en el panel lateral (aplican a toda la venta según su alcance).
  //   - `descuentosProducto`: ids de descuentos de alcance=producto tildados en
  //     la fila, indexado por id_producto.
  const [descuentosDisponibles, setDescuentosDisponibles] = useState<DescuentoDisponible[]>([])
  const [descuentosPanel, setDescuentosPanel] = useState<Set<string>>(new Set())
  const [descuentosProducto, setDescuentosProducto] = useState<Record<string, Set<string>>>({})

  // La unión de TODO lo elegido. Se manda entera a cada lookup y al registrar:
  // el server valida cada id contra el producto e ignora los que no aplican.
  const descuentosUnion = useMemo(() => {
    const s = new Set<string>(descuentosPanel)
    for (const set of Object.values(descuentosProducto)) for (const id of set) s.add(id)
    return [...s].sort()
  }, [descuentosPanel, descuentosProducto])
  const descuentosKey = descuentosUnion.join(',')

  // Descuentos de alcance=producto, agrupados por producto (para la fila).
  const descProducto = useMemo(() => {
    const m = new Map<string, DescuentoDisponible[]>()
    for (const d of descuentosDisponibles) {
      if (d.alcance !== 'producto') continue
      const arr = m.get(d.id_producto) ?? []
      arr.push(d)
      m.set(d.id_producto, arr)
    }
    return m
  }, [descuentosDisponibles])

  // Descuentos global/categoría/proveedor, distintos por regla (para el panel).
  // `productos` = qué productos del carrito cubre cada uno (para visualizar).
  const descPanel = useMemo(() => {
    const m = new Map<string, { d: DescuentoDisponible; productos: Set<string> }>()
    for (const d of descuentosDisponibles) {
      if (d.alcance === 'producto') continue
      const e = m.get(d.id_regla)
      if (e) e.productos.add(d.id_producto)
      else m.set(d.id_regla, { d, productos: new Set([d.id_producto]) })
    }
    return [...m.values()]
  }, [descuentosDisponibles])

  // Cuando cambia forma_pago, reserva o la selección de descuentos ⇒
  // recalculo precios de cada línea. Se manda la unión de descuentos; el
  // server decide cuáles aplican a cada producto.
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
            }${descuentosKey ? `&descuentos=${encodeURIComponent(descuentosKey)}` : ''}`,
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
  }, [formaPago, idReserva, descuentosKey])

  // Descuentos disponibles para los productos del carrito. Se refresca cuando
  // cambia el SET de productos (no en cada unidad): agregar otra unidad del
  // mismo producto no toca la lista.
  const productosEnCarrito = useMemo(
    () => [...new Set(lineas.map((l) => l.id_producto))].sort().join(','),
    [lineas],
  )
  const productosEnCarritoCount = productosEnCarrito ? productosEnCarrito.split(',').length : 0
  useEffect(() => {
    if (!productosEnCarrito) {
      setDescuentosDisponibles([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(
          `/api/ventas/descuentos-disponibles?productos=${encodeURIComponent(productosEnCarrito)}`,
        )
        const data = await r.json()
        if (!cancelled && data.ok) {
          setDescuentosDisponibles(data.descuentos as DescuentoDisponible[])
        }
      } catch {
        /* si falla, no ofrecemos descuentos — la venta sigue a precio de lista */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [productosEnCarrito])

  // Tope de unidades por producto+talle. Se refresca con el SET de productos
  // y con la reserva (cambia qué unidades reservadas cuentan como libres). No
  // depende de la cantidad del carrito: el tope es el stock físico, que no
  // cambia por cargar/descargar (los ítems del carrito siguen 'disponible').
  useEffect(() => {
    if (!productosEnCarrito) {
      setStockPorGrupo({})
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(
          `/api/ventas/stock-disponible?productos=${encodeURIComponent(productosEnCarrito)}${
            idReserva ? `&id_reserva=${encodeURIComponent(idReserva)}` : ''
          }`,
        )
        const data = await r.json()
        if (!cancelled && data.ok) {
          const m: Record<string, number> = {}
          for (const s of data.stock as Array<{
            id_producto: string
            talle: string | null
            disponibles: number
          }>) {
            m[`${s.id_producto}|${s.talle ?? '__nula__'}`] = s.disponibles
          }
          setStockPorGrupo(m)
        }
      } catch {
        /* si falla, no topeamos — el server igual rebota si falta stock */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [productosEnCarrito, idReserva])

  const total = useMemo(
    () => lineas.reduce((a, l) => a + (l.precio_final ?? 0), 0),
    [lineas],
  )

  // ── Reservas ───────────────────────────────────────────────────────
  // Reservar NO cambia el estado del ítem: la unidad sigue 'disponible' y por
  // eso aparece en el catálogo. El bloqueo vive en `detalle_reserva`, así que
  // acá se cruza a mano para poder mostrarlo y para saber a qué reserva
  // engancharse si el vendedor carga ese producto igual.

  /** Unidades del producto tomadas por reservas ajenas a la venta actual. */
  function reservadasDe(idProducto: string): number {
    return (reservasPorProducto[idProducto] ?? [])
      .filter((r) => r.id_reserva !== idReserva)
      .reduce((a, r) => a + r.unidades, 0)
  }

  /**
   * Reserva que esta venta puede adoptar por ese producto. Sólo cuando hay UNA:
   * con dos reservas en juego no se puede adivinar cuál viene a buscar el
   * cliente, y una venta se ata a una sola reserva.
   */
  function reservaAdoptableDe(idProducto: string): ReservaDeProducto | null {
    const rs = (reservasPorProducto[idProducto] ?? []).filter(
      (r) => r.id_reserva !== idReserva,
    )
    return rs.length === 1 ? rs[0] : null
  }

  /** Etiqueta corta de una reserva por id (para carteles). */
  function labelReserva(rid: string): string {
    const r = reservasActivas.find((x) => x.id === rid)
    if (!r) return 'reserva'
    const vence = new Date(r.fecha_vencimiento).toLocaleDateString('es-AR')
    return `${r.cliente_nombre ?? 'Mostrador'} · vence ${vence}`
  }

  const reservaActual = idReserva
    ? reservasActivas.find((r) => r.id === idReserva) ?? null
    : null

  /**
   * Suelta la reserva y vacía el carrito. Los ítems cargados podían estar ahí
   * SÓLO gracias a esa reserva; dejarlos daría un carrito que el server rebota
   * recién al confirmar.
   */
  function desvincularReserva() {
    setIdReserva('')
    setLineas([])
    setErrorBusqueda(null)
  }

  // Precarga desde una reserva (acceso directo desde /ventas/reservas). Corre
  // una sola vez y resuelve el precio con el lookup normal: el snapshot que
  // guardó la reserva puede haber quedado viejo.
  const precargaHecha = useRef(false)
  useEffect(() => {
    const p = precargaReserva
    if (!p || precargaHecha.current) return
    precargaHecha.current = true
    if (p.qrs.length === 0) return
    ;(async () => {
      setBuscando(true)
      const cargadas: LineaCarrito[] = []
      let fallos = 0
      for (const qr of p.qrs) {
        try {
          const r = await fetch(
            lookupUrl({ code: qr }, cargadas.map((l) => l.id_item), p.idReserva),
          )
          const data = await r.json()
          if (data.ok) cargadas.push(data.linea as LineaCarrito)
          else fallos++
        } catch {
          fallos++
        }
      }
      setLineas(cargadas)
      setBuscando(false)
      if (fallos > 0) {
        setErrorBusqueda(
          `${fallos} ítem(s) de la reserva no se pudieron cargar (vendidos, dados de baja o sin precio de venta).`,
        )
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          desglose: l.desglose,
          qrs: [l.qr_code],
          cantidad: 1,
          subtotal: l.precio_final ?? 0,
        })
      }
    }
    return [...map.values()]
  }, [lineas])

  // Descuentos aplicados en TODO el carrito, agregados por regla (nombre +
  // impacto total = monto por unidad × cantidad del grupo). Alimenta el
  // resumen arriba del Total.
  const resumenDescuentos = useMemo(() => {
    const m = new Map<string, { nombre: string; alcance: string; total: number }>()
    for (const g of grupos) {
      for (const d of g.desglose.descuentos) {
        const add = d.monto * g.cantidad
        const e = m.get(d.id_regla)
        if (e) e.total += add
        else m.set(d.id_regla, { nombre: d.nombre, alcance: d.alcance, total: add })
      }
    }
    return [...m.values()]
  }, [grupos])
  const totalDescuentos = useMemo(
    () => resumenDescuentos.reduce((a, r) => a + r.total, 0),
    [resumenDescuentos],
  )

  // Subtotal a precio de lista (antes de descuentos y recargo) y recargo total
  // por forma de pago. El recargo ya está dentro de precio_final; acá lo
  // extraemos del desglose sólo para mostrarlo desagregado en el resumen.
  const subtotalLista = useMemo(
    () => grupos.reduce((a, g) => a + (g.precio_lista ?? 0) * g.cantidad, 0),
    [grupos],
  )
  const totalRecargo = useMemo(
    () =>
      grupos.reduce(
        (a, g) => a + (g.desglose.recargo_forma_pago?.monto ?? 0) * g.cantidad,
        0,
      ),
    [grupos],
  )

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
  // `reservaOverride` existe porque `setIdReserva` no impacta hasta el próximo
  // render: cuando la venta adopta una reserva en el mismo tick en que carga
  // el ítem, hay que mandarla explícita o el server la rebota por reservada.
  function lookupUrl(
    query: Record<string, string | null | undefined>,
    excluir: string[] = [],
    reservaOverride?: string | null,
  ): string {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v)
    qs.set('forma_pago', formaPago)
    const rid = reservaOverride ?? idReserva
    if (rid) qs.set('id_reserva', rid)
    if (excluir.length > 0) qs.set('excluir', excluir.join(','))
    // Descuentos elegidos: se mandan todos; el server filtra por producto.
    if (descuentosKey) qs.set('descuentos', descuentosKey)
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
      let data = await (await fetch(lookupUrl({ code: codigo }, itemsEnCarrito()))).json()

      // El ítem escaneado está reservado y la venta todavía no está atada a
      // ninguna reserva: es el caso "vengo a buscar lo que reservé". Se adopta
      // esa reserva y se reintenta, en vez de mandarlo a buscarla a mano.
      const rid: string | null = !idReserva ? data.id_reserva ?? null : null
      if (!data.ok && rid && esReasonDeReserva(data.reason)) {
        setIdReserva(rid)
        data = await (await fetch(lookupUrl({ code: codigo }, itemsEnCarrito(), rid))).json()
      }

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
    excluirBase?: string[],
    reservaOverride?: string | null,
  ): Promise<LineaCarrito | null> {
    if (!idProducto || buscando) return null
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      const base = excluirBase ?? itemsEnCarrito()
      const query = {
        id_producto: idProducto,
        talle: talle ?? undefined,
        sin_talle: talle === null ? '1' : undefined,
      }
      const excluir = [...base, ...extraExcluidos]
      let data = await (
        await fetch(lookupUrl(query, excluir, reservaOverride))
      ).json()

      // Todas las unidades están tomadas por una reserva y la venta todavía no
      // está atada a ninguna: la adopta y reintenta. Es el flujo "el cliente
      // vino a buscar lo que había reservado".
      const puedeAdoptar = !reservaOverride && !idReserva
      if (!data.ok && puedeAdoptar && data.id_reserva && esReasonDeReserva(data.reason)) {
        const rid = data.id_reserva as string
        setIdReserva(rid)
        data = await (await fetch(lookupUrl(query, excluir, rid))).json()
      }

      if (!data.ok) {
        if (data.reason === 'elegir-talle') {
          // Las unidades reservadas se ofrecen sólo si hay UNA reserva en
          // juego y la venta todavía puede adoptarla.
          const adoptable = puedeAdoptar ? (data.id_reserva as string | null) : null
          setSelectorTalle({
            idProducto,
            productoNombre: nombreDeProducto(idProducto),
            grupoKey: null,
            opciones: data.talles as TalleOpcion[],
            sinTalle: Number(data.sin_talle ?? 0),
            sinTalleReservados: Number(data.sin_talle_reservados ?? 0),
            idReservaAdoptable: adoptable,
            reservaLabel: adoptable ? labelReserva(adoptable) : null,
            cantidades: {},
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

  // Abre el selector para un grupo ya cargado. Se excluyen los ítems del
  // resto del carrito y también los del propio grupo (van a ser devueltos
  // apenas el vendedor confirme la nueva distribución). Sumamos la cantidad
  // actual del grupo a la disponibilidad de su talle, así el vendedor puede
  // "reusarla" en la nueva mezcla. Si el producto no maneja talles no hay
  // nada que elegir.
  async function abrirCambioTalle(g: Grupo) {
    if (buscando) return
    setBuscando(true)
    setErrorBusqueda(null)
    try {
      // Excluyo el resto del carrito pero NO las unidades del propio grupo:
      // así el disponible que vuelve el server ya incluye lo que el vendedor
      // tenía cargado y puede reasignarlo libremente en la nueva mezcla.
      const excluir = lineas
        .filter((l) => !g.qrs.includes(l.qr_code))
        .map((l) => l.id_item)
      const r = await fetch(lookupUrl({ id_producto: g.id_producto }, excluir))
      const data = await r.json()
      if (data.reason !== 'elegir-talle') {
        setErrorBusqueda(
          data.ok
            ? 'Este producto no maneja talles.'
            : traducirReason(data.reason, data),
        )
        return
      }
      const adoptable = idReserva ? null : (data.id_reserva as string | null)
      setSelectorTalle({
        idProducto: g.id_producto,
        productoNombre: g.producto_nombre,
        grupoKey: g.key,
        opciones: data.talles as TalleOpcion[],
        sinTalle: Number(data.sin_talle ?? 0),
        sinTalleReservados: Number(data.sin_talle_reservados ?? 0),
        idReservaAdoptable: adoptable,
        reservaLabel: adoptable ? labelReserva(adoptable) : null,
        cantidades: {
          [g.talle ?? SIN_TALLE_KEY]: g.cantidad,
        },
      })
    } catch (e) {
      setErrorBusqueda((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  // Confirma la distribución de talles elegida en el selector. En "agregar"
  // pide N unidades por cada talle > 0 encadenando exclusiones. En "cambiar"
  // primero quita el grupo actual y después dispara el mismo flujo.
  async function confirmarSelectorTalle() {
    if (!selectorTalle) return
    const pedidos: Array<{ talle: string | null; cant: number }> = []
    for (const [k, v] of Object.entries(selectorTalle.cantidades)) {
      if (v > 0) pedidos.push({ talle: k === SIN_TALLE_KEY ? null : k, cant: v })
    }
    if (pedidos.length === 0) {
      setSelectorTalle(null)
      return
    }
    const grupoDeCambio = selectorTalle.grupoKey
      ? grupos.find((x) => x.key === selectorTalle.grupoKey) ?? null
      : null
    // Base de exclusión "pura" (sin los ítems del grupo que se está
    // reestructurando) — no depende del state async de React.
    const qrsGrupo = new Set(grupoDeCambio?.qrs ?? [])
    const excluirBase = lineas
      .filter((l) => !qrsGrupo.has(l.qr_code))
      .map((l) => l.id_item)
    if (grupoDeCambio) {
      setLineas((ls) => ls.filter((l) => !qrsGrupo.has(l.qr_code)))
    }
    const idProducto = selectorTalle.idProducto
    // Si el vendedor pidió más unidades de las libres en algún talle, está
    // tomando unidades reservadas: la venta adopta esa reserva ANTES de pedir
    // nada, o el server rebota cada unidad por reservada.
    const libresDe = (talle: string | null): number =>
      talle === null
        ? selectorTalle.sinTalle
        : selectorTalle.opciones.find((o) => o.talle === talle)?.disponibles ?? 0
    const tomaReservadas = pedidos.some((p) => p.cant > libresDe(p.talle))
    const reservaAdoptada =
      tomaReservadas && selectorTalle.idReservaAdoptable
        ? selectorTalle.idReservaAdoptable
        : null
    if (reservaAdoptada) setIdReserva(reservaAdoptada)

    setSelectorTalle(null)
    const running: string[] = []
    for (const p of pedidos) {
      for (let i = 0; i < p.cant; i++) {
        const linea = await agregarPorProducto(
          idProducto,
          p.talle,
          running,
          excluirBase,
          reservaAdoptada,
        )
        if (!linea) return
        running.push(linea.id_item)
      }
    }
  }

  // Ajusta la cantidad de UN talle dentro del selector (sin llamar al server).
  function setCantidadTalle(key: string, nueva: number, max: number) {
    setSelectorTalle((s) => {
      if (!s) return s
      const n = Math.max(0, Math.min(max, Math.floor(nueva || 0)))
      return { ...s, cantidades: { ...s.cantidades, [key]: n } }
    })
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

  // Toggle de un descuento del panel (global/categoría/proveedor).
  function togglePanel(idRegla: string) {
    setDescuentosPanel((s) => {
      const n = new Set(s)
      if (n.has(idRegla)) n.delete(idRegla)
      else n.add(idRegla)
      return n
    })
  }

  // Toggle de un descuento de alcance=producto para ESE producto.
  function toggleProducto(idProducto: string, idRegla: string) {
    setDescuentosProducto((m) => {
      const cur = new Set(m[idProducto] ?? [])
      if (cur.has(idRegla)) cur.delete(idRegla)
      else cur.add(idRegla)
      return { ...m, [idProducto]: cur }
    })
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
    setCobranzaOpen(false)
    start(async () => {
      const res = await registrarVentaAction({
        // Se manda la unión de descuentos por línea; el server valida cada
        // uno contra el producto de esa línea y descarta los que no aplican.
        lineas: lineas.map((l) => ({ id_item: l.id_item, descuentos: descuentosUnion })),
        formaPago,
        idCliente: idCliente || null,
        idReserva: idReserva || null,
        observaciones: observaciones || null,
        pagos: pagosNormalizados.map((p) => {
          const recibido = Number(p.recibido.replace(',', '.'))
          return {
            medio: p.medio,
            id_cuenta_destino: p.idCuenta,
            monto: p.monto,
            // El vuelto lo calcula la DB a partir de esto; sólo se manda si
            // el vendedor lo cargó y es coherente.
            monto_recibido:
              p.medio === 'efectivo' && Number.isFinite(recibido) && recibido >= p.monto
                ? recibido
                : null,
            referencia: p.referencia.trim() || null,
          }
        }),
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

  // La cobranza tiene que cerrar contra el total ANTES de mandar: el SP la
  // rechaza igual, pero avisar acá es más barato que un error después de
  // haber tocado stock.
  const pagosNormalizados = normalizarPagos(pagos, total, cuentas)
  const cobranzaOk =
    cuentas.length > 0 &&
    pagosNormalizados.every((p) => p.idCuenta) &&
    cobranzaCuadra(pagosNormalizados, total)
  const puedeConfirmar = lineas.length > 0 && !pending && cobranzaOk

  return (
    <div className="space-y-5">
      {/* Paso 1 — carrito: buscador + tabla de ítems */}
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
                        // El stock del catálogo cuenta las unidades reservadas
                        // como libres (reservar no cambia el estado del ítem).
                        // Acá se separan para que el vendedor vea la verdad.
                        const reservadas = reservadasDe(p.id_producto)
                        const libres = Math.max(0, p.stock_disponible - reservadas)
                        const quien = reservaAdoptableDe(p.id_producto)?.cliente_nombre
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
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span className="truncate">{p.nombre}</span>
                              {p.sku && (
                                <span className="shrink-0 font-mono text-[11px] text-muted">
                                  {p.sku}
                                </span>
                              )}
                              {reservadas > 0 && (
                                <span className="shrink-0 rounded-full border border-terracota/50 bg-card px-1.5 py-0.5 text-[10px] font-medium text-terracota">
                                  {reservadas} reservada{reservadas === 1 ? '' : 's'}
                                  {quien ? ` · ${quien}` : ''}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 font-mono text-xs text-muted">
                              {libres} libre{libres === 1 ? '' : 's'}
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
            <SelectorTalleMulti
              selector={selectorTalle}
              disabled={buscando}
              onChangeCantidad={setCantidadTalle}
              onConfirm={() => void confirmarSelectorTalle()}
              onCancel={() => setSelectorTalle(null)}
            />
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
                      <LineaDescuentos
                        grupo={g}
                        disponibles={descProducto.get(g.id_producto) ?? []}
                        seleccionados={descuentosProducto[g.id_producto] ?? EMPTY_SET}
                        onToggle={(idRegla) => toggleProducto(g.id_producto, idRegla)}
                        disabled={buscando}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {g.precio_final != null ? (
                        <div className="flex flex-col items-end leading-tight">
                          {g.desglose.descuentos.length > 0 && g.precio_lista != null && (
                            <span className="text-xs text-muted line-through">
                              {money(g.precio_lista)}
                            </span>
                          )}
                          <span>{money(g.precio_final)}</span>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CantidadGrupo
                        grupo={g}
                        max={stockPorGrupo[g.key]}
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
              {(totalDescuentos > 0 || totalRecargo > 0) && (
                <>
                  <tr className="border-t border-border">
                    <td colSpan={3} className="px-4 pt-3 pb-1 text-right text-sm text-muted">
                      Subtotal (precio de lista)
                    </td>
                    <td className="px-4 pt-3 pb-1 text-right font-mono text-sm text-muted">
                      {money(subtotalLista)}
                    </td>
                    <td></td>
                  </tr>
                  {resumenDescuentos.map((r) => (
                    <tr key={r.nombre + r.alcance}>
                      <td colSpan={3} className="px-4 py-0.5 text-right text-sm text-muted">
                        <span className="rounded bg-card-2 px-1 py-0.5 text-[10px] uppercase tracking-wide">
                          {ALCANCE_CORTO[r.alcance]}
                        </span>{' '}
                        {r.nombre}
                      </td>
                      <td className="px-4 py-0.5 text-right font-mono text-sm text-pink-strong">
                        −{money(r.total)}
                      </td>
                      <td></td>
                    </tr>
                  ))}
                  {totalDescuentos > 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-0.5 text-right text-sm font-medium text-pink-strong">
                        Total descuentos
                      </td>
                      <td className="px-4 py-0.5 text-right font-mono text-sm font-semibold text-pink-strong">
                        −{money(totalDescuentos)}
                      </td>
                      <td></td>
                    </tr>
                  )}
                  {totalRecargo > 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-0.5 pb-2 text-right text-sm font-medium text-terracota">
                        Recargo · {FORMA_PAGO_LABEL[formaPago]}
                      </td>
                      <td className="px-4 py-0.5 pb-2 text-right font-mono text-sm font-semibold text-terracota">
                        +{money(totalRecargo)}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </>
              )}
              <tr className="border-t border-border bg-card-2">
                <td colSpan={3} className="px-4 py-3 font-semibold">
                  Total ({lineas.length} ítem{lineas.length === 1 ? '' : 's'})
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  {money(total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Paso 1 (cont.) — datos de la venta. Grilla responsive en vez de una
          columna lateral angosta: en tablet entran de a dos y en desktop de a
          cuatro, así el bloque no empuja el carrito hacia arriba. */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-text">Detalles de la venta</h2>
          <span className="text-xs text-muted">
            Todo opcional — aplica a la venta completa
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Cuotas, no "forma de pago": lo único que decide acá el vendedor es
              si la venta se financia. Sin cuotas = precio de lista; el medio
              real de cobro (efectivo, transferencia) se elige abajo, en
              Cobranza, y no toca el precio. */}
          <Field
            htmlFor="v-fp"
            label="Cuotas"
            hint="Sin cuotas, precio de lista. Con cuotas se aplica el recargo configurado en Precios."
          >
            <select
              id="v-fp"
              value={formaPago === 'efectivo' ? '' : formaPago}
              onChange={(e) => setFormaPago((e.target.value || 'efectivo') as FormaPago)}
              className="w-full"
            >
              <option value="">— Sin cuotas —</option>
              {(['cuotas_2', 'cuotas_3'] as FormaPago[]).map((fp) => (
                <option key={fp} value={fp}>
                  {FORMA_PAGO_LABEL[fp]}
                </option>
              ))}
            </select>
            {totalRecargo > 0 && (
              <p className="mt-1 text-xs text-terracota">
                Recargo por {FORMA_PAGO_LABEL[formaPago]}: +{money(totalRecargo)} — ya
                incluido en el total.
              </p>
            )}
          </Field>

          {/* El campo Reserva NO se elige a mano: aparece solo cuando la venta
              se enganchó a una reserva (por precarga o por cargar un ítem
              reservado). Sin eso sería una decisión más para tomar en el
              mostrador sin ningún motivo. */}
          {idReserva && (
            // `self-end` lo alinea con los inputs de los Field vecinos en vez
            // de estirarse a lo alto de la fila.
            <div className="flex items-center justify-between gap-2 self-end rounded-md border border-pink-strong/40 bg-pink-bg px-2.5 py-1.5">
              <span className="min-w-0 truncate text-xs">
                <span className="font-medium text-pink-strong">Reserva</span>
                <span className="text-text">
                  {' '}· {reservaActual?.cliente_nombre ?? 'Mostrador'}
                </span>
                {reservaActual && (
                  <span className="text-muted">
                    {' '}· vence{' '}
                    {new Date(reservaActual.fecha_vencimiento).toLocaleDateString('es-AR')}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={desvincularReserva}
                disabled={pending}
                title="Quita la reserva de esta venta y vacía el carrito"
                className="shrink-0 text-xs text-muted underline-offset-2 hover:text-terracota hover:underline disabled:opacity-50"
              >
                Quitar
              </button>
            </div>
          )}

          {lineas.length > 0 && (
            <DescuentosPanelSelect
              opciones={descPanel}
              seleccionados={descuentosPanel}
              onToggle={togglePanel}
              productosTotal={productosEnCarritoCount}
            />
          )}

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
            <div className="rounded-md border border-border bg-card-2 p-3 space-y-3 sm:col-span-2 xl:col-span-4">
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

          <div className="sm:col-span-2 xl:col-span-4">
            <Field htmlFor="v-obs" label="Observaciones">
              <Textarea
                id="v-obs"
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Barra de acción: queda pegada abajo mientras se carga el carrito, así
          el total y el paso siguiente están siempre a un toque de distancia. */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs text-muted">
            Total · {lineas.length} ítem{lineas.length === 1 ? '' : 's'}
          </div>
          <div className="font-mono text-xl font-semibold text-text">{money(total)}</div>
        </div>
        <Button
          className="w-full sm:w-auto"
          size="lg"
          onClick={() => setCobranzaOpen(true)}
          disabled={lineas.length === 0 || pending}
        >
          {pending ? 'Registrando…' : 'Continuar al cobro'}
        </Button>
      </div>

      {/* Paso 2 — cobranza. El botón de confirmar sólo existe acá adentro. */}
      <Modal
        open={cobranzaOpen}
        title="Cobranza"
        size="lg"
        onClose={() => setCobranzaOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCobranzaOpen(false)}
              disabled={pending}
            >
              Volver
            </Button>
            <Button type="button" onClick={confirmar} disabled={!puedeConfirmar}>
              {pending ? 'Registrando…' : `Confirmar venta · ${money(total)}`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-card-2 px-3 py-2">
            <span className="text-sm text-muted">
              {lineas.length} ítem{lineas.length === 1 ? '' : 's'}
              {formaPago !== 'efectivo' ? ` · ${FORMA_PAGO_LABEL[formaPago]}` : ''}
            </span>
            <span className="font-mono text-lg font-semibold text-text">{money(total)}</span>
          </div>

          <CobranzaPanel
            cuentas={cuentas}
            pagos={pagosNormalizados}
            total={total}
            disabled={pending}
            onChange={setPagos}
          />

          <p className="rounded-md border border-border bg-card-2 p-3 text-xs text-muted">
            Al confirmar se marcan los ítems como vendidos y se revalida en el
            server el precio, el estado de cada ítem y la reserva. No se puede
            deshacer sin anular la venta.
          </p>
        </div>
      </Modal>
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
  max,
  onCommit,
  disabled,
}: {
  grupo: Grupo
  /** Tope físico de unidades (producto+talle). undefined = sin dato aún. */
  max?: number
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

  // Clamp al tope: nunca dejamos elegir más unidades de las que hay en stock.
  // Si aún no llegó el dato de stock, no topeamos (el server igual valida).
  function clamp(n: number): number {
    const piso = Math.max(0, Math.floor(n || 0))
    return max != null ? Math.min(piso, max) : piso
  }

  function schedule(nueva: number) {
    const n = clamp(nueva)
    setVal(n)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onCommit(n), 250)
  }

  function commitNow(nueva: number) {
    if (timer.current) clearTimeout(timer.current)
    const n = clamp(nueva)
    if (n !== val) setVal(n)
    if (n !== grupo.cantidad) onCommit(n)
  }

  const enTope = max != null && grupo.cantidad >= max

  return (
    <div className="flex flex-col items-end gap-0.5">
      <NumberInput
        min={0}
        max={max}
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
      {enTope && (
        <span className="text-[10px] text-muted">
          {max === 1 ? 'Única unidad' : `Máx. ${max}`}
        </span>
      )}
    </div>
  )
}

/** $ con 2 decimales, formato es-AR. */
function money(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

/** Etiqueta corta del valor de un descuento: "15%" o "$ 500,00". */
function descValorLabel(d: { tipo_valor: string; valor: number }): string {
  return d.tipo_valor === 'porcentaje'
    ? `${(d.valor * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
    : money(d.valor)
}

const ALCANCE_CORTO: Record<string, string> = {
  global: 'Global',
  categoria: 'Categoría',
  proveedor: 'Proveedor',
  producto: 'Producto',
}

/**
 * Descuentos de una fila del carrito. Muestra:
 *   - chips seleccionables de los descuentos de alcance=producto disponibles,
 *   - el listado de TODOS los descuentos aplicados a la línea con su impacto,
 *   - un aviso si se combinan dos o más descuentos NO acumulables (modelo
 *     "avisar, no bloquear": el vendedor decide igual).
 */
function LineaDescuentos({
  grupo,
  disponibles,
  seleccionados,
  onToggle,
  disabled,
}: {
  grupo: Grupo
  disponibles: DescuentoDisponible[]
  seleccionados: Set<string>
  onToggle: (idRegla: string) => void
  disabled: boolean
}) {
  const aplicados = grupo.desglose.descuentos
  const noAcumulables = aplicados.filter((d) => !d.acumulable).length
  if (disponibles.length === 0 && aplicados.length === 0) return null

  return (
    <div className="mt-2 space-y-1.5">
      {disponibles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Descuento de producto:</span>
          {disponibles.map((d) => {
            const activo = seleccionados.has(d.id_regla)
            return (
              <button
                key={d.id_regla}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(d.id_regla)}
                aria-pressed={activo}
                className={`rounded-full border px-2 py-0.5 text-xs transition disabled:opacity-50 ${
                  activo
                    ? 'border-pink-strong bg-pink-bg text-pink-strong'
                    : 'border-border bg-card text-text hover:border-pink-strong'
                }`}
                title={activo ? 'Quitar descuento' : 'Aplicar descuento'}
              >
                {activo ? '✓ ' : ''}
                {d.nombre} · −{descValorLabel(d)}
              </button>
            )
          })}
        </div>
      )}

      {aplicados.length > 0 && (
        <ul className="space-y-0.5">
          {aplicados.map((d) => (
            <li
              key={d.id_regla}
              className="flex items-center justify-between gap-2 text-xs text-muted"
            >
              <span>
                <span className="rounded bg-card-2 px-1 py-0.5 text-[10px] uppercase tracking-wide">
                  {ALCANCE_CORTO[d.alcance]}
                </span>{' '}
                {d.nombre}
                {!d.acumulable && ' · no acumulable'}
              </span>
              <span className="font-mono text-pink-strong">−{money(d.monto)}</span>
            </li>
          ))}
        </ul>
      )}

      {noAcumulables >= 2 && (
        <div className="text-xs text-terracota">
          Estás combinando {noAcumulables} descuentos marcados como no
          acumulables. Se aplican igual — revisá que sea lo que querés.
        </div>
      )}
    </div>
  )
}

/**
 * Selector de descuentos global/categoría/proveedor como desplegable
 * multi-select (acumulable: se pueden tildar varios). Muestra chips de los
 * activos debajo del botón, visibles aunque el desplegable esté cerrado.
 */
function DescuentosPanelSelect({
  opciones,
  seleccionados,
  onToggle,
  productosTotal,
}: {
  opciones: Array<{ d: DescuentoDisponible; productos: Set<string> }>
  seleccionados: Set<string>
  onToggle: (idRegla: string) => void
  productosTotal: number
}) {
  const [open, setOpen] = useState(false)
  const activos = opciones.filter((o) => seleccionados.has(o.d.id_regla))

  return (
    <div>
      <div className="mb-1 text-sm font-medium">Descuentos de la venta</div>
      {opciones.length === 0 ? (
        <p className="text-xs text-muted">
          No hay descuentos globales, de categoría o de proveedor para estos
          productos. Los de producto se eligen en cada fila.
        </p>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-pink"
          >
            <span className={activos.length ? 'text-text' : 'text-muted'}>
              {activos.length === 0
                ? 'Elegí descuentos…'
                : `${activos.length} descuento${activos.length === 1 ? '' : 's'} aplicado${activos.length === 1 ? '' : 's'}`}
            </span>
            <span className="text-muted">▾</span>
          </button>

          {open && (
            <>
              {/* Backdrop para cerrar al clickear afuera (queda detrás de la lista). */}
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <ul
                role="listbox"
                aria-multiselectable="true"
                className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card-2 shadow"
              >
                {opciones.map(({ d, productos }) => {
                  const activo = seleccionados.has(d.id_regla)
                  return (
                    <li
                      key={d.id_regla}
                      role="option"
                      aria-selected={activo}
                      onClick={() => onToggle(d.id_regla)}
                      className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${
                        activo ? 'bg-pink-bg' : 'hover:bg-card'
                      }`}
                    >
                      <span className="mt-0.5 w-4 shrink-0 text-pink-strong">
                        {activo ? '✓' : ''}
                      </span>
                      <span className="flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{d.nombre}</span>
                          <span className="font-mono text-xs text-pink-strong">
                            −{descValorLabel(d)}
                          </span>
                        </span>
                        <span className="text-xs text-muted">
                          {ALCANCE_CORTO[d.alcance]}
                          {productos.size < productosTotal
                            ? ` · ${productos.size} de ${productosTotal} productos`
                            : ' · todo el carrito'}
                          {!d.acumulable ? ' · no acumulable' : ''}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {activos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activos.map(({ d }) => (
                <span
                  key={d.id_regla}
                  className="inline-flex items-center gap-1 rounded-full border border-pink-strong bg-pink-bg px-2 py-0.5 text-xs text-pink-strong"
                >
                  {d.nombre} · −{descValorLabel(d)}
                  <button
                    type="button"
                    onClick={() => onToggle(d.id_regla)}
                    aria-label={`Quitar ${d.nombre}`}
                    className="hover:text-terracota"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Motivos de rechazo del lookup que se destraban enganchando la venta a la
 * reserva que está bloqueando las unidades.
 */
function esReasonDeReserva(reason: string): boolean {
  return (
    reason === 'item-en-reserva' ||
    reason === 'item-ya-reservado' ||
    reason === 'sku-sin-stock-libre'
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
  if (reason === 'sku-sin-stock-libre') {
    // Con `id_reserva` el rebote es por una reserva ajena a la venta actual:
    // el auto-enganche ya se intentó y no aplicaba (la venta está atada a
    // otra reserva, o hay más de una en juego).
    return extra?.id_reserva
      ? 'Las unidades que quedan están tomadas por otra reserva. Desvinculá la reserva actual o cobrá esa reserva aparte.'
      : 'No quedan unidades libres: están reservadas o ya las cargaste en el carrito.'
  }
  if (reason === 'sin-precio-lista') return 'El producto no tiene precio de venta. Fijalo en Precios → Control de precios.'
  if (reason === 'reserva-no-activa') return 'La reserva ya no está activa (fue cancelada, vencida o convertida).'
  if (reason === 'lineas-vacias') return 'Agregá al menos un ítem al carrito.'
  if (reason === 'elegir-talle') return 'Elegí un talle disponible.'
  return reason
}
