import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useCredentials() {
  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCredentials = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch('/api/credentials', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })

    if (!res.ok) {
      setError('Failed to load credentials')
      setLoading(false)
      return
    }

    const data = await res.json()
    setCredentials(data.credentials ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCredentials() }, [fetchCredentials])

  const saveCredentials = useCallback(async (service, fields) => {
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch('/api/credentials/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ service, data: fields }),
    })

    const result = await res.json()
    if (!res.ok) throw new Error(result.message)
    await fetchCredentials()
    return result
  }, [fetchCredentials])

  const testCredentials = useCallback(async (service) => {
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch('/api/credentials/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ service }),
    })

    const result = await res.json()
    await fetchCredentials()
    return result
  }, [fetchCredentials])

  return { credentials, loading, error, saveCredentials, testCredentials, refetch: fetchCredentials }
}
