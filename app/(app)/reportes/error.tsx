'use client'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function ReportesError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <main className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[50vh]">
      <Card padding="none" className="flex flex-col items-center max-w-md text-center p-8 shadow-sm">
        <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
          <span className="text-xl font-bold">!</span>
        </div>
        <h2 className="text-xl font-display mb-2">Algo salió mal</h2>
        <p className="text-muted-foreground text-sm mb-6">
          Ocurrió un problema inesperado al armar tu reporte. Por favor, reintentá.
        </p>
        <Button onClick={() => unstable_retry()} variant="primary">
          Intentar de nuevo
        </Button>
      </Card>
    </main>
  )
}
