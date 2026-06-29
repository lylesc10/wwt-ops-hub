import { useState } from 'react'
import { useAllComms, useComms } from '@/hooks/useComms'
import { useProjects } from '@/hooks/useProjects'
import { useSites } from '@/hooks/useSites'
import { PageHeader } from '@/components/PageHeader'
import { SiteCommsPanel } from '@/components/SiteCommsPanel'
import {
  MessageSquare, Send, Zap, CheckCircle, XCircle,
  Clock, Users, ChevronRight, Search, RefreshCw,
  AlertTriangle, Phone
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import styles from './Comms.module.css'

export default function Comms() {
  const { messages, templates, blasting, blastConfirmations, refetch } = useAllComms()
  const { projects } = useProjects()
  const { sites }    = useSites()

  const [selectedSite,   setSelectedSite]   = useState(null)
  const [view,           setView]           = useState('overview') // 'overview' | 'site' | 'blast'
  const [blastProjectId, setBlastProjectId] = useState('')
  const [blastTemplate,  setBlastTemplate]  = useState('site_confirmation')
  const [blastDays,      setBlastDays]      = useState(14)
  const [blastResult,    setBlastResult]    = useState(null)
  const [siteSearch,     setSiteSearch]     = useState('')

  // Sites with techs and phones
  const staffedSites = sites
    .filter(s => s.onsite_phone && !['completed','cancelled'].includes(s.status))
    .sort((a, b) => (a.scheduled_start ?? '').localeCompare(b.scheduled_start ?? ''))

  const filteredSites = staffedSites.filter(s =>
    !siteSearch ||
    s.code?.toLowerCase().includes(siteSearch.toLowerCase()) ||
    s.branch_name?.toLowerCase().includes(siteSearch.toLowerCase()) ||
    s.state?.toLowerCase().includes(siteSearch.toLowerCase()) ||
    (s.onsite_tech ?? '').toLowerCase().includes(siteSearch.toLowerCase())
  )

  // Message stats
  const totalSent      = messages.filter(m => m.direction === 'outbound').length
  const totalReceived  = messages.filter(m => m.direction === 'inbound').length
  const failedMsgs     = messages.filter(m => m.status === 'failed').length
  const recentMessages = messages.slice(0, 20)

  const handleBlast = async () => {
    if (!blastProjectId) return
    setBlastResult(null)
    const result = await blastConfirmations({
      projectId:   blastProjectId,
      templateKey: blastTemplate,
      daysAhead:   blastDays,
    })
    setBlastResult(result)
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Comms"
        subtitle="Technician SMS communications"
        actions={
          <div className={styles.headerActions}>
            <button className={styles.ghostBtn} onClick={refetch}><RefreshCw size={13}/></button>
            <button
              className={`${styles.primaryBtn} ${view === 'blast' ? styles.primaryBtnActive : ''}`}
              onClick={() => setView(view === 'blast' ? 'overview' : 'blast')}
            >
              <Zap size={13} /> Blast Confirmations
            </button>
          </div>
        }
      />

      {/* Blast panel */}
      {view === 'blast' && (
        <div className={styles.blastPanel}>
          <div className={styles.blastPanelInner}>
            <div className={styles.blastTitle}><Zap size={14} /> Bulk Confirmation Blast</div>
            <p className={styles.blastDesc}>
              Sends a site confirmation SMS to every tech with a phone number on sites coming up in the next N days.
              Skips techs who already have a pending or confirmed response.
            </p>
            <div className={styles.blastForm}>
              <div className={styles.field}>
                <label>Project</label>
                <select className={styles.select} value={blastProjectId} onChange={e => setBlastProjectId(e.target.value)}>
                  <option value="">Select project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.client} · {p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Template</label>
                <select className={styles.select} value={blastTemplate} onChange={e => setBlastTemplate(e.target.value)}>
                  {templates.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Sites Starting Within</label>
                <select className={styles.select} value={blastDays} onChange={e => setBlastDays(Number(e.target.value))}>
                  <option value={7}>Next 7 days</option>
                  <option value={14}>Next 14 days</option>
                  <option value={21}>Next 21 days</option>
                  <option value={30}>Next 30 days</option>
                </select>
              </div>
              <button
                className={styles.blastBtn}
                onClick={handleBlast}
                disabled={blasting || !blastProjectId}
              >
                {blasting
                  ? <><RefreshCw size={13} className={styles.spin}/> Sending…</>
                  : <><Zap size={13}/> Send Confirmations</>}
              </button>
            </div>

            {blastResult && (
              <div className={`${styles.blastResult} ${blastResult.failed > 0 ? styles.blastResultWarn : styles.blastResultOk}`}>
                <div className={styles.blastResultMsg}>{blastResult.message}</div>
                {blastResult.mock && <div className={styles.blastMock}>⚠ Mock mode — configure Twilio in Settings → API to send real SMS</div>}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={styles.body}>
        {/* Left: site list */}
        <div className={styles.siteColumn}>
          <div className={styles.siteColumnHead}>
            <div className={styles.searchBox}>
              <Search size={12} />
              <input
                placeholder="Search sites…"
                value={siteSearch}
                onChange={e => setSiteSearch(e.target.value)}
              />
            </div>
            <span className={styles.siteCount}>{filteredSites.length} sites with techs</span>
          </div>

          <div className={styles.siteList}>
            {filteredSites.length === 0 && (
              <div className={styles.emptySites}>
                <Phone size={22} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                <p>No staffed sites with phone numbers</p>
                <p className={styles.emptyHint}>Add tech phones in Site Details → Staffing</p>
              </div>
            )}
            {filteredSites.map(site => {
              const techCount = (site.onsite_tech ?? '').split(',').filter(Boolean).length
              const isSelected = selectedSite?.id === site.id
              return (
                <div
                  key={site.id}
                  className={`${styles.siteRow} ${isSelected ? styles.siteRowActive : ''}`}
                  onClick={() => { setSelectedSite(site); setView('site') }}
                >
                  <div className={styles.siteRowLeft}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>{site.code}</span>
                    <span className={styles.siteBranch}>{site.branch_name}</span>
                    <span className={styles.siteMeta}>
                      {site.state} · {techCount} tech{techCount !== 1 ? 's' : ''}
                      {site.scheduled_start && ` · ${format(new Date(site.scheduled_start + 'T12:00:00'), 'M/d')}`}
                    </span>
                  </div>
                  <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: selected site comms or overview */}
        <div className={styles.commsColumn}>
          {view === 'site' && selectedSite ? (
            <SiteCommsPanel
              site={selectedSite}
              onClose={() => { setView('overview'); setSelectedSite(null) }}
            />
          ) : (
            <div className={styles.overview}>
              {/* Stats */}
              <div className={styles.overviewStats}>
                <StatChip label="Messages Sent"     value={totalSent}     color="var(--amber)" />
                <StatChip label="Replies Received"  value={totalReceived} color="var(--green)" />
                <StatChip label="Failed"            value={failedMsgs}   color={failedMsgs > 0 ? 'var(--red)' : 'var(--text-muted)'} />
                <StatChip label="Sites with Techs"  value={staffedSites.length} color="var(--blue)" />
              </div>

              {/* Recent activity */}
              <div className={styles.recentHead}>
                <MessageSquare size={13} />
                <span>Recent Messages</span>
              </div>
              {recentMessages.length === 0 ? (
                <div className={styles.overviewEmpty}>
                  <MessageSquare size={28} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
                  <p>No messages yet</p>
                  <p className={styles.emptyHint}>Select a site on the left to send your first SMS</p>
                </div>
              ) : (
                <div className={styles.recentList}>
                  {recentMessages.map(msg => (
                    <div key={msg.id} className={`${styles.recentRow} ${msg.direction === 'inbound' ? styles.recentRowIn : ''}`}>
                      <div className={styles.recentIcon}>
                        {msg.direction === 'inbound'
                          ? <MessageSquare size={12} style={{ color: 'var(--green)' }} />
                          : <Send size={12} style={{ color: 'var(--amber)' }} />}
                      </div>
                      <div className={styles.recentInfo}>
                        <span className={styles.recentTo}>{msg.to_name || msg.to_number}</span>
                        <span className={styles.recentBody}>{(msg.body ?? '').slice(0, 60)}{(msg.body ?? '').length > 60 ? '…' : ''}</span>
                      </div>
                      <div className={styles.recentRight}>
                        <span className={`${styles.recentStatus} ${msg.status === 'failed' ? styles.recentStatusFail : ''}`}>{msg.status}</span>
                        <span className={styles.recentTime}>{msg.sent_at ? formatDistanceToNow(new Date(msg.sent_at), { addSuffix: true }) : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatChip({ label, value, color }) {
  return (
    <div className={styles.statChip}>
      <div className={styles.statVal} style={{ color }}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}
