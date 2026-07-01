import { supa as supabase } from '../../_lib/db.js'
/**
 * POST /api/sync/upload-routes
 * Body: { project_id, rows, fileName }
 *
 * Parses a route schedule Excel (like PNC-RevisedSchedule).
 * Creates or updates routes and links site codes to them.
 *
 * Expected columns (flexible detection):
 *   BuildingCode, Route, LVVRouteWeek, INSRouteWeek,
 *   NewLVL_Date, InstallStartDate, State, City
 */



const ROUTE_COLORS = [
  '#6366f1','#10b981','#f59e0b','#3b82f6','#a855f7','#06b6d4',
  '#f97316','#ec4899','#14b8a6','#8b5cf6','#84cc16','#f43f5e',
  '#0ea5e9','#d97706','#7c3aed','#16a34a','#dc2626','#2563eb',
]

const AIRPORT_STATES = {
  ABQ:'NM',ACY:'NJ',ATL:'GA',AZO:'MI',BCT:'FL',BHM:'AL',BNA:'TN',BOS:'MA',
  BWI:'MD',CLE:'OH',CLT:'NC',CMH:'OH',CVG:'OH',DAL:'TX',DCA:'DC',DEN:'CO',
  DFW:'TX',DTW:'MI',ELP:'TX',ERI:'PA',EWR:'NJ',FAT:'CA',FLL:'FL',GRR:'MI',
  GSP:'SC',HOU:'TX',HPN:'NY',HSV:'AL',IAD:'VA',IAH:'TX',IND:'IN',JAX:'FL',
  JFK:'NY',LAN:'MI',LAS:'NV',LAX:'CA',LIT:'AR',MCI:'MO',MCO:'FL',MDT:'PA',
  MDW:'IL',MEM:'TN',MIA:'FL',MKE:'WI',MKG:'MI',MSP:'MN',MSY:'LA',OAK:'CA',
  OCE:'VA',OKC:'OK',ORD:'IL',ORF:'VA',PBI:'FL',PDX:'OR',PHL:'PA',PHX:'AZ',
  PIT:'PA',PNS:'FL',RDU:'NC',RIC:'VA',ROC:'NY',RSW:'FL',SAT:'TX',SAV:'GA',
  SDF:'KY',SEA:'WA',SFO:'CA',SJC:'CA',SLC:'UT',SMF:'CA',SNA:'CA',SRQ:'FL',
  STL:'MO',SWF:'NY',SYR:'NY',TPA:'FL',TRI:'TN',TUL:'OK',TYS:'TN',DAY:'OH',
  CAE:'SC',PMH:'OH',
}

function getRegion(state) {
  const eastern  = new Set(['ME','NH','VT','MA','RI','CT','NY','NJ','PA','DE','MD','DC','VA','WV','NC','SC','GA','FL'])
  const central  = new Set(['OH','MI','IN','IL','WI','MN','IA','MO','ND','SD','NE','KS','KY','TN','AL','MS','AR','LA','OK','TX'])
  const mountain = new Set(['MT','ID','WY','CO','NM','AZ','UT','NV'])
  const pacific  = new Set(['WA','OR','CA','AK','HI'])
  if (eastern.has(state))  return 'Eastern'
  if (central.has(state))  return 'Central'
  if (mountain.has(state)) return 'Mountain'
  if (pacific.has(state))  return 'Pacific'
  return 'Other'
}

function fmtDate(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s || s === 'null' || s.toUpperCase() === 'TBD') return null
  if (/^\d{5}$/.test(s)) {
    return new Date(Math.round((parseInt(s) - 25569) * 86400 * 1000)).toISOString().split('T')[0]
  }
  try {
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  } catch {}
  return null
}

function parseWeekNum(routeWeekStr) {
  if (!routeWeekStr) return null
  const m = String(routeWeekStr).match(/\((\d+)\)/)
  return m ? parseInt(m[1]) : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, rows, fileName = 'routes upload' } = req.body ?? {}
  if (!project_id)   return res.status(400).json({ message: 'project_id required' })
  if (!rows?.length) return res.status(400).json({ message: 'No rows received' })

  // ── Detect columns ────────────────────────────────────────
  const keys = Object.keys(rows[0])
  const find = (...c) => keys.find(k => c.some(x => k.toLowerCase().includes(x.toLowerCase()))) ?? null

  const COL = {
    code:       find('BuildingCode','Building Code','Code'),
    route:      find('Route'),
    lvv_week:   find('LVVRouteWeek','LVV Route Week'),
    ins_week:   find('INSRouteWeek','INS Route Week'),
    lvv_date:   find('NewLVL_Date','NewLVLDate','LVV Date','LVL Date','Start Date'),
    ins_date:   find('InstallStartDate','Install Start','INS Date'),
    state:      find('State'),
    city:       find('City'),
  }

  if (!COL.code || !COL.route) {
    return res.status(400).json({
      message: `Could not find required columns. Need "BuildingCode" and "Route". Found: ${keys.slice(0,10).join(', ')}`
    })
  }

  // ── Parse rows into route → sites map ────────────────────
  const routeMap = new Map() // routeName → { sites, lvv_start, ins_start, state }

  for (const row of rows) {
    const code  = String(row[COL.code] ?? '').trim()
    const route = String(row[COL.route] ?? '').trim()
    if (!code || !route) continue

    if (!routeMap.has(route)) {
      routeMap.set(route, {
        name:      route,
        sites:     [],
        lvv_start: null,
        ins_start: null,
        state:     AIRPORT_STATES[route.slice(0,3).toUpperCase()] ?? (COL.state ? String(row[COL.state] ?? '').trim() : ''),
      })
    }

    const r = routeMap.get(route)
    r.sites.push(code)

    const lvvDate = fmtDate(COL.lvv_date ? row[COL.lvv_date] : null)
    const insDate = fmtDate(COL.ins_date ? row[COL.ins_date] : null)

    if (lvvDate && (!r.lvv_start || lvvDate < r.lvv_start)) r.lvv_start = lvvDate
    if (insDate && (!r.ins_start || insDate < r.ins_start)) r.ins_start = insDate
  }

  if (!routeMap.size) {
    return res.status(400).json({ message: 'No routes found in file. Check that BuildingCode and Route columns exist.' })
  }

  // ── Upsert routes ─────────────────────────────────────────
  let routesCreated = 0, routesUpdated = 0, sitesLinked = 0
  let colorIdx = 0

  // Load existing routes for this project
  const { data: existingRoutes } = await supabase
    .from('routes')
    .select('id, name')
    .eq('project_id', project_id)

  const existingRouteMap = Object.fromEntries((existingRoutes ?? []).map(r => [r.name, r.id]))

  for (const [routeName, r] of routeMap) {
    const state  = r.state
    const region = getRegion(state)
    const color  = ROUTE_COLORS[colorIdx % ROUTE_COLORS.length]
    colorIdx++

    // week_end = ins_start + 5 days
    let weekEnd = null
    if (r.ins_start) {
      const d = new Date(r.ins_start + 'T12:00:00')
      d.setDate(d.getDate() + 5)
      weekEnd = d.toISOString().split('T')[0]
    }

    let routeId = existingRouteMap[routeName]

    if (routeId) {
      // Update existing
      await supabase.from('routes').update({
        region,
        states:      [state].filter(Boolean),
        week_start:  r.lvv_start,
        week_end:    weekEnd,
        is_active:   true,
        updated_at:  new Date().toISOString(),
      }).eq('id', routeId)
      routesUpdated++
    } else {
      // Create new
      const { data: newRoute } = await supabase.from('routes').insert({
        project_id,
        name:       routeName,
        region,
        states:     [state].filter(Boolean),
        color,
        week_start: r.lvv_start,
        week_end:   weekEnd,
        is_active:  true,
      }).select('id').single()
      routeId = newRoute?.id
      routesCreated++
    }

    if (!routeId) continue

    // Link sites in batches of 100
    const codes = r.sites
    for (let i = 0; i < codes.length; i += 100) {
      const batch = codes.slice(i, i + 100)
      const { count } = await supabase
        .from('sites')
        .update({ route_id: routeId, updated_at: new Date().toISOString() })
        .eq('project_id', project_id)
        .in('code', batch)
        .select('id', { count: 'exact', head: true })
      sitesLinked += count ?? 0
    }
  }

  // Log
  await supabase.from('sync_log').insert({
    project_id,
    field_name: 'route_upload',
    new_value:  `${routesCreated} created, ${routesUpdated} updated, ${sitesLinked} sites linked from ${fileName}`,
  })

  return res.json({
    ok:            true,
    routes_created: routesCreated,
    routes_updated: routesUpdated,
    sites_linked:   sitesLinked,
    total_routes:   routeMap.size,
    fileName,
    message: `${routeMap.size} routes processed · ${sitesLinked} sites linked · ${routesCreated} new routes, ${routesUpdated} updated`,
  })
}
