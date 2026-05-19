import { useState, useEffect, useRef } from 'react'
import { useComms } from '@/hooks/useComms'
import {
  X, Send, MessageSquare, CheckCircle, XCircle,
  Clock, ChevronDown, Users, Zap, AlertTriangle,
  Phone, RefreshCw
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import styles from './SiteCommsPanel.module.css'

const CONFIRM_COLORS = {
  confirmed:   { color: 'var(--green)',  icon: CheckCircle,    label: 'Confirmed'   },
  declined:    { color: 'var(--red)',    icon: XCircle,        label: 'Declined'    },
  pending:     { color: 'var(--amber)',  icon: Clock,          label: 'Pending'     },
  no_response: { color: 'var(--text-muted)', icon: Clock,     label: 'No Response' },
}

export function SiteCommsPanel({ site, onClose }) {
  const {
    messages, confirmations, templates, loading,
    sending, sendSMS, mergeTemplate, refetch,
  } = useComms(site?.id)

  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [customBody,       setCustomBody]        = useState('')
  const [useTemplate,      setUseTemplate]       = useState(true)
  const [scheduleConf,     setScheduleConf]      = useState(true)
  const [sendResult,       setSendResult]        = useState(null)
  const [showHistory,      setShowHistory]       = useState(false)
  const bodyRef = useRef(null)

  // Parse techs + phones from site
  const techNames  = (site?.onsite_tech  ?? '').split(',').map(t => t.trim()).filter(Boolean)
  const techPhones = (site?.onsite_phone ?? '').split(',').map(p => p.trim()).filter(Boolean)

  const techs = techNames.map((name, i) => ({
    name,
    phone: techPhones[i] ?? techPhones[0] ?? '',
    hasPhone: !!(techPhones[i] ?? techPhones[0]),
  }))

  const [selectedTechs, setSelectedTechs] = useState(new Set(techs.map(t => t.name)))

  useEffect(() => {
    if (templates.length && !selectedTemplate) {
      setSelectedTemplate(templates.find(t => t.key === 'site_confirmation') ?? templates[0])
    }
  }, [templates])

  const previewBody = useTemplate && selectedTemplate
    ? mergeTemplate(selectedTemplate, site)
    : customBody

  const toggleTech = (name) => {
    setSelectedTechs(s => {
      const n = new Set(s)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  }

  const handleSend = async () => {
    const recipients = techs
      .filter(t => selectedTechs.has(t.name) && t.hasPhone)
      .map(t => {
        // Personalize the {{tech_name}} in the body per recipient
        const personalBody = previewBody.replace(/{{tech_name}}/g, t.name)
        return { name: t.name, phone: t.phone, body: personalBody }
      })

    if (!recipients.length) return

    setSendResult(null)

    // Send personalized message to each selected tech
    const results = []
    for (const r of recipients) {
      const result = await sendSMS({
        siteId:               site.id,
        recipients:           [{ name: r.name, phone: r.phone }],
        body:                 r.body,
        templateKey:          selectedTemplate?.key,
        scheduleConfirmation: scheduleConf,
      })
      results.push(result)
    }

    const totalSent   = results.reduce((n, r) => n + (r.sent ?? 0), 0)
    const totalFailed = results.reduce((n, r) => n + (r.failed ?? 0), 0)
    const isMock      = results.some(r => r.mock)

    setSendResult({ sent: totalSent, failed: totalFailed, mock: isMock })
    setTimeout(() => setSendResult(null), 6000)
  }

  const confirmed    = confirmations.filter(c => c.status === 'confirmed').length
  const pending      = confirmations.filter(c => c.status === 'pending').length
  const declined     = confirmations.filter(c => c.status === 'declined').length

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <MessageSquare size={15} style={{ color: 'var(--amber)' }} />
          <div>
            <div className={styles.panelTitle}>Technician Comms</div>
            <div className={styles.panelSub}>
              <span className="mono" style={{ color: 'var(--amber)', fontSize: 11 }}>{site?.code}</span>
              {' · '}{site?.branch_name}
            </div>
          </div>
        </div>
        <div className={styles.panelHeaderRight}>
          <button className={styles.iconBtn} onClick={refetch} title="Refresh"><RefreshCw size={13} /></button>
          <button className={styles.iconBtn} onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      {/* Confirmation status bar */}
      {confirmations.length > 0 && (
        <div className={styles.confBar}>
          <div className={styles.confBarItem} style={{ color: 'var(--green)' }}>
            <CheckCircle size={12} /> {confirmed} confirmed
          </div>
          <div className={styles.confBarItem} style={{ color: 'var(--amber)' }}>
            <Clock size={12} /> {pending} pending
          </div>
          {declined > 0 && (
            <div className={styles.confBarItem} style={{ color: 'var(--red)' }}>
              <XCircle size={12} /> {declined} declined
            </div>
          )}
        </div>
      )}

      <div className={styles.panelBody}>

        {/* Tech roster */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            <Users size={12} /> Techs on Site
            <span className={styles.sectionSub}>({techs.length} assigned)</span>
          </div>
          {techs.length === 0 ? (
            <div className={styles.noTechs}>
              <AlertTriangle size={13} style={{ color: 'var(--amber)' }} />
              No techs assigned yet. Add them in Site Details → Staffing.
            </div>
          ) : (
            <div className={styles.techList}>
              {techs.map(tech => {
                const conf = confirmations.find(c => c.tech_name === tech.name)
                const confMeta = CONFIRM_COLORS[conf?.status ?? 'none']
                const ConfIcon = confMeta?.icon
                return (
                  <div key={tech.name} className={`${styles.techRow} ${!tech.hasPhone ? styles.techRowNoPhone : ''}`}>
                    <label className={styles.techCheck}>
                      <input
                        type="checkbox"
                        checked={selectedTechs.has(tech.name)}
                        onChange={() => toggleTech(tech.name)}
                        disabled={!tech.hasPhone}
                      />
                    </label>
                    <div className={styles.techInfo}>
                      <span className={styles.techName}>{tech.name}</span>
                      {tech.hasPhone
                        ? <span className={styles.techPhone}><Phone size={9} /> {tech.phone}</span>
                        : <span className={styles.techNoPhone}>No phone on file</span>
                      }
                    </div>
                    {conf && (
                      <div className={styles.techConfStatus} style={{ color: confMeta?.color }}>
                        <ConfIcon size={11} /> {confMeta?.label}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Message composer */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Send size={12} /> Compose Message</div>

          {/* Template / Custom toggle */}
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${useTemplate ? styles.modeBtnActive : ''}`}
              onClick={() => setUseTemplate(true)}
            >Template</button>
            <button
              className={`${styles.modeBtn} ${!useTemplate ? styles.modeBtnActive : ''}`}
              onClick={() => setUseTemplate(false)}
            >Custom</button>
          </div>

          {useTemplate ? (
            <div className={styles.templateSelect}>
              <select
                className={styles.select}
                value={selectedTemplate?.key ?? ''}
                onChange={e => setSelectedTemplate(templates.find(t => t.key === e.target.value))}
              >
                {templates.map(t => (
                  <option key={t.key} value={t.key}>{t.name}</option>
                ))}
              </select>
              <div className={styles.templatePreview}>
                <div className={styles.previewLabel}>Preview — &lbrace;&lbrace;tech_name&rbrace;&rbrace; replaced per send</div>
                <div className={styles.previewBody}>{previewBody}</div>
              </div>
            </div>
          ) : (
            <textarea
              className={styles.textarea}
              ref={bodyRef}
              rows={4}
              placeholder="Type your message…"
              value={customBody}
              onChange={e => setCustomBody(e.target.value)}
            />
          )}

          {/* Schedule confirmation tracking */}
          <label className={styles.confCheck}>
            <input
              type="checkbox"
              checked={scheduleConf}
              onChange={e => setScheduleConf(e.target.checked)}
            />
            Track replies as site confirmations
          </label>

          {/* Send button */}
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={sending || !techs.some(t => selectedTechs.has(t.name) && t.hasPhone) || !(useTemplate ? previewBody : customBody).trim()}
          >
            {sending ? (
              <><RefreshCw size={13} className={styles.spin} /> Sending…</>
            ) : (
              <><Send size={13} /> Send to {Array.from(selectedTechs).filter(name => techs.find(t => t.name === name && t.hasPhone)).length} tech{selectedTechs.size !== 1 ? 's' : ''}</>
            )}
          </button>

          {/* Send result */}
          {sendResult && (
            <div className={`${styles.sendResult} ${sendResult.failed > 0 ? styles.sendResultWarn : styles.sendResultOk}`}>
              {sendResult.mock && <span className={styles.mockNote}>Mock mode · </span>}
              <CheckCircle size={12} /> {sendResult.sent} sent{sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}
            </div>
          )}
        </div>

        {/* Confirmation log */}
        {confirmations.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <CheckCircle size={12} /> Confirmation Log
            </div>
            {confirmations.map(conf => {
              const meta   = CONFIRM_COLORS[conf.status]
              const Icon   = meta.icon
              return (
                <div key={conf.id} className={styles.confRow}>
                  <Icon size={13} style={{ color: meta.color, flexShrink: 0 }} />
                  <div className={styles.confInfo}>
                    <span className={styles.confName}>{conf.tech_name}</span>
                    <span className={styles.confStatus} style={{ color: meta.color }}>{meta.label}</span>
                    {conf.response_text && <span className={styles.confReply}>"{conf.response_text}"</span>}
                  </div>
                  <span className={styles.confTime}>
                    {conf.responded_at
                      ? formatDistanceToNow(new Date(conf.responded_at), { addSuffix: true })
                      : formatDistanceToNow(new Date(conf.created_at), { addSuffix: true })}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Message history */}
        <div className={styles.section}>
          <button className={styles.historyToggle} onClick={() => setShowHistory(v => !v)}>
            <MessageSquare size={12} /> Message History ({messages.length})
            <ChevronDown size={12} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>
          {showHistory && (
            <div className={styles.messageList}>
              {messages.length === 0
                ? <p className={styles.noMsgs}>No messages sent yet</p>
                : messages.map(msg => (
                  <div key={msg.id} className={`${styles.msgRow} ${msg.direction === 'inbound' ? styles.msgRowIn : styles.msgRowOut}`}>
                    <div className={styles.msgBubble}>
                      <div className={styles.msgMeta}>
                        {msg.direction === 'inbound' ? msg.from_number : msg.to_name}
                        <span className={`${styles.msgStatus} ${msg.status === 'failed' ? styles.msgStatusFail : ''}`}>
                          {msg.status}
                        </span>
                      </div>
                      <div className={styles.msgBody}>{msg.body}</div>
                      <div className={styles.msgTime}>{format(new Date(msg.sent_at), 'M/d h:mm a')}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
