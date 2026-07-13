import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Shell } from './components/Shell'

// Route-level code splitting — each page becomes its own chunk, fetched only
// when its route is visited. Keeps the main bundle from pulling in every
// page's dependencies up front (xlsx, leaflet/react-leaflet, docx, etc.).
const Dashboard         = lazy(() => import('./pages/Dashboard'))
const PNCDashboard      = lazy(() => import('./pages/PNCDashboard'))
const SiteBoard         = lazy(() => import('./pages/SiteBoard'))
const TechGantt         = lazy(() => import('./pages/TechGantt'))
const RouteGantt        = lazy(() => import('./pages/RouteGantt'))
const RoutePlanList     = lazy(() => import('./pages/route-planning/RoutePlanList'))
const CreateRoutePlan   = lazy(() => import('./pages/route-planning/CreateRoutePlan'))
const RoutePlanBuilder  = lazy(() => import('./pages/route-planning/RoutePlanBuilder'))
const ScheduleOverview  = lazy(() => import('./pages/route-planning/ScheduleOverview'))
const WorkOrders        = lazy(() => import('./pages/WorkOrders'))
const Alerts            = lazy(() => import('./pages/Alerts'))
const Comms             = lazy(() => import('./pages/Comms'))
const Staffing          = lazy(() => import('./pages/Staffing'))
const TechPool          = lazy(() => import('./pages/TechPool'))
const WOCoverage        = lazy(() => import('./pages/WOCoverage'))
const FNExportAnalyzer  = lazy(() => import('./pages/FNExportAnalyzer'))
const TechAnalysis      = lazy(() => import('./pages/TechAnalysis'))
const DocGen            = lazy(() => import('./pages/docgen/DocGen'))
const ParserStudio      = lazy(() => import('./pages/ParserStudio'))
const Settings          = lazy(() => import('./pages/Settings'))

function RouteFallback() {
  return (
    <div style={{ padding: 32, color: 'var(--text-secondary)', fontSize: 14 }}>
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/*" element={
        <Shell>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"    element={<Dashboard />} />
              <Route path="pnc-dashboard" element={<PNCDashboard />} />
              <Route path="sites"        element={<SiteBoard />} />
              <Route path="gantt"        element={<TechGantt />} />
              <Route path="routes"       element={<RouteGantt />} />
              <Route path="route-planning"          element={<RoutePlanList />} />
              <Route path="route-planning/new"      element={<CreateRoutePlan />} />
              <Route path="route-planning/overview" element={<ScheduleOverview />} />
              <Route path="route-planning/:id"      element={<RoutePlanBuilder />} />
              <Route path="work-orders"  element={<WorkOrders />} />
              <Route path="alerts"       element={<Alerts />} />
              <Route path="comms"        element={<Comms />} />
              <Route path="staffing"     element={<Staffing />} />
              <Route path="tech-pool"    element={<TechPool />} />
              <Route path="coverage"     element={<WOCoverage />} />
              <Route path="fn-analyzer"  element={<FNExportAnalyzer />} />
              <Route path="tech-analysis" element={<TechAnalysis />} />
              <Route path="doc-gen/*"    element={<DocGen />} />
              <Route path="parsers"      element={<ParserStudio />} />
              <Route path="settings"     element={<Settings />} />
              <Route path="*"            element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </Shell>
      } />
    </Routes>
  )
}
