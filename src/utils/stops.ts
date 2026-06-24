// Each row from AppendFinal is a raw beacon ping, not an aggregated stop.
// [StartTime] = Last Seen-Local (when the ping occurred)
// [EndTime]   = PreviousLastSeenNew_ (when the next ping occurred)
// Consecutive pings at the same geofence + subGeoZone are merged into one stop.

function parseMs(val: unknown): number | null {
  if (!val) return null
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d.getTime()
}

export interface ParsedPing {
  geofence: string
  subGeoZone: string
  startMs: number
  endMs: number
  minutes: number
}

export interface MergedStop {
  geofence: string
  subGeoZone: string
  startMs: number
  endMs: number
  totalMinutes: number  // wall-clock: Math.round((endMs - startMs) / 60_000)
  pingCount: number
}

export function parsePings(rows: Record<string, unknown>[]): ParsedPing[] {
  return rows
    .map((r) => {
      const startMs = parseMs(r['[StartTime]'])
      const endMs   = parseMs(r['[EndTime]'])
      if (startMs === null || endMs === null || endMs <= startMs) return null
      return {
        geofence:   String(r['[Geofence]']   ?? ''),
        subGeoZone: String(r['[SubGeoZone]'] ?? ''),
        startMs,
        endMs,
        minutes: Number(r['[MinutesDiff]'] ?? 0),
      }
    })
    .filter((s): s is ParsedPing => s !== null)
    .sort((a, b) => a.startMs - b.startMs)
}

export function mergeConsecutiveStops(pings: ParsedPing[]): MergedStop[] {
  if (pings.length === 0) return []
  const result: MergedStop[] = []

  let curGeofence   = pings[0].geofence
  let curSubGeoZone = pings[0].subGeoZone
  let curStart      = pings[0].startMs
  let curEnd        = pings[0].endMs
  let curCount      = 1

  const flush = () =>
    result.push({
      geofence:     curGeofence,
      subGeoZone:   curSubGeoZone,
      startMs:      curStart,
      endMs:        curEnd,
      // Wall-clock duration so dual beacons (Vehicle + Key on same VIN)
      // don't double-count the same minutes.
      totalMinutes: Math.round((curEnd - curStart) / 60_000),
      pingCount:    curCount,
    })

  for (let i = 1; i < pings.length; i++) {
    const p = pings[i]
    if (p.geofence === curGeofence && p.subGeoZone === curSubGeoZone) {
      curEnd = p.endMs
      curCount++
    } else {
      flush()
      curGeofence   = p.geofence
      curSubGeoZone = p.subGeoZone
      curStart      = p.startMs
      curEnd        = p.endMs
      curCount      = 1
    }
  }
  flush()
  return result
}
