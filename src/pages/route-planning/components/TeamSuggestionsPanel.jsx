import { AlertTriangle, MapPin, Star, Users, Wand2 } from 'lucide-react'
import styles from './TeamSuggestionsPanel.module.css'

function scoreClass(score) {
  if (score >= 80) return styles.scoreGood
  if (score >= 60) return styles.scoreFair
  return styles.scoreLow
}

function MemberRow({ member }) {
  const isLead = member.role === 'lead'
  return (
    <div className={styles.member}>
      <div className={styles.memberTop}>
        {isLead && <Star size={12} className={styles.leadStar} />}
        <span className={styles.memberName}>{member.tech_name}</span>
        {isLead && <span className={styles.leadBadge}>Lead</span>}
        {member.location && (
          <span className={styles.memberLoc}><MapPin size={10} />{member.location}</span>
        )}
        <div className={styles.scores}>
          <span className={`${styles.score} ${scoreClass(member.scores.proximity)}`}>Prox {member.scores.proximity}</span>
          <span className={`${styles.score} ${scoreClass(member.scores.availability)}`}>Avail {member.scores.availability}</span>
        </div>
      </div>
      {member.cautions.length > 0 && (
        <div className={styles.cautions}>
          {member.cautions.map((c, i) => (
            <div key={`${c.type}-${i}`} className={c.severity === 'red' ? styles.cautionRed : styles.cautionOrange}>
              <AlertTriangle size={10} />
              {c.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TeamSuggestionsPanel({ data, onAcceptAll, onDismiss, accepting, siteNames }) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}><Wand2 size={13} />Team Suggestions</span>
        <div className={styles.headerBtns}>
          <button type="button" className={styles.acceptBtn} onClick={onAcceptAll} disabled={accepting}>
            {accepting ? 'Creating…' : 'Accept All'}
          </button>
          <button type="button" className={styles.dismissBtn} onClick={onDismiss} disabled={accepting}>
            Dismiss
          </button>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <div className={styles.warnings}>
          {data.warnings.map((w, i) => (
            <div key={i} className={styles.warning}><AlertTriangle size={10} />{w}</div>
          ))}
        </div>
      )}

      {data.teams.map((team) => (
        <div key={team.name} className={styles.team} style={{ borderLeftColor: team.color }}>
          <div className={styles.teamTop}>
            <Users size={13} />
            <span className={styles.teamName}>{team.name}</span>
            {team.region_label && <span className={styles.regionBadge}>{team.region_label}</span>}
          </div>
          {team.site_ids?.length > 0 && siteNames && (
            <div className={styles.teamSites}>
              <MapPin size={11} />
              {team.site_ids.map((sid) => (
                <span key={sid} className={styles.siteBadge}>
                  {siteNames.get(sid) || sid.slice(0, 8)}
                </span>
              ))}
            </div>
          )}
          <div className={styles.members}>
            {team.members.map((m) => <MemberRow key={m.tech_id} member={m} />)}
          </div>
        </div>
      ))}

      {data.unassigned_techs.length > 0 && (
        <div className={styles.unassigned}>
          <p className={styles.unassignedTitle}>Unassigned Techs ({data.unassigned_techs.length})</p>
          {data.unassigned_techs.map((m) => <MemberRow key={m.tech_id} member={m} />)}
        </div>
      )}
    </div>
  )
}
