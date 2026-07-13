import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'
import {
  getQuestions, getResponses, saveResponses, suggestAnswers,
  generateDocument, getDocument,
} from './api'
import styles from './DocGen.module.css'

function GeneratingOverlay({ elapsed, progress }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.overlayCard}>
        <Loader2 size={28} className={styles.spin} />
        <p className={styles.overlayTitle}>Generating Document</p>
        <p className={styles.overlayMsg}>{progress}</p>
        <div className={styles.overlayTrack}>
          <div className={styles.overlayBar} style={{ width: `${Math.min(8 + elapsed * 0.45, 92)}%` }} />
        </div>
        <p className={styles.overlayElapsed}>{elapsed}s elapsed</p>
      </div>
    </div>
  )
}

/**
 * Question flow — ported from field-services QuestionFlow.tsx.
 * Loads practice-area questions + saved responses, AI-suggests answers from
 * uploads, then kicks off generation and polls the document every 3s for
 * real progress until status leaves 'generating'.
 */
export default function QuestionFlow({ project, uploads }) {
  const navigate = useNavigate()

  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [suggestedIds, setSuggestedIds] = useState(new Set())
  const [suggesting, setSuggesting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [progress, setProgress] = useState('Starting generation...')
  const [aiAssembly, setAiAssembly] = useState(false)
  const [error, setError] = useState('')
  const pollingRef = useRef(null)
  const timerRef = useRef(null)

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [templates, existing] = await Promise.all([
          getQuestions(project.practice_area),
          getResponses(project.id),
        ])
        if (cancelled) return
        setQuestions(templates)

        if (existing.length > 0) {
          const restored = {}
          for (const r of existing) restored[r.question_template_id] = r.answer
          setAnswers(restored)
          setLoading(false)
        } else {
          setLoading(false)
          if (uploads.length > 0) {
            setSuggesting(true)
            try {
              const suggestions = await suggestAnswers(project.id)
              if (cancelled) return
              if (Object.keys(suggestions).length > 0) {
                setAnswers(suggestions)
                setSuggestedIds(new Set(Object.keys(suggestions)))
              }
            } catch {
              // AI suggestion failure is non-blocking
            } finally {
              if (!cancelled) setSuggesting(false)
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load questions')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.practice_area])

  function updateAnswer(questionId, value) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
    setSuggestedIds(prev => {
      const next = new Set(prev)
      next.delete(questionId)
      return next
    })
  }

  async function handleGenerate() {
    setError('')
    setGenerating(true)
    setElapsed(0)
    setProgress('Saving responses...')

    try {
      const answerList = Object.entries(answers)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([question_template_id, answer]) => ({ question_template_id, answer }))
      await saveResponses(project.id, answerList)

      setProgress('Starting generation...')
      const doc = await generateDocument({
        project_id: project.id,
        doc_type: 'Deployment Guide',
        strategy: 'sectioned',
        ai_assembly: aiAssembly,
      })

      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)

      pollingRef.current = setInterval(async () => {
        try {
          const updated = await getDocument(doc.id)
          if (updated.status !== 'generating') {
            stopPolling()
            setGenerating(false)
            navigate(`/doc-gen/projects/${project.id}/documents/${doc.id}`)
          } else if (updated.generation_progress) {
            setProgress(updated.generation_progress)
          }
        } catch {
          // Polling failure is non-fatal — keep trying
        }
      }, 3000)
    } catch (e) {
      stopPolling()
      setGenerating(false)
      setError(e.message || 'Generation failed. Check that the AI provider is configured.')
    }
  }

  if (loading) {
    return <div className={styles.loading}><Loader2 size={16} className={styles.spin} /><span>Loading questions…</span></div>
  }

  return (
    <>
      {generating && <GeneratingOverlay elapsed={elapsed} progress={progress} />}

      {error && <div className={styles.errorBanner}><AlertTriangle size={14} />{error}</div>}

      {suggesting && (
        <div className={styles.infoBanner}>
          <Sparkles size={14} className={styles.spin} />
          Analyzing uploaded documents…
        </div>
      )}
      {suggestedIds.size > 0 && !suggesting && (
        <div className={styles.infoBanner}>
          <Sparkles size={14} />
          Suggested answers from uploaded documents have been pre-filled. Review and edit as needed.
        </div>
      )}

      <div className={styles.form}>
        {questions.length === 0 && (
          <p className={styles.emptyHint}>
            No question templates found for practice area “{project.practice_area}”.
            Load azure/schema.sql to seed them.
          </p>
        )}

        {questions.map(q => (
          <div key={q.id} className={`${styles.field} ${suggestedIds.has(q.id) ? styles.suggestedField : ''}`}>
            <label className={styles.label}>
              {q.question_text}
              {q.required && <span className={styles.required}> *</span>}
              {suggestedIds.has(q.id) && (
                <span className={styles.suggestedBadge}><Sparkles size={9} /> auto-filled</span>
              )}
            </label>

            {q.input_type === 'text' && (
              <input
                className={styles.input} type="text"
                value={answers[q.id] ?? ''}
                onChange={e => updateAnswer(q.id, e.target.value)}
              />
            )}

            {q.input_type === 'number' && (
              <input
                className={styles.input} type="number"
                value={answers[q.id] ?? ''}
                onChange={e => updateAnswer(q.id, e.target.value === '' ? '' : Number(e.target.value))}
              />
            )}

            {q.input_type === 'select' && (
              <select
                className={styles.select}
                value={answers[q.id] ?? ''}
                onChange={e => updateAnswer(q.id, e.target.value)}
              >
                <option value="">Select…</option>
                {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}

            {q.input_type === 'multi_select' && (
              <div className={styles.checkList}>
                {q.options.map(opt => {
                  const selected = Array.isArray(answers[q.id]) ? answers[q.id] : []
                  return (
                    <label key={opt} className={styles.checkLabel}>
                      <input
                        type="checkbox"
                        checked={selected.includes(opt)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...selected, opt]
                            : selected.filter(s => s !== opt)
                          updateAnswer(q.id, next)
                        }}
                      />
                      {opt}
                    </label>
                  )
                })}
              </div>
            )}

            {q.input_type === 'boolean' && (
              <div className={styles.radioRow}>
                <label className={styles.radioLabel}>
                  <input type="radio" name={q.id} checked={answers[q.id] === true}
                    onChange={() => updateAnswer(q.id, true)} />
                  Yes
                </label>
                <label className={styles.radioLabel}>
                  <input type="radio" name={q.id} checked={answers[q.id] === false}
                    onChange={() => updateAnswer(q.id, false)} />
                  No
                </label>
              </div>
            )}
          </div>
        ))}

        <div className={styles.formFooter}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={aiAssembly}
              onChange={e => setAiAssembly(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong>AI Assembly Pass</strong>
              <span className={styles.toggleHint}>
                Adds an extra AI pass to polish cross-references and terminology.
                Significantly increases generation time.
              </span>
            </span>
          </label>
        </div>

        <button
          className={styles.btnPrimary}
          onClick={handleGenerate}
          disabled={generating}
          style={{ justifyContent: 'center' }}
        >
          <Sparkles size={14} />
          {generating ? 'Generating…' : 'Generate Deployment Guide'}
        </button>
      </div>
    </>
  )
}
