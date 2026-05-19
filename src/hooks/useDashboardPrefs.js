import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useDashboardPrefs() {
  const [prefs, setPrefs] = useState({
    project_filter: null,   // null = all
    view_scope:     'all',  // 'all' | 'mine'
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load from DB + localStorage fallback
    const local = (() => { try { return JSON.parse(localStorage.getItem('dashboard_prefs') ?? 'null') } catch { return null } })()
    if (local) setPrefs(p => ({ ...p, ...local }))

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setLoading(false); return }
      supabase
        .from('user_dashboard_prefs')
        .select('*')
        .eq('user_id', session.user.id)
        .single()
        .then(({ data, error }) => {
          // Silently ignore 404/missing table errors
          if (data && !error) setPrefs({ project_filter: data.project_filter, view_scope: data.view_scope ?? 'all' })
          setLoading(false)
        })
        .catch(() => setLoading(false))
    })
  }, [])

  const update = useCallback(async (patch) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    localStorage.setItem('dashboard_prefs', JSON.stringify(next))
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('user_dashboard_prefs').upsert({
      user_id:        session.user.id,
      project_filter: next.project_filter,
      view_scope:     next.view_scope,
      updated_at:     new Date().toISOString(),
    })
  }, [prefs])

  return { prefs, loading, update }
}
