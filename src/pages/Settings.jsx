import React, { useState, useRef } from 'react'
import { useProjects } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'
import { UploadDiffReport } from '@/components/UploadDiffReport'
import { FNTestPanel } from '@/components/FNTestPanel'
import { useSync } from '@/hooks/useSync'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs'
import { useCredentials } from '@/hooks/useCredentials'
import { useUsers } from '@/hooks/useUsers'
import { PageHeader } from '@/components/PageHeader'
import {
  Plus, RefreshCw, Check, AlertTriangle, Pencil,
  Trash2, X, Save, Sun, Moon, Bell, Key,
  Users, Settings as SettingsIcon, Shield,
  Mail, MessageSquare, ChevronRight, UserPlus,
  Crown, Eye, Briefcase, Upload, Route as RouteIcon
} from 'lucide-react'
import styles from './Settings.module.css'

const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#f97316','#ec4899']

const TABS = [
  { id: 'projects',      label: 'Projects',       icon: SettingsIcon },
  { id: 'users',         label: 'Users',           icon: Users },
  { id: 'notifications', label: 'Notifications',   icon: Bell },
  { id: 'api',           label: 'API & Webhooks',  icon: Key },
  { id: 'appearance',    label: 'Appearance',      icon: Sun },
  { id: 'security',      label: 'Security',        icon: Shield },
]

const ROLE_META = {
  admin:  { label: 'Admin',  icon: Crown,    color: 'var(--amber)',  desc: 'Full access — user management, API config, all writes' },
  pm:     { label: 'PM',     icon: Briefcase, color: 'var(--blue)',  desc: 'Edit sites, push WOs, acknowledge alerts' },
  viewer: { label: 'Viewer', icon: Eye,       color: 'var(--text-muted)', desc: 'Read-only access' },
}

export default function Settings() {
  const { isAdmin, isPM } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [tab, setTab] = useState('projects')

  return (
    <div className={styles.page}>
      <PageHeader title="Settings" subtitle="Configure your Ops Manager instance" />
      <div className={styles.layout}>
        <nav className={styles.tabNav}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`${styles.tabItem} ${tab === id ? styles.tabActive : ''}`} onClick={() => setTab(id)}>
              <Icon size={14} />{label}<ChevronRight size={12} className={styles.tabArrow} />
            </button>
          ))}
        </nav>
        <div className={styles.tabContent}>
          {tab === 'projects'      && <ProjectsTab isAdmin={isAdmin} isPM={isPM} />}
          {tab === 'users'         && <UsersTab isAdmin={isAdmin} />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'api'           && <ApiTab isAdmin={isAdmin} />}
          {tab === 'appearance'    && <AppearanceTab theme={theme} toggleTheme={toggleTheme} />}
          {tab === 'security'      && <SecurityTab isAdmin={isAdmin} />}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// USERS TAB
// ══════════════════════════════════════════════════════════════
function UsersTab({ isAdmin }) {
  const { users, loading, inviteUser, updateUser, deactivateUser } = useUsers()
  const { user: currentUser } = useAuth()
  const [showInvite, setShowInvite] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'viewer' })
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [inviteMsg, setInviteMsg] = useState(null)

  const handleInvite = async () => {
    if (!inviteForm.email) return
    setSaving(true)
    setInviteMsg(null)
    try {
      await inviteUser(inviteForm)
      setInviteMsg({ ok: true, text: `Invite sent to ${inviteForm.email}` })
      setInviteForm({ email: '', full_name: '', role: 'viewer' })
      setShowInvite(false)
    } catch (e) {
      setInviteMsg({ ok: false, text: e.message })
    }
    setSaving(false)
  }

  const handleSaveEdit = async () => {
    setSaving(true)
    try {
      await updateUser(editingId, editForm)
      setEditingId(null)
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const handleDeactivate = async (u) => {
    if (!confirm(`Downgrade ${u.full_name ?? u.email} to Viewer? They'll lose PM/Admin access.`)) return
    try { await deactivateUser(u.id) } catch (e) { alert(e.message) }
  }

  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Users</h2>
          <p className={styles.sectionSub}>{users.length} team member{users.length !== 1 ? 's' : ''} · Invite via email</p>
        </div>
        {isAdmin && (
          <button className={styles.primaryBtn} onClick={() => setShowInvite(v => !v)}>
            <UserPlus size={13} /> Invite User
          </button>
        )}
      </div>

      {inviteMsg && (
        <div className={inviteMsg.ok ? styles.successMsg : styles.errorMsg}>
          {inviteMsg.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
          {inviteMsg.text}
        </div>
      )}

      {showInvite && isAdmin && (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>Invite New User</h3>
          <p className={styles.formDesc}>They'll receive an email to set their password and join the hub.</p>
          <div className={styles.formGrid2}>
            <Field label="Email address">
              <input type="email" placeholder="name@company.com" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="Full name">
              <input placeholder="Jane Smith" value={inviteForm.full_name} onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} />
            </Field>
            <Field label="Role">
              <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}>
                <option value="viewer">Viewer — read only</option>
                <option value="pm">PM — edit + push WOs</option>
                <option value="admin">Admin — full access</option>
              </select>
            </Field>
          </div>
          <div className={styles.formActions}>
            <button className={styles.ghostBtn} onClick={() => setShowInvite(false)}>Cancel</button>
            <button className={styles.primaryBtn} onClick={handleInvite} disabled={saving || !inviteForm.email}>
              <Mail size={13} /> {saving ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </div>
      )}

      {/* Role legend */}
      <div className={styles.roleLegend}>
        {Object.entries(ROLE_META).map(([key, { label, icon: Icon, color, desc }]) => (
          <div key={key} className={styles.roleCard}>
            <Icon size={14} style={{ color, flexShrink: 0 }} />
            <div>
              <p className={styles.roleLabel} style={{ color }}>{label}</p>
              <p className={styles.roleDesc}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* User list */}
      <div className={styles.infoCard}>
        <div className={styles.infoCardHead}>Team Members</div>
        {loading ? (
          <p className={styles.muted} style={{ padding: '16px' }}>Loading…</p>
        ) : users.length === 0 ? (
          <p className={styles.muted} style={{ padding: '16px' }}>No users yet.</p>
        ) : (
          users.map(u => {
            const isMe = u.id === currentUser?.id
            const isEditing = editingId === u.id
            const meta = ROLE_META[u.role] ?? ROLE_META.viewer
            const RoleIcon = meta.icon

            return (
              <div key={u.id} className={`${styles.userRow} ${isMe ? styles.userRowMe : ''}`}>
                {isEditing ? (
                  <div className={styles.userEditInline}>
                    <div className={styles.formGrid2}>
                      <Field label="Full name">
                        <input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
                      </Field>
                      <Field label="Role">
                        <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                          <option value="viewer">Viewer</option>
                          <option value="pm">PM</option>
                          <option value="admin">Admin</option>
                        </select>
                      </Field>
                    </div>
                    <div className={styles.formActions}>
                      <button className={styles.ghostBtn} onClick={() => setEditingId(null)}><X size={12} /> Cancel</button>
                      <button className={styles.primaryBtn} onClick={handleSaveEdit} disabled={saving}><Save size={12} /> {saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.userAvatar}>
                      {(u.full_name ?? u.email)[0].toUpperCase()}
                    </div>
                    <div className={styles.userInfo}>
                      <div className={styles.userNameRow}>
                        <span className={styles.userName}>{u.full_name ?? '—'}</span>
                        {isMe && <span className={styles.meBadge}>you</span>}
                      </div>
                      <span className={styles.userEmail}>{u.email}</span>
                    </div>
                    <div className={styles.userRole} style={{ color: meta.color }}>
                      <RoleIcon size={12} />
                      {meta.label}
                    </div>
                    <span className={styles.userJoined}>
                      {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {isAdmin && !isMe && (
                      <div className={styles.rowActions}>
                        <button className={styles.iconBtn} title="Edit" onClick={() => { setEditingId(u.id); setEditForm({ full_name: u.full_name ?? '', role: u.role }) }}>
                          <Pencil size={13} />
                        </button>
                        {u.role !== 'viewer' && (
                          <button className={`${styles.iconBtn} ${styles.dangerIcon}`} title="Downgrade to Viewer" onClick={() => handleDeactivate(u)}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PROJECTS TAB
// ══════════════════════════════════════════════════════════════
function ProjectsTab({ isAdmin, isPM }) {
  const { projects, archived, loading, createProject, updateProject, deleteProject, restoreProject, permanentlyDelete } = useProjects()
  const { syncing, syncProject, syncAll } = useSync()
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [syncResults, setSyncResults] = useState({})
  const [newForm, setNewForm] = useState({ name: '', client: '', smartsheet_id: '', color: COLORS[0] })
  const [editForm, setEditForm] = useState({})
  const [deleteConfirm, setDeleteConfirm] = useState(null) // project to confirm delete
  const [showRecycleBin, setShowRecycleBin] = useState(false)
  const [uploadingId, setUploadingId] = useState(null)
  const [uploadResults, setUploadResults] = useState({})
  const [uploadTargetId, setUploadTargetId] = useState(null)
  const uploadInputRef = useRef(null)
  const routeInputRef  = useRef(null)
  const [mapFNId,     setMapFNId]     = useState(null)
  const [mapFNResult, setMapFNResult] = useState({})
  const [routeUploadingId, setRouteUploadingId] = useState(null)
  const [routeResults,     setRouteResults]     = useState({})

  const handleMapFN = async (projectId, fnProjectId) => {
    setMapFNId(projectId)
    setMapFNResult(r => ({ ...r, [projectId]: null }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/fn/map-work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ project_id: projectId, fn_project_id: fnProjectId }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message ?? `Error ${res.status}`)
      setMapFNResult(r => ({ ...r, [projectId]: result }))
    } catch(e) {
      setMapFNResult(r => ({ ...r, [projectId]: { ok: false, message: e.message } }))
    }
    setMapFNId(null)
  }

  const handleRouteUpload = async (file, projectId) => {
    if (!file) return
    setRouteUploadingId(projectId)
    setRouteResults(r => ({ ...r, [projectId]: null }))
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb   = XLSX.read(buffer, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false })
      if (!rows.length) throw new Error('No data rows found in file')
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/sync/upload-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ project_id: projectId, rows, fileName: file.name }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message ?? `Server error ${res.status}`)
      setRouteResults(r => ({ ...r, [projectId]: result }))
    } catch(e) {
      setRouteResults(r => ({ ...r, [projectId]: { ok: false, message: e.message } }))
    }
    setRouteUploadingId(null)
    if (routeInputRef.current) routeInputRef.current.value = ''
  }

  const handleUpload = async (file, projectId) => {
    if (!file) return
    setUploadingId(projectId)
    setUploadResults(r => ({ ...r, [projectId]: null }))
    try {
      // Parse Excel in the browser using SheetJS
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb    = XLSX.read(buffer, { type: 'array', cellDates: true })
      const ws    = wb.Sheets[wb.SheetNames[0]]
      const rows  = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false })

      if (!rows.length) throw new Error('No data rows found in file')

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/sync/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ project_id: projectId, rows, fileName: file.name }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message ?? `Server error ${res.status}`)
      setUploadResults(r => ({ ...r, [projectId]: result }))
    } catch(e) {
      setUploadResults(r => ({ ...r, [projectId]: { ok: false, message: e.message } }))
    }
    setUploadingId(null)
    if (uploadInputRef.current) uploadInputRef.current.value = ''
  }

  const handleCreate = async () => {
    if (!newForm.name || !newForm.client) return
    try { await createProject(newForm); setNewForm({ name: '', client: '', smartsheet_id: '', color: COLORS[0] }); setShowNew(false) }
    catch (e) { alert(e.message) }
  }

  const handleSync = async (projectId) => {
    const r = await syncProject(projectId)
    if (r) setSyncResults(s => ({ ...s, [projectId]: r }))
  }

  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Projects</h2>
          <p className={styles.sectionSub}>Manage client projects and Smartsheet connections</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isPM && <button className={styles.secondaryBtn} onClick={() => syncAll(projects.map(p => p.id))} disabled={syncing}><RefreshCw size={13} className={syncing ? styles.spinning : ''} />Sync All</button>}
          <button className={styles.ghostBtn} onClick={() => setShowRecycleBin(v => !v)} title="Recycle bin">
              <Trash2 size={13} /> Bin {archived.length > 0 && <span style={{background:'var(--red)',color:'#fff',borderRadius:10,fontSize:9,padding:'1px 5px',marginLeft:2}}>{archived.length}</span>}
            </button>
          {isAdmin && <button className={styles.primaryBtn} onClick={() => setShowNew(v => !v)}><Plus size={13} /> Add Project</button>}
        </div>
      </div>

      {showNew && (
        <div className={styles.formCard}>
          <h3 className={styles.formTitle}>New Project</h3>
          <div className={styles.formGrid2}>
            <Field label="Client"><input placeholder="e.g. PNC" value={newForm.client} onChange={e => setNewForm(f => ({ ...f, client: e.target.value }))} /></Field>
            <Field label="Project Name"><input placeholder="e.g. LVV Remediation" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Smartsheet Sheet ID"><input placeholder="Leave blank for mock data" value={newForm.smartsheet_id} onChange={e => setNewForm(f => ({ ...f, smartsheet_id: e.target.value }))} /></Field>
            <Field label="Color"><ColorPicker value={newForm.color} onChange={c => setNewForm(f => ({ ...f, color: c }))} /></Field>
          </div>
          <div className={styles.formActions}>
            <button className={styles.ghostBtn} onClick={() => setShowNew(false)}>Cancel</button>
            <button className={styles.primaryBtn} onClick={handleCreate}><Save size={13} /> Create</button>
          </div>
        </div>
      )}

      <div className={styles.cardList}>
        {loading ? <p className={styles.muted}>Loading…</p> : projects.length === 0 ? <p className={styles.muted}>No projects yet.</p> : projects.map(project => {
          const isEditing = editingId === project.id
          const syncResult = syncResults[project.id]
          return (
            <React.Fragment key={project.id}>
            <div className={styles.projectCard}>
              <div className={styles.projectAccent} style={{ background: isEditing ? editForm.color : project.color }} />
              {isEditing ? (
                <div className={styles.projectEditBody}>
                  <div className={styles.formGrid2}>
                    <Field label="Client"><input value={editForm.client} onChange={e => setEditForm(f => ({ ...f, client: e.target.value }))} /></Field>
                    <Field label="Project Name"><input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></Field>
                    <Field label="Smartsheet Sheet ID"><input value={editForm.smartsheet_id} onChange={e => setEditForm(f => ({ ...f, smartsheet_id: e.target.value }))} placeholder="Leave blank for mock data" /></Field>
                    <Field label="Color"><ColorPicker value={editForm.color} onChange={c => setEditForm(f => ({ ...f, color: c }))} /></Field>
                  </div>
                  <div className={styles.formActions}>
                    <button className={styles.ghostBtn} onClick={() => setEditingId(null)}><X size={13} /> Cancel</button>
                    <button className={styles.primaryBtn} onClick={async () => { try { await updateProject(editingId, editForm); setEditingId(null) } catch(e) { alert(e.message) } }}><Save size={13} /> Save</button>
                  </div>
                </div>
              ) : (
                <div className={styles.projectRow}>
                  <div className={styles.projectInfo}>
                    <span className={styles.projectClient}>{project.client}</span>
                    <span className={styles.projectName}>{project.name}</span>
                    <span className={styles.projectMeta}>
                      {project.sites?.[0]?.count ?? 0} sites ·{' '}
                      {project.smartsheet_id ? <span className="mono" style={{ color: 'var(--cyan)' }}>{project.smartsheet_id}</span> : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>mock data</span>}
                    </span>
                  </div>
                  <div className={styles.rowActions}>
                    {syncResult && <span className={styles.syncBadge}><Check size={11} /> {syncResult.synced} sites · {syncResult.changes} changes{syncResult.mock ? ' · mock' : ''}</span>}
                    {/* Upload diff report */}
                    {/* Hidden file input */}
                    <input ref={uploadTargetId === project.id ? uploadInputRef : null} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
                      onChange={e => { if(e.target.files[0]) handleUpload(e.target.files[0], project.id) }}/>
                    {/* Upload button */}
                    {/* Route upload result */}
                    {routeResults[project.id] && (
                      <span className={routeResults[project.id].ok ? styles.syncBadge : styles.errorBadge}>
                        {routeResults[project.id].ok
                          ? <><Check size={11}/> {routeResults[project.id].total_routes} routes · {routeResults[project.id].sites_linked} linked</>
                          : routeResults[project.id].message?.slice(0,40)}
                      </span>
                    )}
                    {/* Route schedule upload */}
                    <input ref={routeUploadingId === project.id ? routeInputRef : null} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
                      onChange={e => { if(e.target.files[0]) handleRouteUpload(e.target.files[0], project.id) }}/>
                    {isPM && (
                      <button className={styles.ghostBtn} title="Upload route schedule Excel (e.g. PNC-RevisedSchedule)"
                        disabled={routeUploadingId === project.id}
                        onClick={() => {
                          setRouteUploadingId(project.id)
                          setTimeout(() => routeInputRef.current?.click(), 50)
                        }}>
                        {routeUploadingId === project.id
                          ? <><RefreshCw size={13} className={styles.spinning}/> Uploading…</>
                          : <><RouteIcon size={13}/> Routes</>}
                      </button>
                    )}
                    {/* Smartsheet site data upload */}
                    {isPM && (
                      <button className={styles.ghostBtn} title="Upload Smartsheet Excel export"
                        disabled={uploadingId === project.id}
                        onClick={() => {
                          setUploadTargetId(project.id)
                          setTimeout(() => uploadInputRef.current?.click(), 50)
                        }}>
                        {uploadingId === project.id
                          ? <><RefreshCw size={13} className={styles.spinning}/> Uploading…</>
                          : <><Upload size={13}/> Sites</>}
                      </button>
                    )}
                    {/* Map FN result */}
                    {mapFNResult[project.id] && (
                      <span className={mapFNResult[project.id].ok ? styles.syncBadge : styles.errorBadge}>
                        {mapFNResult[project.id].ok
                          ? <><Check size={11}/> {mapFNResult[project.id].matched} WOs mapped</>
                          : mapFNResult[project.id].message?.slice(0,40)}
                      </span>
                    )}
                    {isPM && <button className={styles.ghostBtn}
                      disabled={mapFNId === project.id}
                      title="Pull all WOs from FieldNation and match to sites"
                      onClick={() => handleMapFN(project.id, project.fn_project_id)}>
                      {mapFNId === project.id
                        ? <><RefreshCw size={13} className={styles.spinning}/> Mapping…</>
                        : '⚙ Map FN'}
                    </button>}
                    {isPM && <button className={styles.ghostBtn} onClick={() => handleSync(project.id)} disabled={syncing}><RefreshCw size={13} className={syncing ? styles.spinning : ''} /> Sync</button>}
                    {isAdmin && <button className={styles.iconBtn} onClick={() => { setEditingId(project.id); setEditForm({ name: project.name, client: project.client, smartsheet_id: project.smartsheet_id ?? '', color: project.color ?? COLORS[0] }) }}><Pencil size={13} /></button>}
                    {isAdmin && <button className={`${styles.iconBtn} ${styles.dangerIcon}`} onClick={() => setDeleteConfirm(project)} title="Archive project"><Trash2 size={13} /></button>}
                  </div>
                </div>
              )}
            </div>
            {uploadResults[project.id] && (
              <UploadDiffReport
                result={uploadResults[project.id]}
                onClose={() => setUploadResults(r => ({ ...r, [project.id]: null }))}
              />
            )}
            </React.Fragment>
          )
        })}
      </div>
      {/* Recycle Bin */}
      {showRecycleBin && (
        <div className={styles.recycleBin}>
          <div className={styles.recycleBinHead}>
            <Trash2 size={13} /> Recycle Bin
            <span className={styles.recycleBinCount}>{archived.length} archived project{archived.length !== 1 ? 's' : ''}</span>
          </div>
          {archived.length === 0
            ? <p className={styles.muted} style={{padding:'12px 16px'}}>No archived projects</p>
            : archived.map(p => (
              <div key={p.id} className={styles.recycleBinRow}>
                <div className={styles.projectAccent} style={{background: p.color ?? '#4b5568'}} />
                <div className={styles.recycleBinInfo}>
                  <span className={styles.projectClient}>{p.client}</span>
                  <span className={styles.projectName}>{p.name}</span>
                </div>
                <div className={styles.rowActions}>
                  <button className={styles.ghostBtn} onClick={() => restoreProject(p.id)}>↩ Restore</button>
                  {isAdmin && <button className={`${styles.iconBtn} ${styles.dangerIcon}`}
                    onClick={() => { if (confirm(`Permanently delete "${p.name}" and ALL its sites? This cannot be undone.`)) permanentlyDelete(p.id) }}
                    title="Permanently delete">
                    <Trash2 size={13} />
                  </button>}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className={styles.modalOverlay} onClick={() => setDeleteConfirm(null)}>
          <div className={styles.deleteModal} onClick={e => e.stopPropagation()}>
            <div className={styles.deleteModalIcon}><Trash2 size={22} /></div>
            <h3 className={styles.deleteModalTitle}>Archive Project?</h3>
            <p className={styles.deleteModalDesc}>
              <strong>{deleteConfirm.client} · {deleteConfirm.name}</strong> will be moved to the Recycle Bin.
              Sites and data are preserved. You can restore it at any time.
            </p>
            <div className={styles.deleteModalActions}>
              <button className={styles.ghostBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={styles.dangerBtn} onClick={async () => {
                try { await deleteProject(deleteConfirm.id) } catch(e) { alert(e.message) }
                setDeleteConfirm(null)
              }}>
                <Trash2 size={13} /> Move to Bin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS TAB
// ══════════════════════════════════════════════════════════════
function NotificationsTab() {
  const { prefs, loading, saving, updatePrefs } = useNotificationPrefs()
  if (loading) return <p className={styles.muted} style={{padding:24}}>Loading…</p>
  const toggle = (key) => updatePrefs({ [key]: !prefs?.[key] })
  const ALERT_TYPES = [
    { key: 'date_change',           label: 'Date Change',               desc: 'When a site\'s scheduled date changes in Smartsheet' },
    { key: 'provider_cancelled',    label: 'Provider Cancelled',         desc: 'When a technician cancels a FieldNation work order' },
    { key: 'unstaffed_approaching', label: 'Unstaffed Approaching',      desc: 'Site has no provider within 3 days of start date' },
    { key: 'payment_flag',          label: 'Payment Flag',               desc: 'When a technician raises a payment issue' },
    { key: 'site_added',            label: 'New Site Added',             desc: 'When a new site is imported from Smartsheet' },
    { key: 'site_removed',          label: 'Site Removed',               desc: 'When a site is removed from Smartsheet' },
  ]
  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHead}>
        <div><h2 className={styles.sectionTitle}>Notifications</h2><p className={styles.sectionSub}>Choose how and when you get alerted</p></div>
        {saving && <span className={styles.muted} style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>Saving…</span>}
      </div>
      <div className={styles.infoCard}>
        <div className={styles.infoCardHead}>Channels</div>
        <div className={styles.prefRow}>
          <div className={styles.prefInfo}><Mail size={14} style={{ color: 'var(--blue)' }} /><div><p className={styles.prefLabel}>Email notifications</p><p className={styles.prefDesc}>Sent to your account email</p></div></div>
          <Toggle checked={prefs?.email_enabled ?? true} onChange={() => toggle('email_enabled')} />
        </div>
        <div className={styles.prefRow}>
          <div className={styles.prefInfo}><MessageSquare size={14} style={{ color: 'var(--green)' }} /><div><p className={styles.prefLabel}>SMS notifications</p><p className={styles.prefDesc}>Text alerts to your phone{!prefs?.phone && <span style={{ color: 'var(--amber)', marginLeft: 6 }}>— add number below</span>}</p></div></div>
          <Toggle checked={prefs?.sms_enabled ?? false} onChange={() => toggle('sms_enabled')} />
        </div>
        {prefs?.sms_enabled && (
          <div className={styles.prefRow}>
            <Field label="Phone (E.164 e.g. +18135550100)">
              <input type="tel" placeholder="+18135550100" defaultValue={prefs?.phone ?? ''} onBlur={e => updatePrefs({ phone: e.target.value })} style={{ width: 220 }} />
            </Field>
          </div>
        )}
      </div>
      {prefs?.email_enabled && (
        <div className={styles.infoCard}>
          <div className={styles.infoCardHead}>Email — per event type</div>
          {ALERT_TYPES.map(({ key, label, desc }) => (
            <div key={key} className={styles.prefRow}>
              <div className={styles.prefInfo}><div><p className={styles.prefLabel}>{label}</p><p className={styles.prefDesc}>{desc}</p></div></div>
              <Toggle checked={prefs?.[`email_${key}`] ?? true} onChange={() => toggle(`email_${key}`)} />
            </div>
          ))}
        </div>
      )}
      {prefs?.sms_enabled && (
        <div className={styles.infoCard}>
          <div className={styles.infoCardHead}>SMS — per event type</div>
          {ALERT_TYPES.map(({ key, label }) => (
            <div key={key} className={styles.prefRow}>
              <div className={styles.prefInfo}><p className={styles.prefLabel}>{label}</p></div>
              <Toggle checked={prefs?.[`sms_${key}`] ?? false} onChange={() => toggle(`sms_${key}`)} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// API TAB
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// API TAB — full credential config
// ══════════════════════════════════════════════════════════════
function ApiTab({ isAdmin }) {
  const { credentials, loading, saveCredentials, testCredentials } = useCredentials()
  const [expandedService, setExpandedService] = useState(null)
  const [forms, setForms] = useState({})
  const [saving, setSaving] = useState({})
  const [testing, setTesting] = useState({})
  const [testResults, setTestResults] = useState({})
  const [showValues, setShowValues] = useState({})
  const [saveMsg, setSaveMsg] = useState({})

  const SERVICES = [
    {
      key: 'smartsheet',
      label: 'Smartsheet',
      icon: '📊',
      desc: 'Syncs site data from your Smartsheet sheets. Required for Phase 2.',
      docs: 'https://smartsheet.redoc.ly/',
      fields: [
        { key: 'access_token', label: 'Access Token', placeholder: 'Your Smartsheet personal access token', type: 'password', help: 'Smartsheet → Account → Apps & Integrations → API Access → Generate new access token' },
      ],
    },
    {
      key: 'fieldnation',
      label: 'FieldNation',
      icon: '⚙️',
      desc: 'Work order creation, provider management, and status monitoring. Required for Phase 5+.',
      docs: 'https://developer.fieldnation.com',
      fields: [
        { key: 'client_id',     label: 'Client ID',     placeholder: 'FN OAuth2 Client ID',     type: 'password' },
        { key: 'client_secret', label: 'Client Secret', placeholder: 'FN OAuth2 Client Secret', type: 'password' },
        { key: 'username',      label: 'Username',      placeholder: 'Your Field Nation username (email)', type: 'text', help: 'The email/username you use to log into app.fieldnation.com' },
        { key: 'password',      label: 'Password',      placeholder: 'Your Field Nation password', type: 'password' },
        { key: 'environment',   label: 'Environment',   placeholder: 'sandbox or production',    type: 'text',     help: 'Enter "sandbox" for testing or "production" for live' },
        { key: 'webhook_secret', label: 'Webhook Secret', placeholder: 'HMAC secret for signature verification', type: 'password', help: 'Set this in FN → Account → Webhooks → Secret. Register webhook URL: https://wwt-ops-hub.vercel.app/api/fn/webhook' },
      ],
    },
    {
      key: 'resend',
      label: 'Resend (Email)',
      icon: '✉️',
      desc: 'Sends email alerts for date changes, cancellations, and other events.',
      docs: 'https://resend.com/docs',
      fields: [
        { key: 'api_key',      label: 'API Key',      placeholder: 're_xxxxxxxxxxxx', type: 'password', help: 'resend.com → API Keys → Create API Key' },
        { key: 'from_address', label: 'From Address', placeholder: 'Ops Manager <alerts@yourdomain.com>', type: 'text', help: 'Must be a verified domain in Resend' },
      ],
    },
    {
      key: 'twilio',
      label: 'Twilio (SMS)',
      icon: '💬',
      desc: 'Sends SMS alerts to users who have enabled phone notifications.',
      docs: 'https://www.twilio.com/docs/sms',
      fields: [
        { key: 'account_sid', label: 'Account SID',  placeholder: 'ACxxxxxxxxxxxxxxxx', type: 'password', help: 'twilio.com → Console Dashboard' },
        { key: 'auth_token',  label: 'Auth Token',   placeholder: 'Your auth token',    type: 'password' },
        { key: 'from_number', label: 'From Number',  placeholder: '+18135550100',        type: 'text',     help: 'E.164 format — must be a Twilio number' },
      ],
    },
  ]

  const getCred = (service) => credentials.find(c => c.service === service)

  const handleSave = async (service) => {
    setSaving(s => ({ ...s, [service]: true }))
    setSaveMsg(m => ({ ...m, [service]: null }))
    try {
      await saveCredentials(service, forms[service] ?? {})
      setSaveMsg(m => ({ ...m, [service]: { ok: true, text: 'Saved successfully' } }))
      setForms(f => ({ ...f, [service]: {} }))
      setExpandedService(null)
    } catch (e) {
      setSaveMsg(m => ({ ...m, [service]: { ok: false, text: e.message } }))
    }
    setSaving(s => ({ ...s, [service]: false }))
  }

  const handleTest = async (service) => {
    setTesting(t => ({ ...t, [service]: true }))
    try {
      const result = await testCredentials(service)
      setTestResults(r => ({ ...r, [service]: result }))
    } catch (e) {
      setTestResults(r => ({ ...r, [service]: { ok: false, message: e.message } }))
    }
    setTesting(t => ({ ...t, [service]: false }))
  }

  const METHOD_COLOR = { GET: 'var(--green)', POST: 'var(--blue)', PUT: 'var(--amber)', DELETE: 'var(--red)' }
  const ENDPOINTS = [
    ['GET','/workorders','List work orders'],['POST','/workorders','Create WO'],['GET','/workorders/{id}','Get WO detail'],
    ['PUT','/workorders/{id}','Update WO'],['POST','/workorders/{id}/publish','Publish'],
    ['POST','/workorders/{id}/cancel','Cancel WO'],['DELETE','/workorders/{id}','Delete draft'],
    ['PUT','/workorders/{id}/pay','Set pay'],['POST','/workorders/{id}/pay/expenses','Add expense'],
    ['GET','/workorders/{id}/schedule','Schedule'],['PUT','/workorders/{id}/schedule','Update schedule'],
    ['POST','/workorders/{id}/providers/{uid}/assign','Assign provider'],['POST','/workorders/{id}/auto-dispatch','Auto-dispatch'],
    ['GET','/workorders/{id}/messages','Messages'],['POST','/workorders/{id}/messages','Send message'],
    ['GET','/workorders/{id}/tasks','Tasks'],['GET','/workorders/{id}/attachments','Attachments'],
    ['GET','/workorders/{id}/shipments','Shipments'],['POST','/workorders/{id}/shipments','Add shipment'],
    ['GET','/workorders/{id}/time-logs','Time logs'],['GET','/workorders/{id}/eta','ETA'],
    ['GET','/workorders/{id}/tags','Tags'],['POST','/workorders/{id}/problems','Report problem'],
    ['GET','/workorders/{id}/custom-fields','Custom fields'],
    ['GET','/webhooks','Webhooks'],['POST','/webhooks','Register webhook'],['DELETE','/webhooks/{id}','Delete webhook'],
  ]

  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>API & Webhooks</h2>
          <p className={styles.sectionSub}>Configure service credentials and review FieldNation endpoints</p>
        </div>
      </div>

      {!isAdmin && (
        <div className={styles.errorMsg}><AlertTriangle size={13} /> Admin access required to manage credentials</div>
      )}

      {/* Service credential cards */}
      {SERVICES.map(service => {
        const cred = getCred(service.key)
        const isExpanded = expandedService === service.key
        const isConfigured = cred?.is_configured
        const testResult = testResults[service.key]
        const msg = saveMsg[service.key]

        return (
          <div key={service.key} className={styles.credCard}>
            {/* Header */}
            <div className={styles.credHeader} onClick={() => isAdmin && setExpandedService(isExpanded ? null : service.key)}>
              <div className={styles.credHeaderLeft}>
                <span style={{ fontSize: 18 }}>{service.icon}</span>
                <div>
                  <div className={styles.credTitle}>
                    {service.label}
                    {isConfigured
                      ? cred.test_status === 'ok'
                        ? <span className={styles.okBadge}><Check size={11} /> Connected</span>
                        : cred.test_status === 'error'
                          ? <span className={styles.errorBadge}><AlertTriangle size={11} /> Error</span>
                          : <span className={styles.pendingBadge}><AlertTriangle size={11} /> Untested</span>
                      : <span className={styles.warnBadge}>Not configured</span>
                    }
                  </div>
                  <p className={styles.credDesc}>{service.desc}</p>
                  {cred?.last_tested && (
                    <p className={styles.credMeta}>
                      Last tested {new Date(cred.last_tested).toLocaleString()}
                      {cred.test_message && ` — ${cred.test_message}`}
                    </p>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div className={styles.credHeaderRight} onClick={e => e.stopPropagation()}>
                  {isConfigured && (
                    <button
                      className={styles.ghostBtn}
                      onClick={() => handleTest(service.key)}
                      disabled={testing[service.key]}
                    >
                      <RefreshCw size={12} className={testing[service.key] ? styles.spinning : ''} />
                      {testing[service.key] ? 'Testing…' : 'Test'}
                    </button>
                  )}
                  <button
                    className={`${styles.ghostBtn} ${isExpanded ? styles.ghostBtnActive : ''}`}
                    onClick={() => setExpandedService(isExpanded ? null : service.key)}
                  >
                    <Pencil size={12} />
                    {isConfigured ? 'Update' : 'Configure'}
                  </button>
                  <a href={service.docs} target="_blank" rel="noreferrer" className={styles.ghostBtn} style={{ textDecoration: 'none' }}>
                    Docs ↗
                  </a>
                </div>
              )}
            </div>

            {/* Test result inline */}
            {testResult && testResult.service === service.key && (
              <div className={testResult.ok ? styles.inlineSuccess : styles.inlineError}>
                {testResult.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
                {testResult.message}
              </div>
            )}

            {/* Expanded form */}
            {isExpanded && isAdmin && (
              <div className={styles.credForm}>
                <p className={styles.credFormNote}>
                  Credentials are encrypted before storage. Values are write-only — existing values are not shown.
                </p>
                {service.fields.map(field => (
                  <Field key={field.key} label={field.label}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={field.type === 'password' && !showValues[`${service.key}.${field.key}`] ? 'password' : 'text'}
                        placeholder={field.placeholder}
                        value={forms[service.key]?.[field.key] ?? ''}
                        onChange={e => setForms(f => ({ ...f, [service.key]: { ...f[service.key], [field.key]: e.target.value } }))}
                        style={{ paddingRight: field.type === 'password' ? 36 : undefined }}
                      />
                      {field.type === 'password' && (
                        <button
                          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          onClick={() => setShowValues(v => ({ ...v, [`${service.key}.${field.key}`]: !v[`${service.key}.${field.key}`] }))}
                        >
                          {showValues[`${service.key}.${field.key}`] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                    </div>
                    {field.help && <p className={styles.fieldHint}>{field.help}</p>}
                  </Field>
                ))}

                {msg && (
                  <div className={msg.ok ? styles.inlineSuccess : styles.inlineError}>
                    {msg.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
                    {msg.text}
                  </div>
                )}

                <div className={styles.formActions}>
                  <button className={styles.ghostBtn} onClick={() => { setExpandedService(null); setForms(f => ({ ...f, [service.key]: {} })) }}>
                    <X size={12} /> Cancel
                  </button>
                  <button
                    className={styles.primaryBtn}
                    onClick={() => handleSave(service.key)}
                    disabled={saving[service.key] || !service.fields.some(f => forms[service.key]?.[f.key]?.trim())}
                  >
                    <Save size={12} />
                    {saving[service.key] ? 'Saving…' : 'Save Credentials'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* FN Integration Test */}
      <FNTestPanel isAdmin={isAdmin} />

      {/* FN endpoint reference */}
      <div className={styles.infoCard}>
        <div className={styles.infoCardHead}>FieldNation Endpoints ({ENDPOINTS.length} implemented)</div>
        <div className={styles.endpointList}>
          {ENDPOINTS.map(([method, path, desc], i) => (
            <div key={i} className={styles.endpointRow}>
              <span className={styles.methodBadge} style={{ color: METHOD_COLOR[method] }}>{method}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{path}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AppearanceTab({ theme, toggleTheme }) {
  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHead}><div><h2 className={styles.sectionTitle}>Appearance</h2><p className={styles.sectionSub}>Personalize your experience</p></div></div>
      <div className={styles.infoCard}>
        <div className={styles.infoCardHead}>Theme</div>
        <div className={styles.prefRow}>
          <div className={styles.prefInfo}>
            {theme === 'dark' ? <Moon size={14} style={{ color: 'var(--blue)' }} /> : <Sun size={14} style={{ color: 'var(--amber)' }} />}
            <div><p className={styles.prefLabel}>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p><p className={styles.prefDesc}>Saved to your browser</p></div>
          </div>
          <button className={styles.themeToggle} onClick={toggleTheme}>
            {theme === 'dark' ? <><Sun size={13} /> Switch to Light</> : <><Moon size={13} /> Switch to Dark</>}
          </button>
        </div>
        <div className={styles.themePreview}>
          <div className={`${styles.themeCard} ${theme === 'dark' ? styles.themeSelected : ''}`} onClick={() => theme !== 'dark' && toggleTheme()}>
            <div className={styles.themeCardBar} style={{ background: '#f59e0b' }} />
            <div className={styles.themeCardInner} style={{ background: '#13161b', borderColor: '#252a34' }}>
              <div style={{ width: '60%', height: 6, background: '#252a34', borderRadius: 3 }} />
              <div style={{ width: '40%', height: 4, background: '#1a1e25', borderRadius: 3, marginTop: 4 }} />
            </div>
            <p className={styles.themeLabel}>Dark</p>
            {theme === 'dark' && <span className={styles.selectedDot}><Check size={10} /></span>}
          </div>
          <div className={`${styles.themeCard} ${theme === 'light' ? styles.themeSelected : ''}`} onClick={() => theme !== 'light' && toggleTheme()}>
            <div className={styles.themeCardBar} style={{ background: '#f59e0b' }} />
            <div className={styles.themeCardInner} style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
              <div style={{ width: '60%', height: 6, background: '#e2e8f0', borderRadius: 3 }} />
              <div style={{ width: '40%', height: 4, background: '#f1f5f9', borderRadius: 3, marginTop: 4 }} />
            </div>
            <p className={styles.themeLabel}>Light</p>
            {theme === 'light' && <span className={styles.selectedDot}><Check size={10} /></span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SECURITY TAB
// ══════════════════════════════════════════════════════════════
function SecurityTab({ isAdmin }) {
  const FEATURES = [
    { label: 'Row Level Security (RLS)',        status: 'active',  desc: 'All Supabase tables enforce RLS — users only access authorized data' },
    { label: 'API Rate Limiting',               status: 'active',  desc: '60 requests/minute per IP on all serverless functions' },
    { label: 'Input Validation',                status: 'active',  desc: 'All API endpoints validate and sanitize request bodies' },
    { label: 'Security Headers',                status: 'active',  desc: 'X-Frame-Options, CSP, XSS Protection on all API responses' },
    { label: 'Credential Isolation',            status: 'active',  desc: 'All API keys stored server-side — never sent to browser' },
    { label: 'Audit Logging',                   status: 'active',  desc: 'All admin/PM actions logged with IP and timestamp' },
    { label: 'Role-Based Access Control',       status: 'active',  desc: 'Admin, PM, Viewer roles enforced at DB and API level' },
    { label: 'JWT Token Validation',            status: 'active',  desc: 'All protected endpoints validate Supabase Bearer token' },
    { label: 'SSO / SAML',                      status: 'pending', desc: 'Ready to swap in when SSO credentials are provided (Phase 8)' },
    { label: 'Webhook Signature Verification',  status: 'pending', desc: 'FN webhook HMAC verification — pending FN credentials' },
  ]
  return (
    <div className={styles.tabSection}>
      <div className={styles.sectionHead}><div><h2 className={styles.sectionTitle}>Security</h2><p className={styles.sectionSub}>Active controls and compliance features</p></div></div>
      <div className={styles.infoCard}>
        <div className={styles.infoCardHead}>Security Controls</div>
        {FEATURES.map(f => (
          <div key={f.label} className={styles.prefRow}>
            <div className={styles.prefInfo}><div><p className={styles.prefLabel}>{f.label}</p><p className={styles.prefDesc}>{f.desc}</p></div></div>
            <span className={f.status === 'active' ? styles.okBadge : styles.pendingBadge}>
              {f.status === 'active' ? <><Check size={11} /> Active</> : <><AlertTriangle size={11} /> Pending</>}
            </span>
          </div>
        ))}
      </div>
      {isAdmin && (
        <div className={styles.infoCard}>
          <div className={styles.infoCardHead}>Audit Log</div>
          <p className={styles.prefDesc} style={{ padding: '12px 16px' }}>
            All admin and PM actions are recorded in the <span className="mono" style={{ color: 'var(--amber)' }}>audit_log</span> table. View in <span className="mono" style={{ color: 'var(--amber)' }}>Supabase → Table Editor → audit_log</span>.
          </p>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ══════════════════════════════════════════════════════════════
function Field({ label, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  )
}

function ColorPicker({ value, onChange }) {
  return (
    <div className={styles.colorRow}>
      {COLORS.map(c => (
        <button key={c} className={`${styles.colorSwatch} ${value === c ? styles.colorActive : ''}`} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`} onClick={onChange} role="switch" aria-checked={checked}>
      <span className={styles.toggleThumb} />
    </button>
  )
}
