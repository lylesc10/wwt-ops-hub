import { Routes, Route, Navigate } from 'react-router-dom'
import ProjectList from './ProjectList'
import ProjectWorkspace from './ProjectWorkspace'
import DocumentEditor from './DocumentEditor'

/**
 * Doc Generator — complete port of the field-services docgen package.
 *
 * /doc-gen                                     → project list
 * /doc-gen/projects/:projectId                 → workspace (Generate / Files / Documents)
 * /doc-gen/projects/:projectId/documents/:docId → document editor
 */
export default function DocGen() {
  return (
    <Routes>
      <Route index element={<ProjectList />} />
      <Route path="projects/:projectId" element={<ProjectWorkspace />} />
      <Route path="projects/:projectId/documents/:docId" element={<DocumentEditor />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  )
}

export function fmtDate(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  } catch { return ts }
}

export function statusColor(status) {
  return {
    generating: 'var(--amber)',
    draft: 'var(--text-muted)',
    in_review: 'var(--blue)',
    approved: 'var(--green)',
  }[status] ?? 'var(--text-muted)'
}

export const PRACTICE_AREAS = ['Network', 'Data Center', 'Security', 'Collaboration', 'Cloud']
