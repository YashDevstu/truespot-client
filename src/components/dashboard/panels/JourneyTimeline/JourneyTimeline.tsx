'use client'
import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import Paper from '@mui/material/Paper'
import TimelineIcon from '@mui/icons-material/Timeline'
import { parsePings, mergeConsecutiveStops, type MergedStop } from '@/utils/stops'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDuration(minutes: number): string {
  if (minutes < 1) return '<1m'
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${minutes}m`
}

// Hour-boundary ticks — used only in single-day view
function buildTimeTicks(minMs: number, maxMs: number) {
  const range = maxMs - minMs || 1
  const rangeHours = range / 3_600_000
  const intervalMs =
    rangeHours <= 1    ? 15 * 60_000
    : rangeHours <= 3  ? 30 * 60_000
    : rangeHours <= 6  ? 3_600_000
    : rangeHours <= 12 ? 2 * 3_600_000
    : rangeHours <= 24 ? 4 * 3_600_000
    : 6 * 3_600_000
  const firstTick = Math.ceil(minMs / intervalMs) * intervalMs
  const candidates: number[] = []
  for (let ms = firstTick; ms < maxMs; ms += intervalMs) candidates.push(ms)
  const minGap = range * 0.05
  const filtered = candidates.filter((ms) => ms - minMs > minGap && maxMs - ms > minGap)
  const times = [minMs, ...filtered, maxMs]
  const toPct = (ms: number) => ((ms - minMs) / range) * 100
  return times.map((ms, i, arr) => ({
    pct: toPct(ms),
    label: fmtTime(ms),
    isFirst: i === 0,
    isLast: i === arr.length - 1,
  }))
}

// Fixed 24 h ticks for multi-day rows — midnight / 6 AM / noon / 6 PM / midnight
const DAY_TICKS = [
  { pct: 0,   label: '12 AM', isFirst: true,  isLast: false },
  { pct: 25,  label: '6 AM',  isFirst: false, isLast: false },
  { pct: 50,  label: '12 PM', isFirst: false, isLast: false },
  { pct: 75,  label: '6 PM',  isFirst: false, isLast: false },
  { pct: 100, label: '12 AM', isFirst: false, isLast: true  },
]

const DAY_MS = 24 * 60 * 60 * 1000

// For multi-day bars: collapse sub-zone changes within the same geofence so the
// bar shows clean geofence-level segments instead of hundreds of thin slivers.
// Sub-zone detail is still available in tooltips and the Locations table.
function mergeBlocksForDisplay(blocks: MergedStop[]): MergedStop[] {
  if (blocks.length === 0) return []
  const result: MergedStop[] = []
  let cur = { ...blocks[0] }
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.geofence === cur.geofence) {
      cur = { ...cur, endMs: b.endMs, totalMinutes: Math.round((b.endMs - cur.startMs) / 60_000), pingCount: cur.pingCount + b.pingCount }
    } else {
      result.push(cur)
      cur = { ...b }
    }
  }
  result.push(cur)
  return result
}

// ── multi-day grouping ────────────────────────────────────────────────────────
interface DayGroup {
  shortLabel: string   // "Jun 16"
  dayStartMs: number   // local midnight
  blocks: MergedStop[]
  activeMinutes: number
  isIdle: boolean
}

// Merges overlapping [startMs, endMs] intervals so dual beacons (Vehicle + Key)
// that alternate between nearby geofences don't double-count the same minutes.
function mergedIntervalMinutes(pings: Array<{ startMs: number; endMs: number }>): number {
  if (pings.length === 0) return 0
  const sorted = [...pings].sort((a, b) => a.startMs - b.startMs)
  let total = 0
  let cs = sorted[0].startMs
  let ce = sorted[0].endMs
  for (let i = 1; i < sorted.length; i++) {
    const { startMs: s, endMs: e } = sorted[i]
    if (s <= ce) { ce = Math.max(ce, e) }
    else { total += ce - cs; cs = s; ce = e }
  }
  return Math.round((total + ce - cs) / 60_000)
}

function buildDayGroups(
  pings: ReturnType<typeof parsePings>,
  minMs: number,
  maxMs: number,
): DayGroup[] {
  // Group pings by local calendar day
  const byDay = new Map<number, ReturnType<typeof parsePings>>()
  for (const p of pings) {
    const d = new Date(p.startMs)
    d.setHours(0, 0, 0, 0)
    const key = d.getTime()
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(p)
  }

  // Walk every calendar day in the range so idle days appear as empty rows
  const start = new Date(minMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(maxMs)
  end.setHours(0, 0, 0, 0)

  const groups: DayGroup[] = []
  const cur = new Date(start)
  while (cur.getTime() <= end.getTime()) {
    const dayStartMs = cur.getTime()
    const dayEndMs   = dayStartMs + DAY_MS
    // Cap each ping's endMs to midnight of the next day so a beacon that went
    // offline (next ping days later) doesn't inflate activeMinutes beyond 24 h.
    const dayPings = (byDay.get(dayStartMs) ?? [])
      .map((p) => ({ ...p, endMs: Math.min(p.endMs, dayEndMs) }))
      .filter((p) => p.endMs > p.startMs)
    const blocks = mergeConsecutiveStops(dayPings)
    groups.push({
      shortLabel:    new Date(dayStartMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayStartMs,
      blocks,
      // Use interval merging on raw pings (not sum of block.totalMinutes) so
      // dual-beacon alternation between nearby geofences doesn't double-count.
      activeMinutes: mergedIntervalMinutes(dayPings),
      isIdle:        blocks.length === 0,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return groups
}

// ── component ─────────────────────────────────────────────────────────────────
interface JourneyTimelineProps {
  rows: Record<string, unknown>[]
  colorMap: Map<string, string>
  dateLabel?: string
  selectedIndex?: number | null
  onSelectIndex?: (i: number | null) => void
}

export default function JourneyTimeline({
  rows,
  colorMap,
  dateLabel = "TODAY'S JOURNEY",
  selectedIndex,
  onSelectIndex,
}: JourneyTimelineProps) {
  const { pings, allBlocks, uniqueGeofences, minMs, maxMs, timeTicks, isMultiDay, dayGroups } =
    useMemo(() => {
      const pings = parsePings(rows)
      if (pings.length === 0) {
        return {
          pings: [], allBlocks: [], uniqueGeofences: [],
          minMs: 0, maxMs: 0, timeTicks: [], isMultiDay: false, dayGroups: [],
        }
      }

      const allBlocks       = mergeConsecutiveStops(pings)
      const minMs           = pings[0].startMs
      const maxMs           = pings.reduce((m, p) => Math.max(m, p.endMs), pings[0].endMs)
      const isMultiDay      = (maxMs - minMs) > 26 * 3_600_000
      const uniqueGeofences = [...new Set(allBlocks.map((b) => b.geofence))].filter(Boolean)

      return {
        pings,
        allBlocks,
        uniqueGeofences,
        minMs,
        maxMs,
        timeTicks: isMultiDay ? [] : buildTimeTicks(minMs, maxMs),
        isMultiDay,
        dayGroups: isMultiDay ? buildDayGroups(pings, minMs, maxMs) : [],
      }
    }, [rows])

  if (pings.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: 2.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, color: 'text.disabled' }}
      >
        <TimelineIcon sx={{ fontSize: 28 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Journey Timeline</Typography>
          <Typography variant="caption">No valid timeline data in the current result set.</Typography>
        </Box>
      </Paper>
    )
  }

  // Positioning helpers for single-day bar
  const totalMs    = maxMs - minMs || 1
  const toLeft     = (ms: number)             => `${((ms - minMs) / totalMs) * 100}%`
  const toWidth    = (s: number, e: number)   => `${Math.max(0.3, ((e - s) / totalMs) * 100)}%`

  // Positioning helpers for multi-day rows (each row = 24 h from midnight)
  const toDayLeft  = (ms: number, base: number) => `${Math.max(0, ((ms - base) / DAY_MS) * 100)}%`
  const toDayWidth = (s: number, e: number, base: number) =>
    `${Math.max(0.3, (Math.min(e, base + DAY_MS) - s) / DAY_MS * 100)}%`

  const blockTooltip = (block: MergedStop) => (
    <Box>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>{block.geofence}</Typography>
      {block.subGeoZone && block.subGeoZone !== block.geofence && (
        <Typography variant="caption" sx={{ display: 'block', opacity: 0.75 }}>{block.subGeoZone}</Typography>
      )}
      <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
        {fmtTime(block.startMs)} – {fmtTime(block.endMs)}
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
        {fmtDuration(block.totalMinutes)}
        {block.pingCount > 1 ? ` · ${block.pingCount} readings` : ''}
      </Typography>
    </Box>
  )

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 1.5, color: 'text.secondary', textTransform: 'uppercase', lineHeight: 1 }}
        >
          {dateLabel}
        </Typography>
        {!isMultiDay && (
          <>
            <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
            <Typography variant="caption" color="text.disabled">click a segment to select</Typography>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.disabled">
          {allBlocks.length} stop{allBlocks.length !== 1 ? 's' : ''} · {uniqueGeofences.length} geofence{uniqueGeofences.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {isMultiDay ? (
        /* ── Multi-day: one row per calendar day ──────────────────────────── */
        <Box>
          {dayGroups.map((day) => {
            // Geofence-level blocks for the visual bar (no sub-zone slivers)
            const displayBlocks = mergeBlocksForDisplay(day.blocks)

            const displayBlockTooltip = (block: MergedStop) => {
              // Collect sub-zones within this geofence from the original fine-grained blocks
              const subZones = [...new Set(
                day.blocks
                  .filter((b) => b.geofence === block.geofence && b.startMs >= block.startMs && b.endMs <= block.endMs + 60_000)
                  .map((b) => b.subGeoZone)
                  .filter((z) => z && z !== block.geofence)
              )]
              return (
                <Box sx={{ minWidth: 160 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, fontSize: 12 }}>{block.geofence}</Typography>
                  {subZones.length > 1 && (
                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.75, mt: 0.25 }}>
                      {subZones.length} sub-zones
                    </Typography>
                  )}
                  {subZones.length === 1 && (
                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.75, mt: 0.25 }}>{subZones[0]}</Typography>
                  )}
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.8, mt: 0.5 }}>
                    {fmtTime(block.startMs)} – {fmtTime(block.endMs)}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mt: 0.25 }}>
                    {fmtDuration(block.totalMinutes)}
                  </Typography>
                </Box>
              )
            }

            return (
              <Box
                key={day.dayStartMs}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}
              >
                {/* Two-line date label: weekday + date */}
                <Box sx={{ width: 52, flexShrink: 0, textAlign: 'right' }}>
                  <Typography sx={{
                    display: 'block', fontSize: 10, lineHeight: 1.3,
                    color: day.isIdle ? 'text.disabled' : 'text.disabled',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    {new Date(day.dayStartMs).toLocaleDateString('en-US', { weekday: 'short' })}
                  </Typography>
                  <Typography sx={{
                    display: 'block', fontSize: 12, lineHeight: 1.3,
                    color:      day.isIdle ? 'text.disabled' : 'text.primary',
                    fontWeight: day.isIdle ? 400 : 700,
                  }}>
                    {day.shortLabel}
                  </Typography>
                </Box>

                {/* 24 h bar */}
                <Box
                  sx={{
                    flex: 1,
                    position: 'relative',
                    height: 40,
                    borderRadius: 1.5,
                    overflow: 'hidden',
                    bgcolor: day.isIdle ? 'grey.50' : 'grey.100',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  {day.isIdle ? (
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
                      <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'grey.300' }} />
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10, letterSpacing: 0.5 }}>
                        No activity
                      </Typography>
                    </Box>
                  ) : (
                    displayBlocks.map((block, bi) => {
                      const color = colorMap.get(block.geofence) ?? '#9E9E9E'
                      const isLast = bi === displayBlocks.length - 1
                      // Shorten geofence name for in-bar label
                      const shortName = block.geofence.replace(/maple shade /i, '').replace(/customer service/i, 'Cust. Service')
                      return (
                        <Tooltip key={bi} arrow placement="top" title={displayBlockTooltip(block)}>
                          <Box
                            sx={{
                              position: 'absolute',
                              left:   toDayLeft(block.startMs, day.dayStartMs),
                              width:  toDayWidth(block.startMs, block.endMs, day.dayStartMs),
                              top: 0,
                              bottom: 0,
                              bgcolor: color,
                              borderRight: isLast ? 'none' : '2px solid rgba(255,255,255,0.7)',
                              transition: 'filter 0.15s',
                              cursor: 'default',
                              display: 'flex',
                              alignItems: 'center',
                              overflow: 'hidden',
                              px: 0.75,
                              '&:hover': { filter: 'brightness(0.85)', zIndex: 1 },
                            }}
                          >
                            {block.totalMinutes >= 90 && (
                              <Typography sx={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: 'rgba(255,255,255,0.92)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                                pointerEvents: 'none',
                                userSelect: 'none',
                              }}>
                                {shortName}
                              </Typography>
                            )}
                          </Box>
                        </Tooltip>
                      )
                    })
                  )}
                </Box>

                {/* Active time */}
                <Box sx={{ width: 60, flexShrink: 0, textAlign: 'right' }}>
                  <Typography sx={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: day.isIdle
                      ? 'text.disabled'
                      : day.activeMinutes >= 20 * 60
                        ? 'success.dark'
                        : day.activeMinutes >= 4 * 60
                          ? 'text.secondary'
                          : 'text.disabled',
                  }}>
                    {day.isIdle ? '—' : fmtDuration(day.activeMinutes)}
                  </Typography>
                </Box>
              </Box>
            )
          })}

          {/* Shared x-axis below all day rows */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mt: 0.5 }}>
            <Box sx={{ width: 52, flexShrink: 0 }} />
            <Box sx={{ flex: 1, position: 'relative', height: 22 }}>
              {DAY_TICKS.map((t, i) => (
                <Box
                  key={i}
                  sx={{
                    position: 'absolute',
                    left: `${t.pct}%`,
                    transform: t.isFirst ? 'none' : t.isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: t.isFirst ? 'flex-start' : t.isLast ? 'flex-end' : 'center',
                  }}
                >
                  <Box sx={{ width: 1, height: 4, bgcolor: 'divider', mb: 0.25 }} />
                  <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled', whiteSpace: 'nowrap', userSelect: 'none' }}>
                    {t.label}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ width: 60, flexShrink: 0 }} />
          </Box>
        </Box>
      ) : (
        /* ── Single-day: existing bar layout ─────────────────────────────── */
        <>
          <Box
            sx={{
              position: 'relative',
              height: 48,
              borderRadius: 1.5,
              overflow: 'hidden',
              bgcolor: 'grey.100',
              boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            {allBlocks.map((block, i) => {
              const color      = colorMap.get(block.geofence) ?? '#9E9E9E'
              const isSelected = selectedIndex === i
              return (
                <Tooltip key={i} arrow placement="top" title={blockTooltip(block)}>
                  <Box
                    onClick={() => onSelectIndex?.(isSelected ? null : i)}
                    sx={{
                      position: 'absolute',
                      left:   toLeft(block.startMs),
                      width:  toWidth(block.startMs, block.endMs),
                      top: 0,
                      bottom: 0,
                      bgcolor: color,
                      cursor: 'pointer',
                      borderRight: i < allBlocks.length - 1 ? '2px solid rgba(255,255,255,0.85)' : 'none',
                      outline:       isSelected ? '3px solid rgba(255,255,255,0.9)' : 'none',
                      outlineOffset: '-3px',
                      transition: 'filter 0.15s',
                      '&:hover': { filter: 'brightness(0.82)', zIndex: 1 },
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {block.totalMinutes >= 60 && (
                      <Typography
                        variant="caption"
                        sx={{ color: '#fff', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap', px: 0.5, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                      >
                        {fmtDuration(block.totalMinutes)}
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              )
            })}
          </Box>

          {/* Time axis */}
          <Box sx={{ position: 'relative', height: 22, mt: 0.5 }}>
            {timeTicks.map((tick, i) => (
              <Box
                key={i}
                sx={{
                  position: 'absolute',
                  left: `${tick.pct}%`,
                  transform: tick.isFirst ? 'none' : tick.isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: tick.isFirst ? 'flex-start' : tick.isLast ? 'flex-end' : 'center',
                }}
              >
                <Box sx={{ width: 1, height: 4, bgcolor: 'divider', mb: 0.25 }} />
                <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {tick.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}

      {/* Legend — always shown */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          mt: 1.5,
          pt: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          alignItems: 'center',
        }}
      >
        {uniqueGeofences.map((g) => (
          <Box key={g} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: colorMap.get(g) ?? '#9E9E9E', flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">{g}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  )
}
