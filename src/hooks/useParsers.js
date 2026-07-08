import { useState, useEffect, useCallback } from 'react'
import { dab } from '@/lib/dab'
import { runParser } from '@/lib/parserEngine'

export function useParsers() {
  const [parsers, setParsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchParsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await dab
      .from('parsers')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (error) setError(error.message)
    else setParsers(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchParsers() }, [fetchParsers])

  const createParser = useCallback(async (fields) => {
    const { data, error } = await dab
      .from('parsers')
      .insert(fields)
      .select()
      .single()
    if (error) throw new Error(error.message)
    await fetchParsers()
    return data
  }, [fetchParsers])

  const updateParser = useCallback(async (id, fields) => {
    const { error } = await dab
      .from('parsers')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchParsers()
  }, [fetchParsers])

  const deleteParser = useCallback(async (id) => {
    const { error } = await dab
      .from('parsers')
      .update({ is_active: false })
      .eq('id', id)
    if (error) throw new Error(error.message)
    await fetchParsers()
  }, [fetchParsers])

  const testParser = useCallback(async (parserId, rawInput) => {
    const parser = parsers.find(p => p.id === parserId)
    if (!parser) throw new Error('Parser not found')

    const result = runParser(rawInput, parser.config, { previewRows: 10 })

    await dab.from('parsers').update({
      last_tested_at: new Date().toISOString(),
      last_test_rows: result.rows.length,
      last_test_ok:   result.errors.length === 0,
      last_test_msg:  result.errors.length
        ? `${result.errors.length} error(s): ${result.errors[0]}`
        : `OK — ${result.rows.length} rows parsed`,
    }).eq('id', parserId)

    await fetchParsers()
    return result
  }, [parsers, fetchParsers])

  const runImport = useCallback(async (parserId, rawInput, projectId, userId) => {
    const parser = parsers.find(p => p.id === parserId)
    if (!parser) throw new Error('Parser not found')

    const { rows, errors, skipped, total } = runParser(rawInput, parser.config)

    let imported = 0
    let errored = 0
    const rowErrors = []

    if (parser.target === 'sites' && projectId) {
      const dupKey = parser.config.dedup_key ?? 'code'
      for (const row of rows) {
        try {
          // DAB doesn't support upsert on non-PK columns — check existence first
          const { data: existing } = await dab
            .from('sites')
            .select('id')
            .eq(dupKey, row[dupKey])
            .single()

          let dbError
          if (existing?.id) {
            const { error } = await dab
              .from('sites')
              .update({ ...row, project_id: projectId })
              .eq('id', existing.id)
            dbError = error
          } else {
            const { error } = await dab
              .from('sites')
              .insert({ ...row, project_id: projectId })
            dbError = error
          }
          if (dbError) { rowErrors.push(dbError.message); errored++ }
          else imported++
        } catch (e) { rowErrors.push(e.message); errored++ }
      }
    }

    await dab.from('parser_runs').insert({
      parser_id:     parserId,
      user_id:       userId,
      status:        errored > 0 ? (imported > 0 ? 'partial' : 'error') : 'success',
      rows_input:    total,
      rows_imported: imported,
      rows_skipped:  skipped,
      rows_errored:  errored,
      error_detail:  rowErrors.length ? { errors: rowErrors } : null,
    })

    await dab.from('parsers').update({
      run_count:     parser.run_count + 1,
      last_run_at:   new Date().toISOString(),
      last_run_rows: imported,
    }).eq('id', parserId)

    await fetchParsers()
    return { imported, skipped, errored, errors: rowErrors, total }
  }, [parsers, fetchParsers])

  return {
    parsers, loading, error,
    createParser, updateParser, deleteParser,
    testParser, runImport,
    refetch: fetchParsers,
  }
}
