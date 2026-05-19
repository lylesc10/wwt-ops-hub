import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  document.body.style.cssText = 'margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d0f12;font-family:monospace;text-align:center;padding:40px;'
  document.body.innerHTML = `
    <div>
      <p style="color:#f59e0b;font-size:16px;margin-bottom:12px;">⚠ Missing Supabase environment variables</p>
      <p style="color:#8b93a5;font-size:12px;">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY<br>in Vercel → Settings → Environment Variables, then redeploy.</p>
    </div>`
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
