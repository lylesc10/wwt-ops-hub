import { useState, useMemo } from 'react'
import { useTechnicians } from '@/hooks/useTechnicians'
import { PageHeader } from '@/components/PageHeader'
import {
  Plus, Search, X, Phone, Mail, ExternalLink,
  MapPin, Edit2, Trash2, Check, RefreshCw, ChevronDown, User, Star
} from 'lucide-react'
import { getToken } from '@/lib/dab'
import styles from './TechPool.module.css'

const REGIONS = ['Eastern', 'Central', 'Mountain', 'Pacific']

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]

const EMPTY_FORM = {
  full_name: '', email: '', phone: '',
  fn_provider_id: '', region: '', states: [], city: '', notes: '',
}

export default function TechPool() {
  const { technicians, loading, refetch, add, update, deactivate } = useTechnicians()

  const [search,      setSearch]      = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [stateFilter,  setStateFilter]  = useState('')
  const [showForm,    setShowForm]    = useState(false)
  const [editingId,   setEditingId]   = useState(null)
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [expandedId,  setExpandedId]  = useState(null)
  const [pullingFN,   setPullingFN]   = useState(null)
  const [pullResult,  setPullResult]  = useState({})

  const pullFromFN = async (tech) => {
    if (!tech.fn_provider_id) return
    setPullingFN(tech.id)
    setPullResult(r => ({ ...r, [tech.id]: null }))
    try {
      const res = await fetch(`/api/fn/provider/${tech.fn_provider_id}`, {
        headers: { Authorization: `Bearer ${getToken() ?? ''}` }
      })
      const result = await res.json()
      setPullResult(r => ({ ...r, [tech.id]: result }))
      await refetch() // refresh cards with new FN data
    } catch(e) {
      setPullResult(r => ({ ...r, [tech.id]: { ok: false, message: e.message } }))
    }
    setPullingFN(null)
  }

  const filtered = useMemo(() => {
    return technicians.filter(t => {
      if (regionFilter && t.region !== regionFilter) return false
      if (stateFilter  && !(t.states ?? []).includes(stateFilter)) return false
      if (search) {
        const q = search.toLowerCase()
        return (t.full_name ?? '').toLowerCase().includes(q) ||
               (t.email    ?? '').toLowerCase().includes(q) ||
               (t.phone    ?? '').toLowerCase().includes(q) ||
               (t.city     ?? '').toLowerCase().includes(q) ||
               (t.fn_provider_id ?? '').toLowerCase().includes(q) ||
               (t.states ?? []).some(s => s.toLowerCase().includes(q))
      }
      return true
    })
  }, [technicians, search, regionFilter, stateFilter])

  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  const openEdit = (tech) => {
    setEditingId(tech.id)
    setForm({
      full_name:      tech.full_name ?? '',
      email:          tech.email ?? '',
      phone:          tech.phone ?? '',
      fn_provider_id: tech.fn_provider_id ?? '',
      region:         tech.region ?? '',
      states:         tech.states ?? [],
      city:           tech.city ?? '',
      notes:          tech.notes ?? '',
    })
    setError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        phone: normalizePhone(form.phone),
      }
      if (editingId) await update(editingId, payload)
      else           await add(payload)
      setShowForm(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  const toggleState = (state) => {
    setForm(f => ({
      ...f,
      states: f.states.includes(state)
        ? f.states.filter(s => s !== state)
        : [...f.states, state].sort(),
    }))
  }

  const fnUrl = (id) => id ? `https://app.fieldnation.com/profile/${id}` : null

  // Group by region for display
  const byRegion = useMemo(() => {
    if (regionFilter || stateFilter || search) return null // flat list when filtering
    const groups = {}
    for (const t of filtered) {
      const r = t.region || 'Unassigned'
      if (!groups[r]) groups[r] = []
      groups[r].push(t)
    }
    return groups
  }, [filtered, regionFilter, stateFilter, search])

  const regionColor = {
    Eastern: 'var(--blue)',
    Central: 'var(--amber)',
    Mountain: 'var(--purple)',
    Pacific: 'var(--green)',
    Unassigned: 'var(--text-muted)',
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tech Pool"
        subtitle={`${technicians.length} technicians`}
        actions={
          <div className={styles.headerActions}>
            <button className={styles.ghostBtn} onClick={refetch}><RefreshCw size={13}/></button>
            <button className={styles.primaryBtn} onClick={openAdd}><Plus size={13}/> Add Tech</button>
          </div>
        }
      />

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIcon}/>
          <input
            className={styles.searchInput}
            placeholder="Search name, email, phone, FN ID, state…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className={styles.clearBtn} onClick={() => setSearch('')}><X size={12}/></button>}
        </div>
        <select className={styles.filterSelect} value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
          <option value="">All Regions</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={styles.filterSelect} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
          <option value="">All States</option>
          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(regionFilter || stateFilter) && (
          <button className={styles.clearFilters} onClick={() => { setRegionFilter(''); setStateFilter('') }}>
            <X size={11}/> Clear
          </button>
        )}
      </div>

      {/* Tech list */}
      <div className={styles.body}>
        {loading ? (
          <div className={styles.loading}><RefreshCw size={14} className={styles.spin}/> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <User size={32} style={{color:'var(--text-muted)',marginBottom:10}}/>
            <p>{technicians.length === 0 ? 'No techs yet — add your first one' : 'No techs match the current filters'}</p>
          </div>
        ) : byRegion ? (
          // Grouped view
          Object.entries(byRegion).sort(([a],[b]) => {
            const order = [...REGIONS, 'Unassigned']
            return order.indexOf(a) - order.indexOf(b)
          }).map(([region, techs]) => (
            <div key={region} className={styles.regionGroup}>
              <div className={styles.regionHeader}>
                <span className={styles.regionDot} style={{background: regionColor[region] ?? 'var(--text-muted)'}}/>
                <span className={styles.regionName}>{region}</span>
                <span className={styles.regionCount}>{techs.length} tech{techs.length !== 1 ? 's' : ''}</span>
              </div>
              <div className={styles.techGrid}>
                {techs.map(tech => (
                  <TechCard
                    key={tech.id}
                    tech={tech}
                    expanded={expandedId === tech.id}
                    onExpand={() => setExpandedId(expandedId === tech.id ? null : tech.id)}
                    onEdit={() => openEdit(tech)}
                    onDeactivate={() => { if (confirm(`Remove ${tech.full_name} from the pool?`)) deactivate(tech.id) }}
                    fnUrl={fnUrl(tech.fn_provider_id)}
                    regionColor={regionColor[tech.region]}
                    onPullFN={() => pullFromFN(tech)}
                    pulling={pullingFN === tech.id}
                    pullResult={pullResult[tech.id]}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          // Flat list (when filtering)
          <div className={styles.techGrid}>
            {filtered.map(tech => (
              <TechCard
                key={tech.id}
                tech={tech}
                expanded={expandedId === tech.id}
                onExpand={() => setExpandedId(expandedId === tech.id ? null : tech.id)}
                onEdit={() => openEdit(tech)}
                onDeactivate={() => { if (confirm(`Remove ${tech.full_name} from the pool?`)) deactivate(tech.id) }}
                fnUrl={fnUrl(tech.fn_provider_id)}
                regionColor={regionColor[tech.region]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3>{editingId ? 'Edit Tech' : 'Add Tech'}</h3>
              <button onClick={() => setShowForm(false)}><X size={15}/></button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label>Full Name *</label>
                  <input className={styles.input} value={form.full_name} onChange={e => setForm(f=>({...f,full_name:e.target.value}))} placeholder="John Smith" autoFocus/>
                </div>
                <div className={styles.field}>
                  <label>Email</label>
                  <input className={styles.input} type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="john@example.com"/>
                </div>
                <div className={styles.field}>
                  <label>Phone</label>
                  <input className={styles.input} type="tel" value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))} placeholder="(555) 123-4567"/>
                </div>
                <div className={styles.field}>
                  <label>FieldNation Provider ID</label>
                  <input className={styles.input} value={form.fn_provider_id} onChange={e => setForm(f=>({...f,fn_provider_id:e.target.value}))} placeholder="e.g. 123456"/>
                </div>
                <div className={styles.field}>
                  <label>Base City</label>
                  <input className={styles.input} value={form.city} onChange={e => setForm(f=>({...f,city:e.target.value}))} placeholder="Columbus, OH"/>
                </div>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label>Region</label>
                  <div className={styles.regionToggle}>
                    {REGIONS.map(r => (
                      <button key={r} type="button"
                        className={`${styles.regionBtn} ${form.region === r ? styles.regionBtnActive : ''}`}
                        style={form.region===r ? {borderColor:regionColor[r],color:regionColor[r],background:`${regionColor[r]}15`} : {}}
                        onClick={() => setForm(f=>({...f, region: f.region===r ? '' : r}))}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label>States Covered</label>
                  <div className={styles.stateGrid}>
                    {US_STATES.map(s => (
                      <button key={s} type="button"
                        className={`${styles.stateBtn} ${form.states.includes(s) ? styles.stateBtnActive : ''}`}
                        onClick={() => toggleState(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {form.states.length > 0 && (
                    <div className={styles.selectedStates}>{form.states.join(', ')}</div>
                  )}
                </div>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label>Notes</label>
                  <textarea className={styles.textarea} rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Skills, certifications, availability notes…"/>
                </div>
              </div>

              {error && <div className={styles.formError}>{error}</div>}
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.ghostBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={styles.primaryBtn} onClick={handleSave} disabled={saving}>
                {saving ? <><RefreshCw size={12} className={styles.spin}/> Saving…</> : <><Check size={12}/> {editingId ? 'Save Changes' : 'Add Tech'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TechCard({ tech, expanded, onExpand, onEdit, onDeactivate, fnUrl, regionColor, onPullFN, pulling, pullResult }) {
  return (
    <div className={`${styles.techCard} ${expanded ? styles.techCardExp : ''}`}>
      <div className={styles.techCardMain} onClick={onExpand}>
        {/* Avatar */}
        <div className={styles.techAvatar} style={{background:`${regionColor ?? 'var(--accent)'}20`,color:regionColor ?? 'var(--accent)'}}>
          {tech.full_name.split(' ').map(w=>w[0]).slice(0,2).join('')}
        </div>

        <div className={styles.techInfo}>
          <div className={styles.techName}>{tech.full_name}</div>
          <div className={styles.techMeta}>
            {tech.city && <span><MapPin size={10}/> {tech.city}</span>}
            {tech.states?.length > 0 && <span>{tech.states.slice(0,4).join(', ')}{tech.states.length > 4 ? ` +${tech.states.length - 4}` : ''}</span>}
          </div>
        </div>

        <div className={styles.techBadges}>
          {tech.region && (
            <span className={styles.regionBadge} style={{color:regionColor,background:`${regionColor}18`,borderColor:`${regionColor}30`}}>
              {tech.region}
            </span>
          )}
          {tech.fn_provider_id && (
            <span className={styles.fnBadge}>FN #{tech.fn_provider_id}</span>
          )}
        </div>

        <ChevronDown size={13} className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}/>
      </div>

      {expanded && (
        <div className={styles.techCardDetail}>
          <div className={styles.techDetailGrid}>
            {tech.email && (
              <a href={`mailto:${tech.email}`} className={styles.techDetailItem}>
                <Mail size={12}/> {tech.email}
              </a>
            )}
            {tech.phone && (
              <a href={`tel:${tech.phone}`} className={styles.techDetailItem}>
                <Phone size={12}/> {tech.phone}
              </a>
            )}
            {tech.fn_provider_id && fnUrl && (
              <a href={fnUrl} target="_blank" rel="noreferrer" className={styles.techDetailItem}>
                <ExternalLink size={12}/> View in FieldNation
              </a>
            )}
          </div>

          {tech.notes && (
            <div className={styles.techNotes}>{tech.notes}</div>
          )}

          {/* FN Stats */}
          {tech.fn_synced_at && (
            <div className={styles.fnStats}>
              <div className={styles.fnStatsRow}>
                {tech.fn_rating && <span className={styles.fnStat}><span className={styles.fnStatVal}>★ {tech.fn_rating}</span> Platform Rating</span>}
                {tech.fn_our_rating && <span className={styles.fnStat}><span className={styles.fnStatVal}>★ {tech.fn_our_rating}</span> Our Rating</span>}
                {tech.fn_wo_completed != null && <span className={styles.fnStat}><span className={styles.fnStatVal}>{tech.fn_wo_completed}</span> Completed</span>}
                {tech.fn_wo_cancelled != null && <span className={styles.fnStat}><span className={styles.fnStatVal}>{tech.fn_wo_cancelled}</span> Cancelled</span>}
                {tech.fn_total_earned && <span className={styles.fnStat}><span className={styles.fnStatVal}>${tech.fn_total_earned.toLocaleString()}</span> Earned</span>}
              </div>
              {tech.fn_wo_types && <div className={styles.fnTypes}>{tech.fn_wo_types}</div>}
              {tech.fn_last_wo_date && <div className={styles.fnSync}>Last WO: {new Date(tech.fn_last_wo_date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>}
              {tech.fn_current_jobs?.length > 0 && (
                <div className={styles.fnCurrent}>
                  <span className={styles.fnCurrentLabel}>Currently assigned:</span>
                  {tech.fn_current_jobs.map((j,i) => (
                    <a key={i} href={j.url} target="_blank" rel="noreferrer" className={styles.fnCurrentJob}>
                      {j.site_code ?? j.title?.slice(0,20)} · {j.status}
                    </a>
                  ))}
                </div>
              )}
              <div className={styles.fnSync}>Synced {new Date(tech.fn_synced_at).toLocaleDateString()}</div>
            </div>
          )}

          {pullResult && !pullResult.ok && (
            <div className={styles.fnError}>{pullResult.message}</div>
          )}

          <div className={styles.techActions}>
            <button className={styles.ghostBtn} onClick={onEdit}><Edit2 size={12}/> Edit</button>
            {tech.fn_provider_id && (
              <button className={styles.ghostBtn} onClick={onPullFN} disabled={pulling}>
                {pulling ? <><RefreshCw size={12} className={styles.spin}/> Pulling…</> : <><ExternalLink size={12}/> Pull from FN</>}
              </button>
            )}
            <button className={`${styles.ghostBtn} ${styles.dangerGhost}`} onClick={onDeactivate}><Trash2 size={12}/> Remove</button>
          </div>
        </div>
      )}
    </div>
  )
}

function normalizePhone(raw) {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return raw.trim() || null
}
