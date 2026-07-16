/**
 * DocGen API client — ported from field-services frontend/src/api/docgen.ts
 * and questions.ts, using fetch against the /api/docgen/* endpoints.
 */

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Request failed (${res.status})`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Projects ──────────────────────────────────────────────────────────────────

export const listProjects  = () => request('/api/docgen/projects')
export const createProject = (fields) => request('/api/docgen/projects', { method: 'POST', body: JSON.stringify(fields) })
export const getProject    = (id) => request(`/api/docgen/projects/${id}`)
export const updateProject = (id, fields) => request(`/api/docgen/projects/${id}`, { method: 'PATCH', body: JSON.stringify(fields) })
export const deleteProject = (id) => request(`/api/docgen/projects/${id}`, { method: 'DELETE' })

// ── Uploads ───────────────────────────────────────────────────────────────────

export async function uploadFile(projectId, fileType, file) {
  const content_base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
  return request('/api/docgen/upload', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, file_type: fileType, filename: file.name, content_base64 }),
  })
}

export const listUploads  = (projectId) => request(`/api/docgen/uploads/${projectId}`)
export const deleteUpload = (projectId, uploadId) =>
  request(`/api/docgen/uploads/${projectId}?upload_id=${encodeURIComponent(uploadId)}`, { method: 'DELETE' })

// ── Documents ─────────────────────────────────────────────────────────────────

export const listDocuments = (projectId) =>
  request(`/api/docgen/documents${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`)
export const getDocument    = (id) => request(`/api/docgen/documents/${id}`)
export const updateDocument = (id, schema_data) =>
  request(`/api/docgen/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ schema_data }) })
export const deleteDocument = (id) => request(`/api/docgen/documents/${id}`, { method: 'DELETE' })

export const generateDocument = ({ project_id, doc_type = 'Deployment Guide', strategy = 'sectioned', ai_assembly = false }) =>
  request('/api/docgen/generate', { method: 'POST', body: JSON.stringify({ project_id, doc_type, strategy, ai_assembly }) })

export async function downloadDocument(docId, filename) {
  const res = await fetch(`/api/docgen/documents/${docId}/download`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Download failed (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Hardware repository ───────────────────────────────────────────────────────

export const listHardware   = () => request('/api/docgen/hardware')
export const createHardware = (fields) => request('/api/docgen/hardware', { method: 'POST', body: JSON.stringify(fields) })
export const updateHardware = (id, fields) => request(`/api/docgen/hardware/${id}`, { method: 'PATCH', body: JSON.stringify(fields) })
export const deleteHardware = (id) => request(`/api/docgen/hardware/${id}`, { method: 'DELETE' })
export const getBomMatches  = (projectId) => request(`/api/docgen/projects/${projectId}/bom-matches`)

// ── Questions & responses ─────────────────────────────────────────────────────

export const getQuestions = (practiceArea) =>
  request(`/api/docgen/questions?practice_area=${encodeURIComponent(practiceArea)}`)
export const getResponses = (projectId) =>
  request(`/api/docgen/responses?project_id=${encodeURIComponent(projectId)}`)
export const saveResponses = (projectId, answers) =>
  request('/api/docgen/responses', { method: 'POST', body: JSON.stringify({ project_id: projectId, answers }) })

export const suggestAnswers = async (projectId) => {
  const { suggestions } = await request('/api/docgen/suggest-answers', {
    method: 'POST', body: JSON.stringify({ project_id: projectId }),
  })
  return suggestions ?? {}
}
