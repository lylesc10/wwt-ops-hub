import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useTechnicians() {
  const [technicians, setTechnicians] = useState([])
  const [loading,     setLoading]     = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('technicians')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    setTechnicians(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const add = useCallback(async (fields) => {
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase
      .from('technicians')
      .insert({ ...fields, added_by: session?.user?.id })
      .select().single()
    if (error) throw new Error(error.message)
    await fetch()
    return data
  }, [fetch])

  const update = useCallback(async (id, fields) => {
    const { error } = await supabase
      .from('technicians')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetch()
  }, [fetch])

  const deactivate = useCallback(async (id) => {
    const { error } = await supabase
      .from('technicians')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetch()
  }, [fetch])

  return { technicians, loading, refetch: fetch, add, update, deactivate }
}
