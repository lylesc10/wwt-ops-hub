import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useNotificationPrefs() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchPrefs = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      setError(error.message)
    } else {
      setPrefs(data)
    }
    setLoading(false)
  }, [user?.id])

  useEffect(() => { fetchPrefs() }, [fetchPrefs])

  const updatePrefs = useCallback(async (updates) => {
    if (!user?.id) return
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('notification_prefs')
      .upsert({ user_id: user.id, ...updates, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' })

    if (error) setError(error.message)
    else await fetchPrefs()
    setSaving(false)
  }, [user?.id, fetchPrefs])

  return { prefs, loading, saving, error, updatePrefs, refetch: fetchPrefs }
}
