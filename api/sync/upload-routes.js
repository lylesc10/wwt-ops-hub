/**
 * POST /api/sync/upload-routes
 * Body: { project_id, rows, fileName }
 *
 * Parses a route schedule Excel. Creates/updates routes and links site codes.
 */

import { query } from '../_lib/db.js'

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
  if (/^\d{5}$/.test(s)) return new Date(Math.round((parseInt(s) - 25569) * 86400 * 1000)).toISOString().split('T')[0]
  try { const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0] } catch {}
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const { project_id, rows, fileName = 'routes upload' } = req.body ?? {}
  if (!project_id)   return res.status(400).json({ message: 'project_id required' })
  if (!rows?.length) return res.status(400).json({ message: 'No rows received' })

  const keys = Object.keys(rows[0])
  const find = (...c) => keys.find(k => c.some(x => k.toLowerCase().includes(x.toLowerCase()))) ?? null

  const COL = {
    code:     find('BuildingCode','Building Code','Code'),
    route:    find('Route'),
    lvv_date: find('NewLVL_Date','NewLVLDate','LVV Date','LVL Date','Start Date'),
    ins_date: find('InstallStartDate','Install Start','INS Date'),
    state:    find('State'),
  }

  if (!COL.code || !COL.route) {
    return res.status(400).json({ message: `Could not find required columns. Need "BuildingCode" and "Route". Found: ${keys.slice(0,10).join(', ')}` })
  }

  const routeMap = new Map()
  for (const row of rows) {
    const code  = String(row[COL.code]  ?? '').trim()
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

  if (!routeMap.size) return res.status(400).json({ message: 'No routes found in file.' })

  let routesCreated = 0, routesUpdated = 0, sitesLinked = 0, colorIdx = 0

  const { rows: existingRoutes } = await query('SELECT id, name FROM routes WHERE project_id = $1', [project_id])
  const existingRouteMap = Object.fromEntries(existingRoutes.map(r => [r.name, r.id]))

  for (const [routeName, r] of routeMap) {
    const state  = r.state
    const region = getRegion(state)
    const color  = ROUTE_COLORS[colorIdx % ROUTE_COLORS.length]
    colorIdx++

    let weekEnd = null
    if (r.ins_start) {
      const d = new Date(r.ins_start + 'T12:00:00'); d.setDate(d.getDate() + 5)
      weekEnd = d.toISOString().split('T')[0]
    }

    let routeId = existingRouteMap[routeName]

    if (routeId) {
      await query(
        'UPDATE routes SET region=$1, states=$2, week_start=$3, week_end=$4, is_active=true, updated_at=$5 WHERE id=$6',
        [region, [state].filter(Boolean), r.lvv_start, weekEnd, new Date().toISOString(), routeId]
      )
      routesUpdated++
    } else {
      const { rows: [newRoute] } = await query(
        'INSERT INTO routes (project_id, name, region, states, color, week_start, week_end, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id',
        [project_id, routeName, region, [state].filter(Boolean), color, r.lvv_start, weekEnd]
      )
      routeId = newRoute?.id
      routesCreated++
    }

    if (!routeId) continue

    for (let i = 0; i < r.sites.length; i += 100) {
      const batch = r.sites.slice(i, i + 100)
      const res2 = await query(
        'UPDATE sites SET route_id=$1, updated_at=$2 WHERE project_id=$3 AND code = ANY($4)',
        [routeId, new Date().toISOString(), project_id, batch]
      )
      sitesLinked += res2.rowCount ?? 0
    }
  }

  await query(
    "INSERT INTO sync_log (project_id, field_name, new_value) VALUES ($1, 'route_upload', $2)",
    [project_id, `${routesCreated} created, ${routesUpdated} updated, ${sitesLinked} sites linked from ${fileName}`]
  )

  return res.json({
    ok:              true,
    routes_created:  routesCreated,
    routes_updated:  routesUpdated,
    sites_linked:    sitesLinked,
    total_routes:    routeMap.size,
    fileName,
    message: `${routeMap.size} routes processed · ${sitesLinked} sites linked · ${routesCreated} new routes, ${routesUpdated} updated`,
  })
}
