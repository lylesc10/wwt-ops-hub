import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useSync() {
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [error, setError] = useState(null)

  const syncProject = useCallback(async (projectId) => {
    setSyncing(true)
    setError(null)
    setLastResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch('/api/sync/smartsheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ project_id: projectId }),
      })

      const result = await res.json()

      if (!res.ok) throw new Error(result.message ?? 'Sync failed')

      setLastResult(result)
      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setSyncing(false)
    }
  }, [])

  const syncAll = useCallback(async (projectIds) => {
    setSyncing(true)
    setError(null)
    const results = []
    for (const id of projectIds) {
      const r = await syncProject(id)
      if (r) results.push(r)
    }
    setSyncing(false)
    return results
  }, [syncProject])

  return { syncing, lastResult, error, syncProject, syncAll }
}
