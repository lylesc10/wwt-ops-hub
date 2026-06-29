import { useState, useCallback } from 'react'
import { dab, getToken } from '@/lib/dab'

export function useFNSync() {
  const [checking,    setChecking]    = useState(false)
  const [syncing,     setSyncing]     = useState(false)
  const [dupeResults, setDupeResults] = useState(null)
  const [syncResult,  setSyncResult]  = useState(null)
  const [error,       setError]       = useState(null)

  const getAuthHeader = () => ({ Authorization: `Bearer ${getToken() ?? ''}` })

  const checkDupes = useCallback(async (siteCodes, fnProjectId) => {
    if (!siteCodes?.length) return {}
    setChecking(true)
    setError(null)
    setDupeResults(null)

    try {
      const res = await fetch('/api/fn/check-dupes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ site_codes: siteCodes, fn_project_id: fnProjectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Dupe check failed')
      setDupeResults(data.results)
      return data
    } catch (e) {
      setError(e.message)
      return { results: {}, error: e.message }
    } finally {
      setChecking(false)
    }
  }, [])

  const syncStatus = useCallback(async (projectId) => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)

    try {
      const res = await fetch('/api/fn/sync-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ project_id: projectId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Status sync failed')
      setSyncResult(data)
      return data
    } catch (e) {
      setError(e.message)
      return { ok: false, error: e.message }
    } finally {
      setSyncing(false)
    }
  }, [])

  const testConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/credentials/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ service: 'fieldnation' }),
      })
      return await res.json()
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }, [])

  const saveFNWOId = useCallback(async (siteCode, fnWoId, projectId) => {
    const { error } = await dab
      .from('sites')
      .update({ fn_wo_id: String(fnWoId), updated_at: new Date().toISOString() })
      .eq('code', siteCode)
      .eq('project_id', projectId)
    return !error
  }, [])

  const clearDupes  = useCallback(() => setDupeResults(null), [])
  const clearResult = useCallback(() => setSyncResult(null),  [])

  return {
    checking, dupeResults, checkDupes, clearDupes,
    syncing, syncResult, syncStatus, clearResult,
    error,
    testConnection,
    saveFNWOId,
  }
}
