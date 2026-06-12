import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Table2, CalendarRange, Route,
  ClipboardList, Bell, Settings, LogOut, Zap,
  Code2, MessageSquare, TrendingUp, Users2, Grid3x3, HardHat, FileBarChart, BarChart3
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAlerts } from '@/hooks/useAlerts'
import styles from './Shell.module.css'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard'     },
  { to: '/sites',       icon: Table2,          label: 'Site Board'    },
  { to: '/gantt',       icon: CalendarRange,   label: 'Tech Gantt'    },
  { to: '/routes',      icon: Route,           label: 'Route Gantt'   },
  { to: '/work-orders', icon: ClipboardList,   label: 'Work Orders'   },
  { to: '/alerts',      icon: Bell,            label: 'Alerts',  badge: true },
  { to: '/comms',       icon: MessageSquare,   label: 'Comms'         },
  { to: '/staffing',    icon: Users2,          label: 'Staffing'      },
  { to: '/tech-pool',   icon: HardHat,         label: 'Tech Pool'     },
  { to: '/coverage',    icon: Grid3x3,         label: 'WO Coverage'   },
  { to: '/fn-analyzer',    icon: FileBarChart, label: 'FN Analyzer'   },
  { to: '/tech-analysis',   icon: BarChart3,     label: 'Tech Analysis' },
  { to: '/parsers',     icon: Code2,           label: 'Parser Studio' },
  { to: '/settings',    icon: Settings,        label: 'Settings'      },
]

export function Shell({ children }) {
  const { profile, signOut } = useAuth()
  const { count } = useAlerts()
  const navigate = useNavigate()

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>

        {/* Brand */}
        <div className={styles.brand}>
          <button className={styles.brandMark} onClick={() => navigate('/dashboard')}>R</button>
          <div className={styles.brandText}>
            <span className={styles.brandName}>Ops Manager</span>
            <span className={styles.brandSub}>Field Services</span>
            {import.meta.env.VITE_APP_ENV && import.meta.env.VITE_APP_ENV !== 'production' && (
              <span className={styles.envBadge} data-env={import.meta.env.VITE_APP_ENV}>
                {import.meta.env.VITE_APP_ENV === 'sandbox' ? 'SANDBOX' : 'DEV'}
              </span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className={styles.nav}>
          {NAV.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
            >
              <Icon size={16} className={styles.navIcon} />
              <span className={styles.navLabel}>{label}</span>
              {badge && count > 0 && (
                <span className={styles.badge}>{count > 99 ? '99+' : count}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className={styles.footer}>
          {profile && (
            <div className={styles.userRow}>
              <div className={styles.avatar}>
                {(profile.full_name ?? profile.email ?? 'U')[0].toUpperCase()}
              </div>
              <div className={styles.userText}>
                <p className={styles.userName}>{profile.full_name ?? profile.email}</p>
                <p className={styles.userRole}>{profile.role ?? 'user'}</p>
              </div>
              <button className={styles.signOut} onClick={handleSignOut} title="Sign out">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>

      </aside>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
