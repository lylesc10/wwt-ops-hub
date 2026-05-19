import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const inviteUser = useCallback(async ({ email, full_name, role }) => {
    // Invite via Supabase auth — sends email to user
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role }
    })
    if (error) throw new Error(error.message)
    // Upsert profile row
    await supabase.from('users').upsert({
      id: data.user.id,
      email,
      full_name,
      role,
    }, { onConflict: 'id' })
    await fetchUsers()
    return data.user
  }, [fetchUsers])

  const updateUser = useCallback(async (id, { full_name, role }) => {
    const { error } = await supabase
      .from('users')
      .update({ full_name, role, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchUsers()
  }, [fetchUsers])

  const deactivateUser = useCallback(async (id) => {
    // We don't hard-delete — just downgrade to viewer and mark
    const { error } = await supabase
      .from('users')
      .update({ role: 'viewer', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchUsers()
  }, [fetchUsers])

  return { users, loading, error, refetch: fetchUsers, inviteUser, updateUser, deactivateUser }
}
