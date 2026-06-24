'use client'
import { useReducer, useEffect, useRef } from 'react'

interface BaseFilters {
  beaconId?: string
  geofence?: string
  subGeoZone?: string
  floorLevel?: string
  vin?: string
  stockNumber?: string
  assetType?: string
  minDurationMinutes?: number
}

interface UseProgressiveDatesQueryParams {
  clientId: string
  dashboardKey: string
  panelId: string
  baseFilters?: BaseFilters
  dateLabels?: string[]  // override to fetch only specific dates; omit for all 8
  enabled?: boolean
}

// ── state machine ─────────────────────────────────────────────────────────────

interface QueryState {
  rows: Record<string, unknown>[]
  loadedDates: number
  errors: number
}

type QueryAction =
  | { type: 'reset' }
  | { type: 'date_success'; newRows: Record<string, unknown>[] }
  | { type: 'date_empty' }
  | { type: 'date_error' }

const INITIAL: QueryState = { rows: [], loadedDates: 0, errors: 0 }

function queryReducer(state: QueryState, action: QueryAction): QueryState {
  switch (action.type) {
    case 'reset':
      return INITIAL
    case 'date_success':
      return { ...state, rows: state.rows.concat(action.newRows), loadedDates: state.loadedDates + 1 }
    case 'date_empty':
      return { ...state, loadedDates: state.loadedDates + 1 }
    case 'date_error':
      return { ...state, loadedDates: state.loadedDates + 1, errors: state.errors + 1 }
  }
}

// ── date label helpers ────────────────────────────────────────────────────────

export function buildAllDateLabels(): string[] {
  const labels: string[] = ['Today']
  for (let i = 1; i <= 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    labels.push(`${mm}/${dd}/${yy}`)
  }
  return labels
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useProgressiveDatesQuery({
  clientId,
  dashboardKey,
  panelId,
  baseFilters,
  dateLabels: dateLabelsOverride,
  enabled = true,
}: UseProgressiveDatesQueryParams) {
  const [state, dispatch] = useReducer(queryReducer, INITIAL)

  const filterKey = JSON.stringify(baseFilters ?? {})
  const dateLabelsKey = JSON.stringify(dateLabelsOverride ?? null)
  const dateLabels = dateLabelsOverride ?? buildAllDateLabels()
  const totalDates = dateLabels.length

  // Track the current fetch session so stale responses from a previous run
  // don't land in the current state.
  const sessionRef = useRef(0)

  useEffect(() => {
    dispatch({ type: 'reset' })

    if (!enabled) return

    const session = ++sessionRef.current
    const controllers = dateLabels.map(() => new AbortController())

    dateLabels.forEach((dateSeen, i) => {
      fetch('/api/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          dashboardKey,
          panelId,
          filters: { ...baseFilters, dateSeen },
        }),
        signal: controllers[i].signal,
      })
        .then((r) => r.json())
        .then((json: { rows?: Record<string, unknown>[]; error?: string }) => {
          if (sessionRef.current !== session) return
          if (json.rows && json.rows.length > 0) {
            dispatch({ type: 'date_success', newRows: json.rows })
          } else {
            dispatch({ type: 'date_empty' })
          }
        })
        .catch((err: Error) => {
          if (sessionRef.current === session && err.name !== 'AbortError') {
            dispatch({ type: 'date_error' })
          }
        })
    })

    return () => {
      // Write-only: advance past this session so in-flight callbacks are ignored.
      // We never read sessionRef.current here — avoids the stale-ref-in-cleanup warning.
      sessionRef.current = session + 1
      controllers.forEach((c) => c.abort())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboardKey, panelId, filterKey, dateLabelsKey, enabled])

  return {
    rows: state.rows,
    loading: state.loadedDates < totalDates,
    loadedDates: state.loadedDates,
    totalDates,
    errors: state.errors,
  }
}
