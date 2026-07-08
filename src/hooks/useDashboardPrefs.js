import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'
import { useAuth } from '@/hooks/useAuth'

export function useDashboardPrefs() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState({
    project_filter: null,
    view_scope:     'all',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const local = (() => { try { return JSON.parse(localStorage.getItem('dashboard_prefs') ?? 'null') } catch { return null } })()
    if (local) setPrefs(p => ({ ...p, ...local }))

    if (!user?.id) { setLoading(false); return }

    dab
      .from('user_dashboard_prefs')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data, error }) => {
        if (data && !error) setPrefs({ project_filter: data.project_filter, view_scope: data.view_scope ?? 'all' })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user?.id])

  const update = useCallback(async (patch) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    localStorage.setItem('dashboard_prefs', JSON.stringify(next))
    if (!user?.id) return
    await dab.from('user_dashboard_prefs').upsert({
      user_id:        user.id,
      project_filter: next.project_filter,
      view_scope:     next.view_scope,
      updated_at:     new Date().toISOString(),
    })
  }, [prefs, user?.id])

  return { prefs, loading, update }
}
