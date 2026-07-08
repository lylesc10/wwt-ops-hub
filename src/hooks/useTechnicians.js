import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'
import { useAuth } from '@/hooks/useAuth'

export function useTechnicians() {
  const { user } = useAuth()
  const [technicians, setTechnicians] = useState([])
  const [loading,     setLoading]     = useState(true)

  const fetchTechs = useCallback(async () => {
    setLoading(true)
    const { data } = await dab
      .from('technicians')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    setTechnicians(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchTechs() }, [fetchTechs])

  const add = useCallback(async (fields) => {
    const { data, error } = await dab
      .from('technicians')
      .insert({ ...fields, added_by: user?.id })
      .select().single()
    if (error) throw new Error(error.message)
    await fetchTechs()
    return data
  }, [user?.id, fetchTechs])

  const update = useCallback(async (id, fields) => {
    const { error } = await dab
      .from('technicians')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchTechs()
  }, [fetchTechs])

  const deactivate = useCallback(async (id) => {
    const { error } = await dab
      .from('technicians')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchTechs()
  }, [fetchTechs])

  return { technicians, loading, refetch: fetchTechs, add, update, deactivate }
}
