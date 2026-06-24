// ── Shared primitives ─────────────────────────────────────────────────────────

function sanitize(val: string): string {
  return val.replace(/["\\]/g, '')
}

// Inline duration — MinuteDifference is a DAX measure and unreliable in FILTER()
const DURATION_DAX = `DATEDIFF(AppendFinal[Last Seen-Local], AppendFinal[PreviousLastSeenNew_], MINUTE)`

// Always-on data quality guards: exclude sold/archived assets, zero-duration
// pings, and manual-entry placeholder records.
const BASE_CONDITIONS = [
  'AppendFinal[AssetStatus] <> "Sold"',
  'AppendFinal[AssetStatus] <> "Archieved"',
  `${DURATION_DAX} > 0`,
  'AppendFinal[Make] <> "zz_manualentry"',
]

// Parse a comma-separated filter value (e.g. "VIN1,VIN2") into a trimmed array.
// Single values work too: "VIN1" → ["VIN1"]. Empty / undefined → [].
export function parseMultiValue(val: string | undefined): string[] {
  if (!val) return []
  return val.split(',').map((s) => s.trim()).filter(Boolean)
}

// DAX equality condition for 1 value, IN condition for 2+.
function buildInCondition(column: string, values: string[]): string {
  if (values.length === 1) return `${column} = "${sanitize(values[0])}"`
  return `${column} IN {${values.map((v) => `"${sanitize(v)}"`).join(', ')}}`
}

// ── Measure query ──────────────────────────────────────────────────────────────

export function buildMeasureQuery(measure: string): string {
  return `EVALUATE ROW("Value", ${measure})`
}

// ── Distinct value queries ─────────────────────────────────────────────────────

// Returns all distinct non-blank values for a single DAX column.
// Response rows contain one key "[value]" per row.
export function buildDistinctQuery(tableColumn: string): string {
  return `EVALUATE SELECTCOLUMNS(FILTER(DISTINCT(${tableColumn}), NOT ISBLANK(${tableColumn})), "value", ${tableColumn})`
}

// Same as buildDistinctQuery but pre-filters the table so only values that
// exist under the currently active filters are returned — Power BI cross-filter behaviour.
export function buildDistinctWithFiltersQuery(tableColumn: string, conditions: string[]): string {
  const source =
    conditions.length > 0
      ? `FILTER(AppendFinal, ${conditions.join(' && ')})`
      : 'AppendFinal'
  return `EVALUATE SELECTCOLUMNS(FILTER(DISTINCT(SELECTCOLUMNS(${source}, "value", ${tableColumn})), NOT ISBLANK([value])), "value", [value])`
}

// ── Cascading filter conditions ────────────────────────────────────────────────

// Active filter values passed from the UI (all fields accept comma-separated
// multi-values, e.g. vin = "VIN1,VIN2").
export interface ActiveFilters {
  dateSeen?: string
  geofence?: string
  subGeoZone?: string
  floorLevel?: string
  beaconId?: string
  assetType?: string
  vin?: string
  stockNumber?: string
}

// Builds the FILTER() conditions for a cascade distinct query.
// excludeKey: omit this column's own filter so the dropdown still shows all
//   compatible options rather than collapsing to a single selected value.
export function buildCascadeConditions(
  filters: ActiveFilters,
  excludeKey?: keyof ActiveFilters
): string[] {
  const conditions = [...BASE_CONDITIONS]

  const apply = (key: keyof ActiveFilters, column: string) => {
    if (key === excludeKey) return
    const vals = parseMultiValue(filters[key])
    if (vals.length === 0 || (key === 'dateSeen' && vals[0] === 'all')) return
    if (key === 'dateSeen') {
      // dateSeen is always single-value (period selector)
      conditions.push(`AppendFinal[LastSeenDateDefault] = "${sanitize(vals[0])}"`)
    } else {
      conditions.push(buildInCondition(column, vals))
    }
  }

  apply('dateSeen',    'AppendFinal[LastSeenDateDefault]')
  apply('geofence',    'AppendFinal[Geofence]')
  apply('subGeoZone',  'AppendFinal[SubGeoZone]')
  apply('floorLevel',  'AppendFinal[Floor Level]')
  apply('beaconId',    'AppendFinal[BeaconId]')
  apply('assetType',   'AppendFinal[AssetType]')
  apply('vin',         'AppendFinal[VIN Updated]')
  apply('stockNumber', 'AppendFinal[StockNumber]')

  return conditions
}

// ── Batch distinct query (N columns → 1 API call) ─────────────────────────────

// Builds a single DAX string containing one EVALUATE per filter column.
// The Power BI Execute Queries API returns each EVALUATE as a separate table
// in results[0].tables[i], so one round-trip fetches all filter option lists.
// Each column's EVALUATE excludes that column's own active filter — cascading
// without collapsing the dropdown to a single item.
export function buildBatchDistinctQuery(
  entries: [string, string][],  // [filterKey, DAX tableColumn]
  activeFilters: ActiveFilters
): { dax: string; keys: string[] } {
  const parts: string[] = []
  const keys: string[] = []
  for (const [key, col] of entries) {
    const conds = buildCascadeConditions(activeFilters, key as keyof ActiveFilters)
    parts.push(buildDistinctWithFiltersQuery(col, conds))
    keys.push(key)
  }
  return { dax: parts.join('\n'), keys }
}

// ── Time chunks ────────────────────────────────────────────────────────────────

export interface TimeChunk {
  startFraction: number // fraction of a day: 0 = midnight, 0.25 = 6am, 0.5 = noon, 0.75 = 6pm
  endFraction: number   // exclusive upper bound (1 = next midnight)
}

// Four 6-hour windows that together cover a full day
export const DAY_TIME_CHUNKS: TimeChunk[] = [
  { startFraction: 0,    endFraction: 0.25 }, // 00:00 – 06:00
  { startFraction: 0.25, endFraction: 0.5  }, // 06:00 – 12:00
  { startFraction: 0.5,  endFraction: 0.75 }, // 12:00 – 18:00
  { startFraction: 0.75, endFraction: 1    }, // 18:00 – 24:00
]

// ── Location history query ─────────────────────────────────────────────────────

interface LocationHistoryFilters {
  dateSeen?: string
  timeChunk?: TimeChunk
  beaconId?: string
  geofence?: string
  subGeoZone?: string
  floorLevel?: string
  vin?: string
  stockNumber?: string
  assetType?: string
  minDurationMinutes?: number
}

export function buildLocationHistoryQuery(filters: LocationHistoryFilters = {}): string {
  const minDur = filters.minDurationMinutes ?? 0
  const conditions: string[] = [...BASE_CONDITIONS]

  if (filters.dateSeen) {
    conditions.push(`AppendFinal[LastSeenDateDefault] = "${sanitize(filters.dateSeen)}"`)
    if (filters.timeChunk) {
      conditions.push(`MOD(AppendFinal[Last Seen-Local], 1) >= ${filters.timeChunk.startFraction}`)
      conditions.push(`MOD(AppendFinal[Last Seen-Local], 1) < ${filters.timeChunk.endFraction}`)
    }
  }

  if (minDur > 0) conditions.push(`${DURATION_DAX} >= ${minDur}`)

  // Each filter field accepts comma-separated multi-values → DAX IN condition
  const addFilter = (val: string | undefined, column: string) => {
    const vals = parseMultiValue(val)
    if (vals.length > 0) conditions.push(buildInCondition(column, vals))
  }

  addFilter(filters.beaconId,    'AppendFinal[BeaconId]')
  addFilter(filters.geofence,    'AppendFinal[Geofence]')
  addFilter(filters.subGeoZone,  'AppendFinal[SubGeoZone]')
  addFilter(filters.floorLevel,  'AppendFinal[Floor Level]')
  addFilter(filters.vin,         'AppendFinal[VIN Updated]')
  addFilter(filters.stockNumber, 'AppendFinal[StockNumber]')
  addFilter(filters.assetType,   'AppendFinal[AssetType]')

  const sourceTable =
    conditions.length > 0
      ? `FILTER(\n    AppendFinal,\n    ${conditions.join('\n    && ')}\n  )`
      : `AppendFinal`

  return `EVALUATE
SELECTCOLUMNS(
  ${sourceTable},
  "Geofence", AppendFinal[Geofence],
  "SubGeoZone", AppendFinal[SubGeoZone],
  "StartTime", AppendFinal[Last Seen-Local],
  "EndTime", AppendFinal[PreviousLastSeenNew_],
  "MinutesDiff", DATEDIFF(AppendFinal[Last Seen-Local], AppendFinal[PreviousLastSeenNew_], MINUTE),
  "BeaconId", AppendFinal[BeaconId],
  "VIN", AppendFinal[VIN Updated],
  "StockNumber", AppendFinal[StockNumber],
  "AssetType", AppendFinal[AssetType],
  "FloorLevel", AppendFinal[Floor Level],
  "BatteryLevel", AppendFinal[BatteryLevel],
  "Make", AppendFinal[Make],
  "Model", AppendFinal[Model],
  "Year", AppendFinal[Year]
)`
}
