import { useState, useEffect, useCallback } from 'react'
import { dab, getToken } from '@/lib/dab'
import { useAuth } from '@/hooks/useAuth'

export function useComms(siteId = null) {
  const { user } = useAuth()
  const [messages,       setMessages]       = useState([])
  const [confirmations,  setConfirmations]  = useState([])
  const [templates,      setTemplates]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [sending,        setSending]        = useState(false)
  const [blasting,       setBlasting]       = useState(false)

  const fetchMessages = useCallback(async () => {
    let q = dab
      .from('tech_messages')
      .select('*')
      .order('sent_at', { ascending: false })

    if (siteId) q = q.eq('site_id', siteId)
    else q = q.limit(200)

    const { data } = await q
    setMessages(data ?? [])
  }, [siteId])

  const fetchConfirmations = useCallback(async () => {
    if (!siteId) return
    const { data } = await dab
      .from('tech_confirmations')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
    setConfirmations(data ?? [])
  }, [siteId])

  const fetchTemplates = useCallback(async () => {
    const { data } = await dab
      .from('message_templates')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setTemplates(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTemplates()
    fetchMessages()
    if (siteId) fetchConfirmations()

    const poll = () => { fetchMessages(); if (siteId) fetchConfirmations() }
    const interval = setInterval(poll, 30_000)
    const onVisibility = () => { if (!document.hidden) poll() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [siteId, fetchMessages, fetchConfirmations, fetchTemplates])

  const sendSMS = useCallback(async ({ siteId: sid, recipients, body, templateKey, scheduleConfirmation = false }) => {
    setSending(true)
    try {
      const token = getToken()
      const res = await fetch('/api/comms/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          site_id:               sid,
          recipients,
          body,
          template_key:          templateKey,
          sent_by:               user?.id,
          schedule_confirmation: scheduleConfirmation,
        }),
      })
      const data = await res.json()
      await fetchMessages()
      await fetchConfirmations()
      return data
    } finally {
      setSending(false)
    }
  }, [user?.id, fetchMessages, fetchConfirmations])

  const blastConfirmations = useCallback(async ({ projectId, templateKey = 'site_confirmation', daysAhead = 14 }) => {
    setBlasting(true)
    try {
      const token = getToken()
      const res = await fetch('/api/comms/blast-confirmations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          project_id:   projectId,
          template_key: templateKey,
          days_ahead:   daysAhead,
          sent_by:      user?.id,
        }),
      })
      const data = await res.json()
      await fetchMessages()
      return data
    } finally {
      setBlasting(false)
    }
  }, [user?.id, fetchMessages])

  const mergeTemplate = useCallback((template, site) => {
    if (!template?.body || !site) return template?.body ?? ''
    return template.body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const map = {
        tech_name: '',
        site_name: site.branch_name ?? site.code ?? '',
        address:   site.address ?? '',
        city:      site.city ?? '',
        state:     site.state ?? '',
        zip:       site.zip ?? '',
        date:      site.scheduled_start
          ? new Date(site.scheduled_start + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
          : '',
        time:      '8:00 AM',
      }
      return map[key] ?? `{{${key}}}`
    })
  }, [])

  return {
    messages, confirmations, templates, loading, sending, blasting,
    sendSMS, blastConfirmations, mergeTemplate,
    refetch: () => { fetchMessages(); fetchConfirmations() },
  }
}

export function useAllComms() {
  return useComms(null)
}
