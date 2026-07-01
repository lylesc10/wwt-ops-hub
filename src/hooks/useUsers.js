import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export function useUsers() {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

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
    const session = getSession()
    const res = await fetch('/api/auth/users', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ email, full_name, role }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.message ?? 'Failed to create user')
    await fetchUsers()
    return body.user
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
    const { error } = await supabase
      .from('users')
      .update({ role: 'viewer', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchUsers()
  }, [fetchUsers])

  return { users, loading, error, refetch: fetchUsers, inviteUser, updateUser, deactivateUser }
}
