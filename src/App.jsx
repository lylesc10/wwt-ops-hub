import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Shell } from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SiteBoard from './pages/SiteBoard'
import TechGantt from './pages/TechGantt'
import RouteGantt from './pages/RouteGantt'
import WorkOrders from './pages/WorkOrders'
import Alerts from './pages/Alerts'
import Settings from './pages/Settings'
import ParserStudio from './pages/ParserStudio'
import Comms from './pages/Comms'
import Staffing from './pages/Staffing'
import TechPool from './pages/TechPool'
import WOCoverage from './pages/WOCoverage'
import FNExportAnalyzer from './pages/FNExportAnalyzer'
import TechAnalysis from './pages/TechAnalysis'
import PNCDashboard from './pages/PNCDashboard'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:12, letterSpacing:'0.08em' }}>
        LOADING…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <RequireAuth>
          <Shell>
            <Routes>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"    element={<Dashboard />} />
              <Route path="sites"        element={<SiteBoard />} />
              <Route path="gantt"        element={<TechGantt />} />
              <Route path="routes"       element={<RouteGantt />} />
              <Route path="work-orders"  element={<WorkOrders />} />
              <Route path="alerts"       element={<Alerts />} />
              <Route path="comms"        element={<Comms />} />
              <Route path="staffing"     element={<Staffing />} />
              <Route path="tech-pool"     element={<TechPool />} />
              <Route path="coverage"     element={<WOCoverage />} />
              <Route path="fn-analyzer"   element={<FNExportAnalyzer />} />
              <Route path="tech-analysis"  element={<TechAnalysis />} />
              <Route path="pnc-dashboard"  element={<PNCDashboard />} />
              <Route path="parsers"      element={<ParserStudio />} />
              <Route path="settings"     element={<Settings />} />
              <Route path="*"            element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Shell>
        </RequireAuth>
      } />
    </Routes>
  )
}
