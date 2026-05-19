/**
 * bundleWOs — handles companion WO generation (DEL → auto-generates BRK)
 * and multi-type bundling per site.
 */

import { generateWO } from './generateWO'

/**
 * Bundle a set of WO types for a single site.
 * If DEL is included and BRK is a companion type, auto-generate BRK as well.
 *
 * @param {Object} site
 * @param {string[]} woTypeCodes  - e.g. ['LVL', 'DEL']
 * @param {Object} globalConfig
 * @param {Object} siteOverrides
 * @returns {Array} Flat array of WO payloads
 */
export function bundleWOs(site, woTypeCodes, globalConfig = {}, siteOverrides = {}) {
  const codes = [...new Set(woTypeCodes)]

  // Auto-inject BRK if DEL requested
  if (codes.includes('DEL') && !codes.includes('BRK')) {
    codes.push('BRK')
  }

  return codes.map(code => generateWO(site, code, siteOverrides[code] ?? {}, globalConfig))
}

/**
 * bundleAllSites — bundle WOs for every site in a project
 *
 * @param {Array}    sites
 * @param {string[]} woTypeCodes
 * @param {Object}   globalConfig
 * @param {Object}   perSiteOverrides  - keyed by site_id → { [woTypeCode]: overrides }
 * @returns {Array}  Flat array of all WO payloads
 */
export function bundleAllSites(sites, woTypeCodes, globalConfig = {}, perSiteOverrides = {}) {
  return sites.flatMap(site =>
    bundleWOs(site, woTypeCodes, globalConfig, perSiteOverrides[site.id] ?? {})
  )
}
