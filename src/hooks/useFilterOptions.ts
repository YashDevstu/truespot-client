'use client'
import { useState, useEffect } from 'react'
import type { FilterOptions } from '@/components/dashboard/FilterSidebar/FilterSidebar'
import type { LocationHistoryFilters } from '@/hooks/useFilters'

const EMPTY: FilterOptions = {
  geofence: [],
  subGeoZone: [],
  floorLevel: [],
  beaconId: [],
  vin: [],
  stockNumber: [],
  assetType: [],
}

// How long (ms) to wait after the last filter change before fetching.
// Avoids a cascade request on every keystroke.
const DEBOUNCE_MS = 350

interface UseFilterOptionsParams {
  clientId: string
  dashboardKey: string
  panelId: string
  filters?: LocationHistoryFilters
}

// Fetches distinct column values from the server.
// When `filters` are active, re-fetches whenever they change so each dropdown
// only shows values compatible with the other selections — matching Power BI
// cross-filter (cascading) behaviour.
export function useFilterOptions({ clientId, dashboardKey, panelId, filters }: UseFilterOptionsParams) {
  const [options, setOptions] = useState<FilterOptions>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams({ clientId, dashboardKey, panelId })
    if (filters) {
      if (filters.dateSeen && filters.dateSeen !== 'all') params.set('dateSeen', filters.dateSeen)
      if (filters.geofence)    params.set('geofence',    filters.geofence)
      if (filters.subGeoZone)  params.set('subGeoZone',  filters.subGeoZone)
      if (filters.floorLevel)  params.set('floorLevel',  filters.floorLevel)
      if (filters.beaconId)    params.set('beaconId',    filters.beaconId)
      if (filters.assetType)   params.set('assetType',   filters.assetType)
      if (filters.vin)         params.set('vin',         filters.vin)
      if (filters.stockNumber) params.set('stockNumber', filters.stockNumber)
    }

    const url = `/api/v1/filter-options?${params}`
    let cancelled = false

    const timer = setTimeout(() => {
      setLoading(true)
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json() as Promise<Partial<FilterOptions>>
        })
        .then((data) => {
          if (!cancelled) setOptions({ ...EMPTY, ...data })
        })
        .catch(() => {
          // Keep existing options on error — freeSolo autocompletes still work
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    clientId, dashboardKey, panelId,
    // Each filter field is a primitive — safe to list individually
    filters?.dateSeen, filters?.geofence, filters?.subGeoZone, filters?.floorLevel,
    filters?.beaconId, filters?.assetType, filters?.vin, filters?.stockNumber,
  ])

  return { options, loading }
}
