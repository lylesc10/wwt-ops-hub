/**
 * WO Type definitions — extracted from chrisprattwog
 * Matches the wo_types table in Supabase.
 * Source of truth for type-specific defaults at generation time.
 */

export const WO_TYPES = {
  LVL: {
    code: 'LVL',
    label: 'Level',
    defaultTitle: (siteName) => `${siteName} – Level`,
    defaultDesc: 'Perform site leveling per project specifications.',
    payType: 'fixed',
  },
  LVT: {
    code: 'LVT',
    label: 'Level T',
    defaultTitle: (siteName) => `${siteName} – Level T`,
    defaultDesc: 'Level T variant — refer to project SOW.',
    payType: 'fixed',
  },
  DEL: {
    code: 'DEL',
    label: 'Delivery',
    defaultTitle: (siteName) => `${siteName} – Equipment Delivery`,
    defaultDesc: 'Deliver and stage equipment at site.',
    payType: 'fixed',
  },
  BRK: {
    code: 'BRK',
    label: 'Break',
    defaultTitle: (siteName) => `${siteName} – Break`,
    defaultDesc: 'Break/companion work order.',
    payType: 'fixed',
    isCompanion: true,   // auto-generates alongside DEL
  },
  INT: {
    code: 'INT',
    label: 'Install',
    defaultTitle: (siteName) => `${siteName} – Installation`,
    defaultDesc: 'Full installation per project specifications.',
    payType: 'fixed',
  },
  INL: {
    code: 'INL',
    label: 'Inline',
    defaultTitle: (siteName) => `${siteName} – Inline`,
    defaultDesc: 'Inline work order — T&M.',
    payType: 'hourly',
  },
}

export const WO_TYPE_CODES = Object.keys(WO_TYPES)
