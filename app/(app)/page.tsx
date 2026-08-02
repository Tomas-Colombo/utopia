import { redirect } from 'next/navigation'

/**
 * La raíz ya no muestra dashboard: el vendedor entra directo a Ventas, que es
 * donde trabaja.
 *
 * Se conserva como redirect en vez de borrarse para que sigan funcionando los
 * favoritos viejos, el `revalidatePath('/')` de administración y cualquier
 * enlace a la raíz. El dashboard anterior (KPIs + alertas) está en el
 * historial de git si hace falta recuperarlo.
 */
export default async function RaizPage() {
  redirect('/ventas')
}
