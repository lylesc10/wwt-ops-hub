import { useState, useEffect, useCallback, useRef } from 'react'
import { listWorkOrders } from '@/lib/fieldnation'

/**
 * Fetches the live FieldNation work order list for the "Work Order List" tab.
 *
 * Unlike most hooks in this app (which poll a local DB every 30-60s), this
 * hits FN's real, rate-limited API — so it fetches on demand only: once on
 * mount, and again whenever `filters` changes (debounced, so typing in a
 * search box or moving a date picker doesn't fire a request per keystroke).
 * Call `refetch()` for a manual refresh (e.g. after a modal save).
 *
 * FN's GET /workorders is NOT a plain status filter — two things must be
 * set explicitly or results come back wrong:
 *  - `list=<name>` selects a saved view (e.g. workorders_draft); with no
 *    `list` at all, FN defaults to `workorders_assigned`, which is usually
 *    near-empty — that silently made "no filter" look like "no results".
 *  - `columns=...` controls which nested objects come back per item; with
 *    no `columns`, FN returns a near-empty stub (id + schedule.status_id
 *    only) — no title, pay, location, or status.name.
 * Verified empirically against the sandbox; see STATUS_TO_FN_LIST below.
 *
 * @param {{ status?: string, project?: string, dateStart?: string, dateEnd?: string, page?: number, perPage?: number }} filters
 */

// Not every status the UI offers has a dedicated FN list — "published" and
// "routed" share one FN view, and "paid"/"cancelled" have none at all.
// Those fall back to 'workorders_all'; WorkOrderListView applies its own
// client-side status filter on top so the displayed results are still
// correctly narrowed either way.
const STATUS_TO_FN_LIST = {
  draft: 'workorders_draft',
  published: 'workorders_published_routed',
  routed: 'workorders_published_routed',
  assigned: 'workorders_assigned',
  work_done: 'workorders_work_done',
  approved: 'workorders_approved',
}

const LIST_COLUMNS = 'title,status,pay,location,schedule,routing'

export function useFieldNationWorkOrders(filters = {}) {
  const [workOrders, setWorkOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mock, setMock] = useState(false)

  const filterKey = JSON.stringify(filters)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const thisRequest = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const params = {
        list: STATUS_TO_FN_LIST[filters.status] ?? 'workorders_all',
        columns: LIST_COLUMNS,
        page: filters.page ?? 1,
        per_page: filters.perPage ?? 50,
      }
      if (filters.project && filters.project !== 'all') params.project = filters.project
      if (filters.dateStart) params.date_start = filters.dateStart
      if (filters.dateEnd) params.date_end = filters.dateEnd

      const data = await listWorkOrders(params)
      if (thisRequest !== requestId.current) return // a newer request superseded this one

      setWorkOrders(data.results ?? [])
      setTotal(data.metadata?.total ?? data.results?.length ?? 0)
      setMock(!!data.mock)
    } catch (e) {
      if (thisRequest !== requestId.current) return
      setError(e.message || 'Failed to load work orders')
      setWorkOrders([])
      setTotal(0)
    } finally {
      if (thisRequest === requestId.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  return { workOrders, total, loading, error, mock, refetch: load }
}
