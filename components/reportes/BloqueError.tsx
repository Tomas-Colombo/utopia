'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'

interface BloqueErrorProps {
  onRetry?: () => void
}

export function BloqueError({ onRetry }: BloqueErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-card border border-border rounded-lg shadow-sm text-center">
      <div className="w-10 h-10 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-3">
        <span className="font-bold text-lg">!</span>
      </div>
      <p className="text-muted-foreground text-sm mb-4">
        No pudimos cargar esto. Probá de nuevo en un momento.
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary" size="sm">
          Reintentar
        </Button>
      )}
    </div>
  )
}
