import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS for dev access on noLogin branch
const adminSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
)

export function useCredentials() {
  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCredentials = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await adminSupabase
      .from('credentials')
      .select('id, service, label, is_active, test_status, test_message, last_tested, created_at, updated_at')
    if (err) { setError(err.message); setLoading(false); return }
    setCredentials(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCredentials() }, [fetchCredentials])

  const saveCredentials = useCallback(async (service, fields) => {
    const SERVICE_FIELDS = {
      smartsheet:  ['access_token'],
      fieldnation: ['client_id', 'client_secret', 'environment'],
      resend:      ['api_key', 'from_address'],
      twilio:      ['account_sid', 'auth_token', 'from_number'],
    }
    const OPTIONAL = ['base_url', 'environment', 'from_address', 'webhook_secret']
    const allowedFields = SERVICE_FIELDS[service]
    if (!allowedFields) throw new Error(`Unknown service: ${service}`)
    const missing = allowedFields.filter(f => !OPTIONAL.includes(f) && !String(fields[f] ?? '').trim())
    if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`)

    const sanitized = {}
    for (const f of allowedFields) { const v = String(fields[f] ?? '').trim(); sanitized[f] = v || null }
    const encoded = btoa(JSON.stringify(sanitized))

    const { data: existing } = await adminSupabase.from('credentials').select('id').eq('service', service).single()
    let dbError
    if (existing) {
      const { error } = await adminSupabase.from('credentials').update({
        encrypted_data: encoded, is_active: true, test_status: 'untested',
        test_message: null, updated_at: new Date().toISOString(),
      }).eq('service', service)
      dbError = error
    } else {
      const { error } = await adminSupabase.from('credentials').insert({
        service, label: service, encrypted_data: encoded, is_active: true, test_status: 'untested',
      })
      dbError = error
    }
    if (dbError) throw new Error(dbError.message)
    await fetchCredentials()
    return { ok: true, service }
  }, [fetchCredentials])

  const testCredentials = useCallback(async (service) => {
    // Credential testing requires the API proxy — return a clear message in dev
    return { ok: false, status: 'error', message: 'Live testing not available in local dev mode. Credentials are saved — test by triggering a sync.' }
  }, [])

  return { credentials, loading, error, saveCredentials, testCredentials, refetch: fetchCredentials }
}
