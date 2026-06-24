'use client'
import { useState, useEffect } from 'react'
import type { ClientConfig } from '@/types/dashboard'

export function useDashboardConfig(clientId: string) {
  const [config, setConfig] = useState<ClientConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/v1/config?clientId=${encodeURIComponent(clientId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setConfig(json)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [clientId])

  return { config, loading, error }
}
