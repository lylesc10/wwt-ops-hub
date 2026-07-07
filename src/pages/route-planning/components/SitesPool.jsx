import { MapPin } from 'lucide-react'
import styles from './Sidebar.module.css'

/** Unassigned sites with a per-site "assign to team" select. */
export default function SitesPool({ sites, teams, onAssign }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Unassigned Sites ({sites.length})</h3>
      </div>
      {sites.length === 0 ? (
        <p className={styles.sectionEmpty}>All sites have been assigned.</p>
      ) : (
        sites.map((site) => (
          <div key={site.id} className={`${styles.card} ${styles.cardPad}`}>
            <div className={styles.siteRow}>
              <MapPin size={13} className={styles.siteIcon} />
              <div className={styles.siteBody}>
                <p className={styles.siteName}>{site.code ? `${site.code} — ${site.name}` : site.name}</p>
                {(site.city || site.state) && (
                  <p className={styles.siteMeta}>{[site.city, site.state].filter(Boolean).join(', ')}</p>
                )}
                <p className={styles.siteMeta}>{site.project_name}</p>
              </div>
            </div>
            {teams.length > 0 && (
              <select
                className={styles.select}
                value=""
                onChange={(e) => { if (e.target.value) onAssign(site.id, e.target.value) }}
              >
                <option value="">Assign to…</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            )}
          </div>
        ))
      )}
    </div>
  )
}
