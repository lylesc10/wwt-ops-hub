import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message ?? 'Invalid credentials')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0e1015',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
      padding: '20px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        input { font-family: 'Inter', sans-serif; }
        input:focus { outline: none; border-color: #6366f1 !important; }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #1a1d26 inset !important; -webkit-text-fill-color: #eceef4 !important; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo mark */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 52, height: 52,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            borderRadius: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(99,102,241,.4)',
            fontSize: 26, fontWeight: 800,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            color: '#fff',
          }}>R</div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 800, color: '#eceef4', letterSpacing: '-0.3px' }}>
            Ops Manager
          </div>
          <div style={{ fontSize: 12, color: '#4d5568', marginTop: 4, letterSpacing: '0.04em' }}>
            Field Services Operations Platform
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: '#14171e',
          border: '1px solid #1f2333',
          borderRadius: 16,
          padding: 28,
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8892a4', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@company.com"
                style={{
                  width: '100%',
                  background: '#1a1d26',
                  border: '1px solid #1f2333',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#eceef4',
                  fontSize: 14,
                  transition: 'border-color 0.12s',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#8892a4', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  background: '#1a1d26',
                  border: `1px solid ${error ? '#f43f5e' : '#1f2333'}`,
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#eceef4',
                  fontSize: 14,
                  transition: 'border-color 0.12s',
                }}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: '#f43f5e' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: 8,
                border: 'none',
                background: loading ? '#1a1d26' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color: loading ? '#4d5568' : '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(99,102,241,.4)',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#4d5568' }}>
          WWT Field Services · Powered by WWT
        </p>
      </div>
    </div>
  )
}
