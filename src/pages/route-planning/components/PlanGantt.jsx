import { useMemo } from 'react'
import GanttChart from './GanttChart'

/** Timeline tab of the plan builder — one gantt row per team. */
export default function PlanGantt({ teams, startDate, endDate }) {
  const rows = useMemo(() => teams.map((team) => {
    const bars = []
    for (const stop of team.stops) {
      if (stop.travel_date) {
        bars.push({
          id: `${stop.id}-travel`,
          start: stop.travel_date,
          end: stop.travel_date,
          label: 'Travel',
          color: team.color,
          isTravel: true,
        })
      }
      if (stop.scheduled_start && stop.scheduled_end) {
        bars.push({
          id: stop.id,
          start: stop.scheduled_start,
          end: stop.scheduled_end,
          label: stop.site_name ?? 'Stop',
          hours: stop.estimated_hours ?? undefined,
          color: team.color,
        })
      }
    }
    return {
      id: team.id,
      label: team.name,
      sublabel: `${team.stops.length} stop${team.stops.length !== 1 ? 's' : ''}`,
      color: team.color,
      bars,
    }
  }), [teams])

  if (!endDate) {
    return <p style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Set an end date to view the timeline.
    </p>
  }

  return (
    <GanttChart
      rows={rows}
      startDate={startDate}
      endDate={endDate}
      rowLabelHeader="Team"
      emptyMessage="No teams created yet. Add a team to see the timeline."
    />
  )
}
