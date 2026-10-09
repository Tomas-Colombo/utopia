import { describe, expect, it, vi } from 'vitest'
import { MENSAJE_GENERICO, mensajeDeError, SLUGS_CON_MENSAJE } from './mensajes'

/**
 * Inventario de TODOS los `reason` que la app puede producir, relevado de las
 * tres fuentes: los `raise exception` de `supabase/migrations/*.sql`, los
 * `reason: '...'` de los Server Actions, y los de las rutas de `app/api`.
 *
 * Este test es el que hace que el catálogo no se quede viejo: si mañana un SP
 * levanta un slug nuevo y nadie le escribe el mensaje, el operador vería la
 * frase genérica en vez de algo útil. Agregar el slug acá falla el test hasta
 * que exista el mensaje.
 */
const SLUGS_DE_LA_APP = [
  // Permisos y sesión
  'no-permission', 'module-disabled', 'tenant-mismatch', 'no-session', 'no-tenant', 'modulo-revendedoras-deshabilitado', 'revendedora-not-found', 'revendedora-con-stock',
  // Actions
  'apellido-invalido', 'archivo-invalido', 'consignacion-vacia', 'cuotas-invalidas',
  'cuotas-medio-invalido', 'demasiados-productos-en-un-batch', 'dias-invalidos',
  'email-invalido', 'financiacion-sin-cliente', 'ids-vacios', 'items-vacios',
  'lineas-vacias', 'monto-invalido', 'motivo-requerido', 'no-es-pdf', 'nombre-corto',
  'nombre-invalido', 'observaciones-requeridas', 'pago-sin-cuenta', 'password-corto',
  'porcentaje-invalido', 'propia-con-procesador', 'proveedor-requerido',
  'recargo-duplicado', 'rol-requerido', 'sin-lineas', 'valor-invalido',
  // Validación de esquema (zod)
  'payload-invalido', 'campo-desconocido', 'permisos-no-objeto', 'permisos-no-array',
  'modulo-desconocido', 'accion-invalida', 'acciones-duplicadas', 'id-rol-invalido',
  'id-venta-invalido', 'nombre-largo', 'motivo-largo', 'motivo-invalido',
  // Stored procedures
  'cantidad-invalida', 'categoria-not-found', 'categoria-sin-talles',
  'consignacion-no-activa', 'consignacion-not-found', 'cuenta-destino-invalida',
  'cuota-no-cobrable', 'cuota-no-incobrable', 'cuota-not-found',
  'descripcion-requerida', 'detalle-not-found', 'detalle-venta-not-found',
  'detalle-ya-devuelto', 'detalle-ya-rendido', 'devolucion-venta-con-cuotas-abiertas',
  'detalle-no-pendiente', 'invalid-transition', 'item-no-disponible-para-reserva',
  'item-no-puede-darse-de-baja', 'precio-no-resoluble',
  'excede-disponibles', 'falta-categoria', 'falta-producto',
  'financiacion-cuotas-invalidas', 'financiacion-sin-saldo',
  'financiacion-sin-vencimiento', 'gasto-inexistente', 'ingreso-con-items-movidos',
  'ingreso-not-found', 'ingreso-ya-cancelado', 'item-en-otra-reserva',
  'item-en-reserva', 'item-no-esta-vendido', 'item-not-found', 'item-otro-proveedor',
  'item-ya-en-consignacion-pendiente', 'item-ya-reservado', 'linea-sin-id-item',
  'linea-sin-nombre', 'monto-excede-saldo', 'no-se-pudo-generar-sku',
  'nombre-requerido', 'orden-invalido', 'pago-credito-sin-cuotas', 'pago-cuotas-medio-invalido',
  'pago-monto-invalido', 'pagos-no-cuadran', 'periodo-invalido', 'producto-not-found',
  'proveedor-con-items', 'quedan-pendientes', 'regla-not-found',
  'reintegro-requiere-cuenta-y-medio', 'rendicion-not-found', 'reserva-no-activa', 'reserva-not-found', 'rol-en-uso',
  'rol-not-found', 'sin-cuenta-predeterminada', 'sin-lineas-pendientes',
  'talle-no-valido', 'usuario-not-found', 'vencimiento-invalido', 'venta-anulada',
  'venta-con-incobrables', 'venta-not-found', 'venta-ya-rendida',
  // Rutas de API
  'elegir-talle', 'item-no-disponible', 'item-no-es-consignacion', 'proveedor-vacio',
  'qr-vacio', 'sin-precio-lista', 'sku-sin-stock', 'sku-sin-stock-libre',
  'stock-sin-talle',
] as const

describe('cobertura del catálogo', () => {
  it.each(SLUGS_DE_LA_APP)('%s tiene un mensaje propio', (slug) => {
    const msg = mensajeDeError(slug)
    expect(msg).not.toBe(MENSAJE_GENERICO)
    expect(msg).not.toBe(slug)
  })
})

describe('el slug crudo nunca llega a la UI', () => {
  it('un slug desconocido cae en el genérico, no en sí mismo', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(mensajeDeError('slug-que-no-existe-todavia')).toBe(MENSAJE_GENERICO)
    spy.mockRestore()
  })

  it('un error crudo de Postgres cae en el genérico', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const crudo =
      'sp_registrar_venta: null value in column "total" violates not-null constraint'
    expect(mensajeDeError(crudo)).toBe(MENSAJE_GENERICO)
    spy.mockRestore()
  })

  it('un reason vacío cae en el genérico', () => {
    expect(mensajeDeError('')).toBe(MENSAJE_GENERICO)
  })

  it('avisa por consola fuera de producción para que el dev no pierda el reason', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mensajeDeError('slug-nuevo-sin-mensaje')
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('slug-nuevo-sin-mensaje'),
    )
    spy.mockRestore()
  })
})

describe('slug envuelto en el error del SP', () => {
  it('lo encuentra adentro del mensaje del SP', () => {
    expect(mensajeDeError('sp_anular_venta: venta-ya-rendida')).toBe(
      mensajeDeError('venta-ya-rendida'),
    )
  })

  it('traduce el constraint de Postgres en vez de mostrarlo', () => {
    const crudo =
      'sp_create_producto: duplicate key value violates unique constraint "producto_tenant_sku_uk"'
    const msg = mensajeDeError(crudo)
    expect(msg).toBe('Ya existe un producto con ese código.')
    expect(msg).not.toContain('producto_tenant_sku_uk')
  })
})

describe('gana el slug más específico, no el más corto', () => {
  // Esto es lo que rompía con orden de inserción: el catálogo se recorre por
  // largo de slug descendente justamente por estos casos.
  it('sku-sin-stock-libre no se confunde con sku-sin-stock', () => {
    const libre = mensajeDeError('sp_x: sku-sin-stock-libre')
    expect(libre).toContain('No quedan unidades libres')
    expect(mensajeDeError('sp_x: sku-sin-stock')).toContain('no tiene unidades disponibles')
    expect(libre).not.toBe(mensajeDeError('sp_x: sku-sin-stock'))
  })

  it('pago-monto-invalido no se confunde con monto-invalido', () => {
    expect(mensajeDeError('sp_x: pago-monto-invalido')).toContain('del pago')
  })

  it('financiacion-cuotas-invalidas no se confunde con cuotas-invalidas', () => {
    expect(mensajeDeError('sp_x: financiacion-cuotas-invalidas')).toBe(
      'La cantidad de cuotas no es válida.',
    )
  })

  it('item-no-disponible-para-reserva no cae en el item-no-disponible genérico', () => {
    const msg = mensajeDeError('sp_crear_reserva: item-no-disponible-para-reserva: abc (estado=vendido)')
    expect(msg).toContain('para reservar')
    expect(msg).not.toBe(mensajeDeError('item-no-disponible'))
  })

  it('precio-no-resoluble conserva la causa concreta cuando tiene mensaje', () => {
    const msg = mensajeDeError('sp_registrar_venta: precio-no-resoluble: producto abc (sin-precio-lista)')
    expect(msg).toBe(mensajeDeError('sin-precio-lista'))
  })

  it('precio-no-resoluble con una causa desconocida da un mensaje propio, no el genérico', () => {
    const msg = mensajeDeError('sp_registrar_venta: precio-no-resoluble: producto abc (causa-nueva)')
    expect(msg).toContain('calcular el precio')
    expect(msg).not.toBe(MENSAJE_GENERICO)
    expect(msg).not.toContain('causa-nueva')
  })

  it('items-vacios no se confunde con ningún slug más corto', () => {
    expect(mensajeDeError('sp_x: items-vacios')).toBe('Elegí al menos un ítem.')
  })
})

describe('mensajes que incorporan el dato del rechazo', () => {
  it('item-no-disponible nombra el estado en palabras, no el valor del enum', () => {
    expect(mensajeDeError('item-no-disponible', { extra: { estado: 'devuelto_cliente' } })).toBe(
      'El ítem no está disponible: está devuelto por el cliente.',
    )
  })

  it('item-no-disponible sin estado sigue dando una frase completa', () => {
    expect(mensajeDeError('item-no-disponible')).toBe('El ítem no está disponible.')
  })

  it('un estado que no está en el diccionario se muestra tal cual antes que perderlo', () => {
    expect(mensajeDeError('item-no-disponible', { extra: { estado: 'raro' } })).toContain('raro')
  })

  it('quedan-pendientes cuenta cuántos faltan', () => {
    expect(mensajeDeError('quedan-pendientes: 3')).toContain('3 ítem(s)')
  })

  it('quedan-pendientes sin número sigue siendo una frase', () => {
    expect(mensajeDeError('quedan-pendientes')).toBe(
      'No se puede cerrar: quedan ítems sin devolver ni cancelar.',
    )
  })

  it('ingreso-con-items-movidos cuenta cuántos se movieron', () => {
    expect(mensajeDeError('ingreso-con-items-movidos: movidos: 4')).toContain('4 ítem(s)')
  })

  it('sku-sin-stock-libre distingue si el bloqueo es de otra reserva', () => {
    const conReserva = mensajeDeError('sku-sin-stock-libre', {
      extra: { id_reserva: 'abc' },
    })
    expect(conReserva).toContain('otra reserva')
    expect(mensajeDeError('sku-sin-stock-libre')).not.toContain('otra reserva')
  })
})

describe('errores de permiso', () => {
  it('sin contexto da la frase genérica de permiso', () => {
    expect(mensajeDeError('no-permission')).toBe('Tu rol no te permite hacer esto.')
  })

  it('con la acción se vuelve específico', () => {
    expect(mensajeDeError('no-permission', { accion: 'cancelar ingresos' })).toBe(
      'Tu rol no te permite cancelar ingresos.',
    )
  })
})

describe('higiene de los mensajes', () => {
  const todos = SLUGS_CON_MENSAJE.map((s) => mensajeDeError(s))

  it('ninguno filtra jerga técnica', () => {
    // "QR" y "stock" quedan afuera a propósito: el operador escanea QR y habla
    // de stock todo el día. Lo que no puede ver es el vocabulario del código.
    const jerga = [
      'SKU', 'tenant', 'payload', 'constraint', 'null', 'undefined', 'array',
      '_uk', 'sp_', 'RLS', 'JSON', 'uuid',
    ]
    for (const msg of [...todos, MENSAJE_GENERICO]) {
      for (const palabra of jerga) {
        expect(msg.toLowerCase()).not.toContain(palabra.toLowerCase())
      }
    }
  })

  it('todos terminan con punto', () => {
    for (const msg of [...todos, MENSAJE_GENERICO]) {
      expect(msg.endsWith('.')).toBe(true)
    }
  })

  it('todos empiezan con mayúscula', () => {
    for (const msg of [...todos, MENSAJE_GENERICO]) {
      expect(msg[0]).toBe(msg[0].toUpperCase())
    }
  })

  it('ninguno es un slug kebab disfrazado de mensaje', () => {
    for (const msg of todos) {
      expect(msg).toContain(' ')
      expect(msg).not.toMatch(/^[a-z0-9-]+$/)
    }
  })
})

describe('acceso seguro al catálogo', () => {
  it('__proto__ y constructor no devuelven algo del prototipo de Object', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const raro of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const msg = mensajeDeError(raro)
      expect(typeof msg).toBe('string')
      expect(msg).toBe(MENSAJE_GENERICO)
    }
    spy.mockRestore()
  })
})
