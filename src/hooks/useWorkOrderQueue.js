import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { generateBulk } from '@/cpwog/generateWO'
import { bundleAllSites } from '@/cpwog/bundleWOs'

export function useWorkOrderQueue() {
  const [generating, setGenerating] = useState(false)
  const [checking, setChecking]     = useState(false)
  const [pushing, setPushing]       = useState({})   // keyed by wo_id
  const [error, setError]           = useState(null)

  // ── Generate a batch of WOs from sites ────────────────────
  const generateBatch = useCallback(async ({
    projectId,
    batchName,
    sites,
    woTypes,
    globalConfig = {},
    siteOverrides = {},
    createdBy,
  }) => {
    setGenerating(true)
    setError(null)

    try {
      // Create batch record
      const { data: batch, error: batchErr } = await supabase
        .from('wo_batches')
        .insert({
          project_id:    projectId,
          name:          batchName,
          wo_types:      woTypes,
          global_config: globalConfig,
          created_by:    createdBy,
          status:        'draft',
        })
        .select()
        .single()

      if (batchErr) throw new Error(batchErr.message)

      // Generate WO payloads using CPWOG engine
      const payloads = bundleAllSites(sites, woTypes, globalConfig, siteOverrides)

      // Insert work_orders rows
      const woRows = payloads.map(p => ({
        site_id:       p.site_id,
        batch_id:      batch.id,
        wo_type:       p.wo_type,
        title:         p.title,
        description:   p.description,
        pay_type:      p.pay_type,
        budget:        p.budget,
        hourly_rate:   p.hourly_rate,
        status:        'draft',
        review_status: 'pending',
        fn_payload:    p,
      }))

      const { data: wos, error: woErr } = await supabase
        .from('work_orders')
        .insert(woRows)
        .select()

      if (woErr) throw new Error(woErr.message)

      // Update batch status
      await supabase
        .from('wo_batches')
        .update({ status: 'reviewing' })
        .eq('id', batch.id)

      return { batch, workOrders: wos }
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setGenerating(false)
    }
  }, [])

  // ── Run dupe check against FN ──────────────────────────────
  const checkDupes = useCallback(async (workOrderIds) => {
    setChecking(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch('/api/fn/check-dupes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ work_order_ids: workOrderIds }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.message)

      // Flag dupes in DB
      if (result.dupes?.length) {
        await supabase
          .from('work_orders')
          .update({ is_dupe_flagged: true })
          .in('id', result.dupes)
      }

      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setChecking(false)
    }
  }, [])

  // ── Approve a WO for push ──────────────────────────────────
  const approveWO = useCallback(async (woId) => {
    const { error } = await supabase
      .from('work_orders')
      .update({ review_status: 'approved' })
      .eq('id', woId)
    if (error) throw new Error(error.message)
  }, [])

  // ── Skip a WO ─────────────────────────────────────────────
  const skipWO = useCallback(async (woId, reason = '') => {
    const { error } = await supabase
      .from('work_orders')
      .update({ review_status: 'skipped', skip_reason: reason, status: 'cancelled' })
      .eq('id', woId)
    if (error) throw new Error(error.message)
  }, [])

  // ── Approve all in batch ───────────────────────────────────
  const approveAll = useCallback(async (batchId) => {
    const { error } = await supabase
      .from('work_orders')
      .update({ review_status: 'approved' })
      .eq('batch_id', batchId)
      .eq('review_status', 'pending')
      .eq('is_dupe_flagged', false)
    if (error) throw new Error(error.message)
  }, [])

  // ── Push a single approved WO to FN ───────────────────────
  const pushWO = useCallback(async (woId) => {
    setPushing(p => ({ ...p, [woId]: true }))
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch('/api/fn/push-wo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ work_order_id: woId, pushed_by: session?.user?.id }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.message)
      return result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setPushing(p => ({ ...p, [woId]: false }))
    }
  }, [])

  // ── Push all approved WOs in a batch ──────────────────────
  const pushBatch = useCallback(async (batchId) => {
    const { data: wos } = await supabase
      .from('work_orders')
      .select('id')
      .eq('batch_id', batchId)
      .eq('review_status', 'approved')
      .eq('status', 'draft')

    const results = []
    for (const wo of wos ?? []) {
      const result = await pushWO(wo.id)
      results.push({ id: wo.id, ...result })
    }

    // Update batch status
    const allPushed = results.every(r => r?.ok)
    await supabase
      .from('wo_batches')
      .update({ status: allPushed ? 'pushed' : 'partial' })
      .eq('id', batchId)

    return results
  }, [pushWO])

  return {
    generating, checking, pushing, error,
    generateBatch, checkDupes,
    approveWO, skipWO, approveAll,
    pushWO, pushBatch,
  }
}
