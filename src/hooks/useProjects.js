import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS on noLogin branch
const adminSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
)

export function useProjects() {
  const [projects,  setProjects]  = useState([])
  const [archived,  setArchived]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    const [activeRes, archivedRes] = await Promise.all([
      adminSupabase.from('projects').select('*, sites(count)').eq('is_active', true).order('name'),
      adminSupabase.from('projects').select('*, sites(count)').eq('is_active', false).order('name'),
    ])
    if (activeRes.error)   setError(activeRes.error.message)
    else setProjects(activeRes.data ?? [])
    setArchived(archivedRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const createProject = useCallback(async (fields) => {
    const { data, error } = await adminSupabase
      .from('projects').insert({ ...fields, is_active: true }).select().single()
    if (error) throw new Error(error.message)
    await fetchProjects()
    return data
  }, [fetchProjects])

  const updateProject = useCallback(async (id, fields) => {
    const { error } = await adminSupabase
      .from('projects').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchProjects()
  }, [fetchProjects])

  // Soft delete — moves to recycle bin
  const deleteProject = useCallback(async (id) => {
    const { error } = await adminSupabase
      .from('projects').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchProjects()
  }, [fetchProjects])

  // Restore from recycle bin
  const restoreProject = useCallback(async (id) => {
    const { error } = await adminSupabase
      .from('projects').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    await fetchProjects()
  }, [fetchProjects])

  // Permanent delete — removes project and all sites
  const permanentlyDelete = useCallback(async (id) => {
    const { error } = await adminSupabase.from('projects').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await fetchProjects()
  }, [fetchProjects])

  return {
    projects, archived, loading, error,
    refetch: fetchProjects,
    createProject, updateProject, deleteProject,
    restoreProject, permanentlyDelete,
  }
}
