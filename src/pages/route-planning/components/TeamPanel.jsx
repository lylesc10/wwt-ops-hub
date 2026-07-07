import { useState } from 'react'
import { Plus, Pencil, Trash2, Users, ChevronDown, ChevronUp } from 'lucide-react'
import TeamForm from './TeamForm'
import StopCard from './StopCard'
import styles from './Sidebar.module.css'

export default function TeamPanel({
  teams,
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam,
  onUpdateStop,
  onDeleteStop,
  onMoveStopUp,
  onMoveStopDown,
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState(null)
  const [expandedTeams, setExpandedTeams] = useState(() => new Set(teams.map((t) => t.id)))

  function toggleExpand(teamId) {
    setExpandedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  async function handleCreateTeam(data) {
    await onCreateTeam(data)
    setShowForm(false)
  }

  async function handleUpdateTeam(data) {
    if (!editingTeamId) return
    await onUpdateTeam(editingTeamId, data)
    setEditingTeamId(null)
  }

  function handleDeleteTeam(teamId, teamName) {
    if (window.confirm(`Delete team "${teamName}"? All stops will be removed.`)) {
      onDeleteTeam(teamId)
    }
  }

  const sortedStops = (team) => [...team.stops].sort((a, b) => a.stop_order - b.stop_order)

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Teams ({teams.length})</h3>
        <button
          type="button"
          className={styles.smallBtn}
          onClick={() => { setShowForm(true); setEditingTeamId(null) }}
        >
          <Plus size={12} />
          Add Team
        </button>
      </div>

      {showForm && !editingTeamId && (
        <TeamForm onSave={handleCreateTeam} onCancel={() => setShowForm(false)} />
      )}

      {teams.length === 0 && !showForm && (
        <p className={styles.sectionEmpty}>No teams created yet. Add a team to start assigning sites.</p>
      )}

      {teams.map((team) => {
        const isExpanded = expandedTeams.has(team.id)
        const stops = sortedStops(team)

        if (editingTeamId === team.id) {
          return (
            <TeamForm
              key={team.id}
              existingTeam={team}
              onSave={handleUpdateTeam}
              onCancel={() => setEditingTeamId(null)}
            />
          )
        }

        return (
          <div key={team.id} className={styles.card}>
            <button type="button" className={styles.teamHeader} onClick={() => toggleExpand(team.id)}>
              <span className={styles.teamDot} style={{ backgroundColor: team.color }} />
              <span className={styles.teamName}>{team.name}</span>
              <span className={styles.badge}><Users size={9} />{team.members.length}</span>
              <span className={styles.badge}>{stops.length} stop{stops.length !== 1 ? 's' : ''}</span>
              {isExpanded
                ? <ChevronUp size={14} className={styles.chevron} />
                : <ChevronDown size={14} className={styles.chevron} />}
            </button>

            {isExpanded && (
              <div className={styles.teamBody}>
                <div className={styles.teamActions}>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => { setEditingTeamId(team.id); setShowForm(false) }}
                  >
                    <Pencil size={11} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.smallBtn} ${styles.smallDanger}`}
                    onClick={() => handleDeleteTeam(team.id, team.name)}
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                </div>

                {team.members.length > 0 && (
                  <div className={styles.memberChips}>
                    {team.members.map((m) => (
                      <span key={m.technician_id} className={styles.badge}>{m.tech_name}</span>
                    ))}
                  </div>
                )}

                {stops.length === 0 ? (
                  <p className={styles.sectionEmpty}>No stops assigned yet.</p>
                ) : (
                  <div className={styles.stopList}>
                    {stops.map((stop, idx) => (
                      <StopCard
                        key={stop.id}
                        stop={stop}
                        isFirst={idx === 0}
                        isLast={idx === stops.length - 1}
                        onUpdate={onUpdateStop}
                        onDelete={onDeleteStop}
                        onMoveUp={() => onMoveStopUp(team.id, stop.id)}
                        onMoveDown={() => onMoveStopDown(team.id, stop.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
