'use client'
import { useMemo } from 'react'
import { parsePings, mergeConsecutiveStops } from '@/utils/stops'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtMinutes(total: number): string {
  const t = Math.round(total)
  if (t < 60) return `${t}m`
  const h = Math.floor(t / 60)
  const m = t % 60
  if (h >= 24) {
    const d = Math.floor(h / 24)
    const rh = h % 24
    return rh === 0 ? `${d}d` : `${d}d ${rh}h`
  }
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// Merge overlapping time intervals so simultaneous beacons (Vehicle + Key on the
// same VIN) don't double-count the same wall-clock minutes.
function mergedMinutes(rows: Record<string, unknown>[]): number {
  const intervals: [number, number][] = []
  for (const r of rows) {
    const s = r['[StartTime]'] ? new Date(String(r['[StartTime]'])).getTime() : NaN
    const e = r['[EndTime]']   ? new Date(String(r['[EndTime]'])).getTime()   : NaN
    if (!isNaN(s) && !isNaN(e) && e > s) intervals.push([s, e])
  }
  if (intervals.length === 0) return 0
  intervals.sort((a, b) => a[0] - b[0])
  let totalMs = 0
  let [curStart, curEnd] = intervals[0]
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i]
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e)
    } else {
      totalMs += curEnd - curStart
      curStart = s
      curEnd = e
    }
  }
  totalMs += curEnd - curStart
  return totalMs / 60_000
}

// ── StatCard ──────────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string
  value: string | number
  subtitle: string
  valueColor?: string
}

function StatCard({ title, value, subtitle, valueColor }: StatCardProps) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Paper
        variant="outlined"
        sx={{ p: 2, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5 }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.disabled', textTransform: 'uppercase', fontSize: 10 }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: { xs: '1.6rem', md: '2rem' },
            lineHeight: 1.15,
            color: valueColor ?? 'text.primary',
            wordBreak: 'break-word',
          }}
        >
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {subtitle}
        </Typography>
      </Paper>
    </Grid>
  )
}

// ── AssetStatCards ────────────────────────────────────────────────────────────
interface AssetStatCardsProps {
  rows: Record<string, unknown>[]
  datePeriod: string  // "today" | "all time" | specific date string
}

export default function AssetStatCards({ rows, datePeriod }: AssetStatCardsProps) {
  const stats = useMemo(() => {
    if (rows.length === 0) return null

    const totalStops = mergeConsecutiveStops(parsePings(rows)).length

    const geofenceSet = new Set<string>()

    // Find most recent stop via string comparison — ISO 8601 sorts correctly as strings
    let latestRow = rows[0]
    let latestTime = String(rows[0]?.['[StartTime]'] ?? '')

    for (const r of rows) {
      geofenceSet.add(String(r['[Geofence]'] ?? ''))
      const t = String(r['[StartTime]'] ?? '')
      if (t > latestTime) {
        latestTime = t
        latestRow = r
      }
    }

    // Merge overlapping intervals so Vehicle + Key beacons on the same VIN
    // don't double-count the same wall-clock time.
    const totalMinutes = mergedMinutes(rows)

    const currentSubZone = String(latestRow['[SubGeoZone]'] ?? '').trim()
    const currentGeofence = String(latestRow['[Geofence]'] ?? '').trim()

    return {
      totalStops,
      uniqueGeofences: geofenceSet.size,
      totalMinutes,
      currentZoneLabel: currentSubZone || currentGeofence || '—',
      currentZoneSubtitle:
        currentSubZone && currentGeofence && currentSubZone !== currentGeofence
          ? `${currentGeofence} · Live`
          : 'Live',
    }
  }, [rows])

  if (!stats) return null

  return (
    <Box>
      <Grid container spacing={2}>
        <StatCard
          title="Stops"
          value={stats.totalStops.toLocaleString()}
          subtitle={`location stops ${datePeriod}`}
        />
        <StatCard
          title="Geofences"
          value={stats.uniqueGeofences}
          subtitle="unique locations"
        />
        <StatCard
          title="Time Tracked"
          value={fmtMinutes(stats.totalMinutes)}
          subtitle={`total ${datePeriod}`}
        />
        <StatCard
          title="Current Zone"
          value={stats.currentZoneLabel}
          subtitle={stats.currentZoneSubtitle}
          valueColor="#27AE60"
        />
      </Grid>
    </Box>
  )
}
