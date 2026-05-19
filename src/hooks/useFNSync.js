import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Hook for all FieldNation API interactions:
 * - Dupe check (before download)
 * - Status sync (pull FN WO statuses back to Site Board)
 * - Connection test
 */
export function useFNSync() {
  const [checking,    setChecking]    = useState(false)
  const [syncing,     setSyncing]     = useState(false)
  const [dupeResults, setDupeResults] = useState(null) // { [code]: { exists, wo_id, status, url } }
  const [syncResult,  setSyncResult]  = useState(null)
  const [error,       setError]       = useState(null)

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token ?? ''}` }
  }

  /**
   * Check FieldNation for existing WOs matching the given site codes
   * @param {string[]} siteCodes
   * @param {string} fnProjectId - optional FN project ID to narrow search
   */
  const checkDupes = useCallback(async (siteCodes, fnProjectId) => {
    if (!siteCodes?.length) return {}
    setChecking(true)
    setError(null)
    setDupeResults(null)

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/fn/check-dupes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
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

  /**
   * Pull WO statuses from FN back into Supabase
   * @param {string} projectId - optional project filter
   */
  const syncStatus = useCallback(async (projectId) => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)

    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/fn/sync-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
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

  /**
   * Test FN connection
   */
  const testConnection = useCallback(async () => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/credentials/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ service: 'fieldnation' }),
      })
      const data = await res.json()
      return data
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }, [])

  /**
   * Save FN WO ID back to a site after successful push
   */
  const saveFNWOId = useCallback(async (siteCode, fnWoId, projectId) => {
    const { error } = await supabase
      .from('sites')
      .update({ fn_wo_id: String(fnWoId), updated_at: new Date().toISOString() })
      .eq('code', siteCode)
      .eq('project_id', projectId)
    return !error
  }, [])

  const clearDupes  = useCallback(() => setDupeResults(null), [])
  const clearResult = useCallback(() => setSyncResult(null),  [])

  return {
    // Dupe check
    checking, dupeResults, checkDupes, clearDupes,
    // Status sync
    syncing, syncResult, syncStatus, clearResult,
    // Shared
    error,
    testConnection,
    saveFNWOId,
  }
}
