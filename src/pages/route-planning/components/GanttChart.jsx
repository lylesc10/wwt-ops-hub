import { useMemo, useState } from 'react'
import {
  eachDayOfInterval, differenceInCalendarDays, parseISO, format, isSameMonth, isWeekend,
} from 'date-fns'
import styles from './GanttChart.module.css'

/**
 * Generic day-scale gantt.
 * rows: [{ id, label, sublabel?, color, bars: [{ id, start, end, label?, hours?, color, isTravel? }] }]
 * Dates are 'YYYY-MM-DD'.
 */
export default function GanttChart({
  rows,
  startDate,
  endDate,
  emptyMessage = 'No data to display.',
  rowLabelHeader = 'Name',
}) {
  const [popover, setPopover] = useState(null)

  const rangeStart = parseISO(startDate)
  const rangeEnd = parseISO(endDate)

  const days = useMemo(
    () => (!isNaN(rangeEnd.getTime()) && rangeEnd >= rangeStart
      ? eachDayOfInterval({ start: rangeStart, end: rangeEnd })
      : []),
    [startDate, endDate], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const totalDays = days.length

  if (totalDays === 0) {
    return <div className={styles.emptyState}>Invalid date range</div>
  }

  function handleBarClick(e, bar) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setPopover({
      bar,
      x: Math.min(rect.left, window.innerWidth - 240),
      y: rect.bottom + 4,
    })
  }

  const colWidth = Math.max(100 / totalDays, 2)

  return (
    <div className={styles.wrap} onClick={() => setPopover(null)}>
      <div style={{ minWidth: Math.max(800, totalDays * 28 + 192) }}>
        {/* Column headers */}
        <div className={styles.headerRow}>
          <div className={styles.rowLabelHeader}>{rowLabelHeader}</div>
          <div className={styles.dayCols}>
            {days.map((day, i) => {
              const showMonth = i === 0 || !isSameMonth(day, days[i - 1])
              return (
                <div
                  key={day.toISOString()}
                  className={`${styles.dayCol} ${isWeekend(day) ? styles.weekend : ''}`}
                  style={{ width: `${colWidth}%` }}
                >
                  {showMonth && <div className={styles.monthLabel}>{format(day, 'MMM')}</div>}
                  <div className={styles.dayNum}>{format(day, 'd')}</div>
                  <div className={styles.dayLetter}>{format(day, 'EEE')[0]}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div className={styles.emptyState}>{emptyMessage}</div>
        ) : (
          rows.map((row, rowIdx) => (
            <div key={row.id} className={`${styles.row} ${rowIdx % 2 === 1 ? styles.rowAlt : ''}`}>
              <div className={styles.rowLabel}>
                <div className={styles.rowLabelMain}>
                  <span className={styles.rowDot} style={{ backgroundColor: row.color }} />
                  <span className={styles.rowName}>{row.label}</span>
                </div>
                {row.sublabel && <div className={styles.rowSub}>{row.sublabel}</div>}
              </div>
              <div className={styles.barArea} style={{ minWidth: totalDays * 28 }}>
                {row.bars.map((bar) => (
                  <BarBlock
                    key={bar.id}
                    bar={bar}
                    rangeStart={rangeStart}
                    totalDays={totalDays}
                    onBarClick={handleBarClick}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {popover && (
        <div className={styles.popover} style={{ left: popover.x, top: popover.y }}>
          <div className={styles.popoverTitle}>{popover.bar.label ?? 'Stop'}</div>
          <div className={styles.popoverGrid}>
            <span className={styles.popoverKey}>Start</span>
            <span>{format(parseISO(popover.bar.start), 'MMM d, yyyy')}</span>
            <span className={styles.popoverKey}>End</span>
            <span>{format(parseISO(popover.bar.end), 'MMM d, yyyy')}</span>
            {popover.bar.hours != null && (
              <>
                <span className={styles.popoverKey}>Est. hours</span>
                <span>{popover.bar.hours}h</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function BarBlock({ bar, rangeStart, totalDays, onBarClick }) {
  const layout = useMemo(() => {
    const start = parseISO(bar.start)
    const end = parseISO(bar.end)
    const startOffset = Math.max(0, differenceInCalendarDays(start, rangeStart))
    const endOffset = differenceInCalendarDays(end, rangeStart)
    if (endOffset < 0 || startOffset >= totalDays) return null
    const clampedDays = Math.min(endOffset, totalDays - 1) - startOffset + 1
    if (clampedDays <= 0) return null
    return {
      leftPct: (startOffset / totalDays) * 100,
      widthPct: (clampedDays / totalDays) * 100,
      spanDays: clampedDays,
    }
  }, [bar.start, bar.end, rangeStart, totalDays])

  if (!layout) return null

  return (
    <button
      type="button"
      className={`${styles.bar} ${bar.isTravel ? styles.barTravel : ''}`}
      style={{
        left: `${layout.leftPct}%`,
        width: `${layout.widthPct}%`,
        backgroundColor: bar.color,
      }}
      onClick={(e) => onBarClick(e, bar)}
      title={bar.label ?? 'Stop'}
    >
      {!bar.isTravel && layout.spanDays >= 2 && (
        <span className={styles.barLabel}>{bar.label ?? 'Stop'}</span>
      )}
      {!bar.isTravel && layout.spanDays >= 3 && bar.hours != null && (
        <span className={styles.barHours}>{bar.hours}h</span>
      )}
    </button>
  )
}
