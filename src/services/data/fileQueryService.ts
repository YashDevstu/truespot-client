import 'server-only'
import * as fs from 'fs'
import * as path from 'path'
import { parseMultiValue } from '@/utils/dax'
import type { PanelConfig } from '@/types/dashboard'

type Row = Record<string, unknown>

export interface LocationHistoryFilters {
  dateSeen?: string
  geofence?: string
  subGeoZone?: string
  floorLevel?: string
  beaconId?: string
  vin?: string
  stockNumber?: string
  assetType?: string
  minDurationMinutes?: number
}

interface DatasetMeta {
  lastRefresh: string
  exportedAt: string
}

// Module-level caches so each serverless instance loads the files only once.
const rowCache = new Map<string, Row[]>()
const metaCache = new Map<string, DatasetMeta>()

function dataDir(clientId: string): string {
  return path.join(process.cwd(), 'src', 'data', clientId)
}

function loadRows(clientId: string): Row[] {
  if (rowCache.has(clientId)) return rowCache.get(clientId)!
  const filePath = path.join(dataDir(clientId), 'location-history.json')
  const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Row[]
  rowCache.set(clientId, rows)
  return rows
}

function loadMeta(clientId: string): DatasetMeta {
  if (metaCache.has(clientId)) return metaCache.get(clientId)!
  const filePath = path.join(dataDir(clientId), 'meta.json')
  const meta = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DatasetMeta
  metaCache.set(clientId, meta)
  return meta
}

// Applies all active filters against the in-memory row array.
// Mirrors the DAX FILTER() + BASE_CONDITIONS logic from the main project.
export function queryRows(clientId: string, filters: LocationHistoryFilters): Row[] {
  const allRows = loadRows(clientId)
  const minDur = filters.minDurationMinutes ?? 0

  return allRows
    .filter(r => Number(r['[MinutesDiff]']) > 0)
    .filter(r => {
      if (!filters.dateSeen || filters.dateSeen === 'all') return true
      const vals = parseMultiValue(filters.dateSeen)
      return vals.includes(String(r['[DateLabel]'] ?? ''))
    })
    .filter(r => {
      if (!filters.geofence) return true
      return parseMultiValue(filters.geofence).includes(String(r['[Geofence]'] ?? ''))
    })
    .filter(r => {
      if (!filters.subGeoZone) return true
      return parseMultiValue(filters.subGeoZone).includes(String(r['[SubGeoZone]'] ?? ''))
    })
    .filter(r => {
      if (!filters.floorLevel) return true
      return parseMultiValue(filters.floorLevel).includes(String(r['[FloorLevel]'] ?? ''))
    })
    .filter(r => {
      if (!filters.beaconId) return true
      return parseMultiValue(filters.beaconId).includes(String(r['[BeaconId]'] ?? ''))
    })
    .filter(r => {
      if (!filters.vin) return true
      return parseMultiValue(filters.vin).includes(String(r['[VIN]'] ?? ''))
    })
    .filter(r => {
      if (!filters.stockNumber) return true
      return parseMultiValue(filters.stockNumber).includes(String(r['[StockNumber]'] ?? ''))
    })
    .filter(r => {
      if (!filters.assetType) return true
      return parseMultiValue(filters.assetType).includes(String(r['[AssetType]'] ?? ''))
    })
    .filter(r => minDur === 0 || Number(r['[MinutesDiff]']) >= minDur)
}

// Columns where the SELECTCOLUMNS alias in buildExportQuery differs from the
// underlying column name in the DAX reference stored in filter_columns config.
// e.g. "VIN", AppendFinal[VIN Updated]  →  row key is [VIN], not [VIN Updated]
const DAX_REF_TO_ROW_KEY: Record<string, string> = {
  'AppendFinal[VIN Updated]': '[VIN]',
  'AppendFinal[Floor Level]': '[FloorLevel]',
}

// Converts a DAX column reference like "AppendFinal[Geofence]" to the row key
// "[Geofence]" that Power BI API puts in the exported JSON.
function daxRefToRowKey(daxRef: string): string {
  if (DAX_REF_TO_ROW_KEY[daxRef]) return DAX_REF_TO_ROW_KEY[daxRef]
  const match = daxRef.match(/\[([^\]]+)\]$/)
  return match ? `[${match[1]}]` : `[${daxRef}]`
}

// Returns distinct dropdown values for every filter column in the panel,
// applying cascade logic: each column's options are derived from rows that
// satisfy all OTHER active filters (so dropdowns show only compatible values).
export function getFilterOptions(
  clientId: string,
  panel: PanelConfig,
  activeFilters: LocationHistoryFilters
): Record<string, string[]> {
  const filterColumns = panel.filter_columns ?? {}
  const options: Record<string, string[]> = {}

  for (const [filterKey, daxRef] of Object.entries(filterColumns)) {
    const rowKey = daxRefToRowKey(daxRef)
    // Exclude this column's own filter so its dropdown never collapses to 1 item
    const filtersWithoutSelf: LocationHistoryFilters = { ...activeFilters, [filterKey]: undefined }
    const filtered = queryRows(clientId, filtersWithoutSelf)
    options[filterKey] = [
      ...new Set(filtered.map(r => String(r[rowKey] ?? '')).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b))
  }

  return options
}

export function getLastRefresh(clientId: string): string {
  try {
    return loadMeta(clientId).lastRefresh ?? ''
  } catch {
    return ''
  }
}
