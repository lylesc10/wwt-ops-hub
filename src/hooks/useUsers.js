import { useState, useEffect, useCallback } from 'react'
import { dab, getToken } from '@/lib/dab'

function generateTempPassword() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10).toUpperCase() + '!'
}

export function useUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await dab
      .from('users')
      .select('id,email,full_name,role,avatar_url,is_active,created_at,updated_at')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setUsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const inviteUser = useCallback(async ({ email, full_name, role }) => {
    const token = getToken()
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? ''}`,
      },
      body: JSON.stringify({ email, full_name, role, temp_password: generateTempPassword() }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message ?? 'Failed to create user')
    await fetchUsers()
    return json.user
  }, [fetchUsers])

  const updateUser = useCallback(async (id, { full_name, role }) => {
    const { error } = await dab
      .from('users')
      .update({ full_name, role, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchUsers()
  }, [fetchUsers])

  const deactivateUser = useCallback(async (id) => {
    const { error } = await dab
      .from('users')
      .update({ role: 'viewer', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchUsers()
  }, [fetchUsers])

  return { users, loading, error, refetch: fetchUsers, inviteUser, updateUser, deactivateUser }
}
