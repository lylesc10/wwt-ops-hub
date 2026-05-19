import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export function useComms(siteId = null) {
  const [messages,       setMessages]       = useState([])
  const [confirmations,  setConfirmations]  = useState([])
  const [templates,      setTemplates]      = useState([])
  const [loading,        setLoading]        = useState(true)
  const [sending,        setSending]        = useState(false)
  const [blasting,       setBlasting]       = useState(false)

  const fetchMessages = useCallback(async () => {
    let q = supabase
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
    const { data } = await supabase
      .from('tech_confirmations')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
    setConfirmations(data ?? [])
  }, [siteId])

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase
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

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`comms-${siteId ?? 'all'}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tech_messages',
        ...(siteId ? { filter: `site_id=eq.${siteId}` } : {}),
      }, fetchMessages)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tech_confirmations',
        ...(siteId ? { filter: `site_id=eq.${siteId}` } : {}),
      }, fetchConfirmations)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [siteId, fetchMessages, fetchConfirmations, fetchTemplates])

  const sendSMS = useCallback(async ({ siteId: sid, recipients, body, templateKey, scheduleConfirmation = false }) => {
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/comms/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          site_id:               sid,
          recipients,
          body,
          template_key:          templateKey,
          sent_by:               session?.user?.id,
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
  }, [fetchMessages, fetchConfirmations])

  const blastConfirmations = useCallback(async ({ projectId, templateKey = 'site_confirmation', daysAhead = 14 }) => {
    setBlasting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/comms/blast-confirmations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          project_id:   projectId,
          template_key: templateKey,
          days_ahead:   daysAhead,
          sent_by:      session?.user?.id,
        }),
      })
      const data = await res.json()
      await fetchMessages()
      return data
    } finally {
      setBlasting(false)
    }
  }, [fetchMessages])

  const mergeTemplate = useCallback((template, site) => {
    if (!template?.body || !site) return template?.body ?? ''
    return template.body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const map = {
        tech_name: '', // filled in at send time per-tech
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
