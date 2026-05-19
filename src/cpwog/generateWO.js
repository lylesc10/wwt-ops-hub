/**
 * generateWO — builds a single FieldNation-compatible work order payload
 * from a site record + WO type config.
 *
 * Extracted from chrisprattwog wizard logic.
 * In this platform, output goes to Supabase + FN push instead of CSV.
 */

import { WO_TYPES } from './woTypes'

/**
 * @param {Object} site         - Site row from Supabase
 * @param {string} woTypeCode   - WO type code, e.g. 'LVL'
 * @param {Object} overrides    - Per-site budget/rate/title overrides
 * @param {Object} globalConfig - Project-level defaults
 * @returns {Object} WO payload ready for fn-push-wo edge function
 */
export function generateWO(site, woTypeCode, overrides = {}, globalConfig = {}) {
  const typeDef = WO_TYPES[woTypeCode]
  if (!typeDef) throw new Error(`Unknown WO type: ${woTypeCode}`)

  const siteName = `${site.branch_name} (${site.code})`
  const payType = overrides.payType ?? typeDef.payType ?? globalConfig.payType ?? 'fixed'

  return {
    // Internal refs
    site_id:     site.id,
    site_code:   site.code,
    wo_type:     woTypeCode,

    // FN fields
    title:       overrides.title ?? typeDef.defaultTitle(siteName),
    description: overrides.description ?? typeDef.defaultDesc,
    pay_type:    payType,
    budget:      payType === 'fixed'  ? (overrides.budget ?? globalConfig.defaultBudget ?? null) : null,
    hourly_rate: payType === 'hourly' ? (overrides.hourlyRate ?? globalConfig.defaultHourlyRate ?? null) : null,

    // Location
    location: {
      address: site.address ?? '',
      city:    site.city    ?? '',
      state:   site.state   ?? '',
      zip:     site.zip     ?? '',
    },

    // Scheduling
    scheduled_start: site.scheduled_start ?? null,
    scheduled_end:   site.scheduled_end   ?? null,

    // Routing
    provider_id: overrides.providerId ?? null,

    // Meta
    generated_at: new Date().toISOString(),
  }
}

/**
 * generateBulk — generate WOs for all sites in a project
 *
 * @param {Array}  sites        - Array of site rows
 * @param {string} woTypeCode
 * @param {Object} globalConfig
 * @param {Object} siteOverrides - keyed by site_id
 * @returns {Array} Array of WO payloads
 */
export function generateBulk(sites, woTypeCode, globalConfig = {}, siteOverrides = {}) {
  return sites.map(site =>
    generateWO(site, woTypeCode, siteOverrides[site.id] ?? {}, globalConfig)
  )
}
