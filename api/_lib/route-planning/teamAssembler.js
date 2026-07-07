/**
 * Team assembler — groups available techs into suggested teams using
 * geographic clustering and deterministic scoring (proximity / availability).
 * Port of field-services team_assembler.py + dispatch/scoring.py.
 *
 * Ops-hub techs have no skills catalog, so the skills dimension scores 100
 * for everyone; proximity and availability drive the ranking.
 */

import { haversineMiles } from './geo.js'

const TEAM_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
]

const PROXIMITY_BANDS = [
  [30, 100], [100, 80], [200, 60], [500, 40],
]
const PROXIMITY_FAR_SCORE = 20
const PROXIMITY_FAR_THRESHOLD = 500

// ── scoring ───────────────────────────────────────────────────────────────────

function scoreProximity(tech, siteCoords) {
  const cautions = []
  if (tech.lat == null || tech.lng == null) {
    cautions.push({ type: 'no_location', message: `${tech.name} has no location set`, severity: 'orange' })
    return { score: 0, cautions }
  }
  if (!siteCoords.length) return { score: 0, cautions }

  const minDist = Math.min(...siteCoords.map((c) => haversineMiles(tech.lat, tech.lng, c.lat, c.lng)))
  let score = PROXIMITY_FAR_SCORE
  for (const [maxMiles, bandScore] of PROXIMITY_BANDS) {
    if (minDist < maxMiles) { score = bandScore; break }
  }
  if (minDist > PROXIMITY_FAR_THRESHOLD) {
    cautions.push({
      type: 'distance',
      message: `${tech.name} is ${Math.round(minDist)}mi from nearest site`,
      severity: 'orange',
    })
  }
  return { score, cautions }
}

function scoreAvailability(tech, startDate, endDate) {
  const cautions = []
  let score = 100

  for (const pto of tech.ptoRanges ?? []) {
    const endOk = !endDate || pto.start <= endDate
    if (endOk && pto.end >= startDate) {
      score -= 50
      cautions.push({
        type: 'pto_overlap',
        message: `PTO ${pto.start} - ${pto.end} overlaps plan window`,
        severity: 'red',
      })
    }
  }

  const active = tech.activeAssignments ?? 0
  score -= active * 15
  if (active >= 2) {
    score -= 30
    cautions.push({
      type: 'overloaded',
      message: `${tech.name} has ${active} active assignments`,
      severity: 'orange',
    })
  }
  return { score: Math.max(score, 0), cautions }
}

function scoreTech(tech, siteCoords, startDate, endDate) {
  const prox = scoreProximity(tech, siteCoords)
  const avail = scoreAvailability(tech, startDate, endDate)
  const skills = 100
  const overall = (prox.score * 34 + skills * 33 + avail.score * 33) / 100
  return {
    proximity: Math.round(prox.score * 10) / 10,
    skills,
    availability: Math.round(avail.score * 10) / 10,
    overall: Math.round(overall * 10) / 10,
    cautions: [...prox.cautions, ...avail.cautions],
  }
}

// ── clustering ────────────────────────────────────────────────────────────────

/** Greedy farthest-first geographic clustering of sites into n groups. */
function clusterSites(sites, nClusters) {
  const geocoded = sites.filter((s) => s.lat != null && s.lng != null)
  const nonGeocoded = sites.filter((s) => s.lat == null || s.lng == null)
  if (!geocoded.length) return sites.length ? [sites] : []

  nClusters = Math.min(nClusters, geocoded.length)
  if (nClusters <= 0) return sites.length ? [sites] : []

  const seeds = [geocoded[0]]
  while (seeds.length < nClusters) {
    let best = null
    let bestDist = -1
    for (const site of geocoded) {
      if (seeds.includes(site)) continue
      const minToSeeds = Math.min(...seeds.map((s) => haversineMiles(site.lat, site.lng, s.lat, s.lng)))
      if (minToSeeds > bestDist) { bestDist = minToSeeds; best = site }
    }
    if (!best) break
    seeds.push(best)
  }

  const clusters = seeds.map(() => [])
  for (const site of geocoded) {
    let bestIdx = 0
    let bestDist = Infinity
    seeds.forEach((seed, idx) => {
      const d = haversineMiles(site.lat, site.lng, seed.lat, seed.lng)
      if (d < bestDist) { bestDist = d; bestIdx = idx }
    })
    clusters[bestIdx].push(site)
  }
  nonGeocoded.forEach((site, i) => clusters[i % clusters.length].push(site))
  return clusters.filter((c) => c.length)
}

function regionLabel(sites) {
  const states = [...new Set(sites.map((s) => s.state).filter(Boolean))].sort()
  return states.length ? states.join(' / ') : null
}

// ── main ──────────────────────────────────────────────────────────────────────

/**
 * @param techs [{ id, name, location, lat, lng, ptoRanges, activeAssignments }]
 * @param sites [{ id, name, city, state, lat, lng }]
 * @param techsPerSite team size
 * @param startDate/endDate plan window ('YYYY-MM-DD')
 * @returns { teams, unassigned_techs, warnings }
 */
export function assembleTeams({ techs, sites, techsPerSite, startDate, endDate }) {
  const warnings = []

  const asMember = (tech, scores, role = 'member') => ({
    tech_id: tech.id,
    tech_name: tech.name,
    location: tech.location ?? null,
    role,
    overall_score: scores.overall,
    scores: { proximity: scores.proximity, skills: scores.skills, availability: scores.availability },
    cautions: scores.cautions,
  })
  const zeroScores = { proximity: 0, skills: 0, availability: 0, overall: 0, cautions: [] }

  if (!techs.length) {
    warnings.push('No technicians available for team assembly.')
    return { teams: [], unassigned_techs: [], warnings }
  }
  if (!sites.length) {
    warnings.push('No sites available for team assembly.')
    return { teams: [], unassigned_techs: [], warnings }
  }

  techsPerSite = Math.max(techsPerSite ?? 1, 1)
  const fullTeamsPossible = Math.floor(techs.length / techsPerSite)
  if (fullTeamsPossible <= 0) {
    warnings.push(`Not enough technicians to form a full team of ${techsPerSite} (have ${techs.length}).`)
    return { teams: [], unassigned_techs: techs.map((t) => asMember(t, zeroScores)), warnings }
  }

  const neededForAll = sites.length * techsPerSite
  if (techs.length < neededForAll) {
    warnings.push(`Not enough technicians for all sites: need ${neededForAll}, have ${techs.length}.`)
  }
  const remainder = techs.length - fullTeamsPossible * techsPerSite
  if (remainder > 0) {
    warnings.push(`${remainder} technician(s) unassigned — not enough for an additional full team of ${techsPerSite}.`)
  }

  const clusters = clusterSites(sites, fullTeamsPossible)
  const contexts = clusters.map((cluster) =>
    cluster.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat, lng: s.lng })))

  // scoresMatrix[clusterIdx][techIdx]
  const scoresMatrix = contexts.map((siteCoords) =>
    techs.map((t) => scoreTech(t, siteCoords, startDate, endDate)))

  const assigned = new Set()
  const teams = []
  const assignedClusters = new Set()

  clusters.forEach((cluster, clusterIdx) => {
    const clusterScores = scoresMatrix[clusterIdx]
    const ranked = techs.map((_, i) => i).sort((a, b) => clusterScores[b].overall - clusterScores[a].overall)

    const picks = []
    for (const techIdx of ranked) {
      if (assigned.has(techIdx)) continue
      if (picks.length >= techsPerSite) break
      picks.push(techIdx)
      assigned.add(techIdx)
    }

    if (picks.length < techsPerSite) {
      // Can't fully staff — release picks; sites get redistributed below
      picks.forEach((i) => assigned.delete(i))
      return
    }

    const leadPos = picks.reduce(
      (best, _, i) => (clusterScores[picks[i]].skills > clusterScores[picks[best]].skills ? i : best), 0)

    const members = picks.map((techIdx, i) =>
      asMember(techs[techIdx], clusterScores[techIdx], i === leadPos ? 'lead' : 'member'))

    const region = regionLabel(cluster)
    teams.push({
      name: region ? `Team ${teams.length + 1} (${region})` : `Team ${teams.length + 1}`,
      color: TEAM_COLORS[clusterIdx % TEAM_COLORS.length],
      members,
      site_ids: cluster.map((s) => s.id),
      region_label: region,
    })
    assignedClusters.add(clusterIdx)
  })

  // Redistribute orphaned cluster sites to the nearest existing team
  clusters.forEach((cluster, clusterIdx) => {
    if (assignedClusters.has(clusterIdx) || !teams.length) return
    for (const site of cluster) {
      let bestTeamIdx = 0
      if (site.lat != null && site.lng != null) {
        let bestDist = Infinity
        teams.forEach((team, ti) => {
          for (const s of sites) {
            if (team.site_ids.includes(s.id) && s.lat != null && s.lng != null) {
              const dist = haversineMiles(site.lat, site.lng, s.lat, s.lng)
              if (dist < bestDist) { bestDist = dist; bestTeamIdx = ti }
              break
            }
          }
        })
      }
      teams[bestTeamIdx].site_ids.push(site.id)
    }
  })

  const unassigned = techs
    .map((tech, i) => ({ tech, i }))
    .filter(({ i }) => !assigned.has(i))
    .map(({ tech, i }) => asMember(tech, scoresMatrix.length ? scoresMatrix[0][i] : zeroScores))

  return { teams, unassigned_techs: unassigned, warnings }
}
