'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined'

// ── helpers ───────────────────────────────────────────────────────────────────
function parseMs(val: unknown): number | null {
  if (!val) return null
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d.getTime()
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateLabel(startMs: number, endMs: number): string {
  const startDay = new Date(startMs).toDateString()
  const endDay   = new Date(endMs).toDateString()
  if (startDay === endDay) return fmtDateShort(startMs)
  return `${fmtDateShort(startMs)} → ${fmtDateShort(endMs)}`
}

function fmtDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${minutes}m`
}

const pulseRing = {
  '@keyframes pulseRing': {
    '0%': { transform: 'scale(1)', opacity: 0.8 },
    '70%': { transform: 'scale(2.2)', opacity: 0 },
    '100%': { transform: 'scale(2.2)', opacity: 0 },
  },
} as const

// ── types ─────────────────────────────────────────────────────────────────────
type SortMode = 'live' | 'oldest' | 'duration'

interface Stop {
  geofence: string
  subZone: string
  floorLevel: string
  assetType: string
  make: string
  model: string
  year: string
  startMs: number
  endMs: number
  minutes: number
}

function AssetIcon({ assetType }: { assetType: string }) {
  const lower = assetType.toLowerCase()
  if (lower === 'key') return <VpnKeyOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
  return <DirectionsCarOutlinedIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
}

// Small pill-shaped sort button
function SortPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        border: '1px solid',
        borderColor: active ? 'primary.main' : 'divider',
        bgcolor: active ? 'primary.main' : 'transparent',
        color: active ? '#fff' : 'text.secondary',
        borderRadius: '999px',
        px: 1.5,
        py: 0.4,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        lineHeight: 1.5,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
        '&:hover': {
          bgcolor: active ? 'primary.dark' : 'grey.100',
          borderColor: active ? 'primary.dark' : 'grey.400',
        },
      }}
    >
      {label}
    </Box>
  )
}

const COLUMNS = ['#', 'VEHICLE', 'GEOFENCE', 'SUBZONE', 'TIME RANGE', 'DURATION'] as const
const GRID = '40px minmax(170px, 200px) minmax(140px, 1fr) minmax(160px, 1fr) 195px 95px'

// ── LocationsVisitedTable ─────────────────────────────────────────────────────
interface LocationsVisitedTableProps {
  rows: Record<string, unknown>[]
  colorMap: Map<string, string>
  showLive?: boolean
  selectedIndex?: number | null
  onSelectRow?: (index: number | null) => void
}

export default function LocationsVisitedTable({
  rows,
  colorMap,
  showLive = false,
  selectedIndex,
  onSelectRow,
}: LocationsVisitedTableProps) {
  const [sortMode, setSortMode] = useState<SortMode>(showLive ? 'live' : 'oldest')
  const [collapsed, setCollapsed] = useState(false)

  const { stops, liveStop } = useMemo(() => {
    const parsed = rows
      .map((r) => {
        const startMs = parseMs(r['[StartTime]'])
        const endMs   = parseMs(r['[EndTime]'])
        if (startMs === null || endMs === null) return null
        return {
          geofence:   String(r['[Geofence]']   ?? ''),
          subZone:    String(r['[SubGeoZone]']  ?? ''),
          floorLevel: String(r['[FloorLevel]']  ?? ''),
          assetType:  String(r['[AssetType]']   ?? ''),
          make:       String(r['[Make]']        ?? ''),
          model:      String(r['[Model]']       ?? ''),
          year:       String(r['[Year]']        ?? ''),
          startMs,
          endMs,
          minutes: Number(r['[MinutesDiff]'] ?? 0),
        }
      })
      .filter((s): s is Stop => s !== null)

    // The live stop is always the chronologically most recent, regardless of display order
    const maxStartMs = parsed.length > 0 ? Math.max(...parsed.map((s) => s.startMs)) : -Infinity
    const liveStop   = showLive ? (parsed.find((s) => s.startMs === maxStartMs) ?? null) : null

    let sorted: Stop[]
    switch (sortMode) {
      case 'live':
        // Most recent (live) stop at top → newest-first
        sorted = [...parsed].sort((a, b) => b.startMs - a.startMs)
        break
      case 'oldest':
        // Chronological journey order → oldest-first
        sorted = [...parsed].sort((a, b) => a.startMs - b.startMs)
        break
      case 'duration':
        // Longest stays first — useful for understanding where the asset spent most time
        sorted = [...parsed].sort((a, b) => b.minutes - a.minutes)
        break
      default:
        sorted = [...parsed].sort((a, b) => a.startMs - b.startMs)
    }

    return { stops: sorted, liveStop }
  }, [rows, sortMode, showLive])

  if (stops.length === 0) return null

  const liveColor = liveStop ? colorMap.get(liveStop.geofence) ?? '#9E9E9E' : undefined

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode)
    onSelectRow?.(null) // clear row selection when sort changes
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2 }}>
      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'background.paper', borderRadius: '8px 8px 0 0' }}>

        {/* Title row — always visible */}
        <Box
          sx={{
            px: 2.5,
            py: 1.25,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderBottom: collapsed ? 'none' : '1px solid',
            borderColor: 'divider',
          }}
        >
          {/* Left: title + count */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 0.5 }}>
            Locations visited
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, mr: 'auto' }}>
            {stops.length} stops
          </Typography>

          {/* Sort pills */}
          {showLive && (
            <SortPill label="Live" active={sortMode === 'live'} onClick={() => handleSortChange('live')} />
          )}
          <SortPill label="Oldest first" active={sortMode === 'oldest'} onClick={() => handleSortChange('oldest')} />
          <SortPill label="By duration"  active={sortMode === 'duration'} onClick={() => handleSortChange('duration')} />

          {/* Collapse toggle */}
          <IconButton
            size="small"
            onClick={() => setCollapsed((v) => !v)}
            sx={{ ml: 0.5 }}
          >
            {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
          </IconButton>
        </Box>

        {/* Collapsible: Live banner + column labels */}
        <Collapse in={!collapsed}>
          {/* Live Now banner */}
          {liveStop && (
            <Box
              sx={{
                px: 2.5,
                py: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                bgcolor: '#E8F5E9',
                borderBottom: '2px solid #A5D6A7',
              }}
            >
              {/* Pulsing ring + solid dot */}
              <Box sx={{ position: 'relative', width: 12, height: 12, flexShrink: 0 }}>
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    bgcolor: 'success.main',
                    ...pulseRing,
                    animation: 'pulseRing 1.8s ease-out infinite',
                  }}
                />
                <Box sx={{ position: 'relative', width: 12, height: 12, borderRadius: '50%', bgcolor: 'success.main' }} />
              </Box>

              {/* Location text */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark' }}>Live now</Typography>
                <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'success.light', flexShrink: 0 }} />
                {liveColor && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: liveColor, flexShrink: 0 }} />}
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>{liveStop.geofence}</Typography>
                {liveStop.subZone && (
                  <Typography variant="body2" color="text.secondary" noWrap>· {liveStop.subZone}</Typography>
                )}
              </Box>

              {/* Since time */}
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                since {fmtTime(liveStop.startMs)}
              </Typography>
            </Box>
          )}

          {/* Column labels */}
          <Box
            sx={{
              px: 2.5,
              py: 1,
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 1,
              bgcolor: 'grey.50',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {COLUMNS.map((h) => (
              <Typography
                key={h}
                variant="caption"
                sx={{ fontWeight: 700, color: 'text.disabled', letterSpacing: 0.8, fontSize: 10 }}
              >
                {h}
              </Typography>
            ))}
          </Box>
        </Collapse>
      </Box>

      {/* ── Data rows ────────────────────────────────────────────────────── */}
      <Collapse in={!collapsed}>
        {stops.map((stop, i) => {
          // isLive is based on startMs identity, not position — survives any sort order
          const isLive     = showLive && liveStop !== null && stop.startMs === liveStop.startMs
          const isSelected = selectedIndex === i
          const dotColor   = colorMap.get(stop.geofence) ?? '#9E9E9E'

          return (
            <Box
              key={`${stop.startMs}-${stop.geofence}-${i}`}
              onClick={() => onSelectRow?.(isSelected ? null : i)}
              sx={{
                px: 2.5,
                py: 1.5,
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 1,
                alignItems: 'center',
                bgcolor: isSelected ? '#E3F2FD' : isLive ? '#F1FBF3' : 'transparent',
                borderBottom: '1px solid',
                borderColor: isLive ? '#C8E6C9' : 'divider',
                borderLeft: isLive ? '3px solid' : '3px solid transparent',
                borderLeftColor: isLive ? 'success.main' : 'transparent',
                '&:last-child': { borderBottom: 'none' },
                cursor: 'pointer',
                transition: 'background-color 0.12s',
                '&:hover': {
                  bgcolor: isSelected ? '#BBDEFB' : isLive ? '#E8F5E9' : 'grey.50',
                },
              }}
            >
              {/* # */}
              <Typography variant="body2" color="text.disabled" sx={{ fontWeight: 500 }}>{i + 1}</Typography>

              {/* Vehicle */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <AssetIcon assetType={stop.assetType} />
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.primary' }}
                >
                  {stop.model
                    ? `${stop.model}${stop.year ? ` '${String(stop.year).slice(-2)}` : ''}`
                    : stop.make || '—'}
                </Typography>
              </Box>

              {/* Geofence: colored dot + name */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Box sx={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                  {isLive && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        bgcolor: dotColor,
                        ...pulseRing,
                        animation: 'pulseRing 1.8s ease-out infinite',
                      }}
                    />
                  )}
                  <Box sx={{ position: 'relative', width: 10, height: 10, borderRadius: '50%', bgcolor: dotColor }} />
                </Box>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: isLive ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {stop.geofence || '—'}
                </Typography>
              </Box>

              {/* Subzone + floor level */}
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {stop.subZone || '—'}
                </Typography>
                {stop.floorLevel && (
                  <Typography variant="caption" color="text.disabled">{stop.floorLevel}</Typography>
                )}
              </Box>

              {/* Time range: date label above, time range below */}
              <Box>
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', lineHeight: 1.2, mb: 0.25 }}>
                  {isLive ? fmtDateShort(stop.startMs) : fmtDateLabel(stop.startMs, stop.endMs)}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                  {fmtTime(stop.startMs)}
                  {' → '}
                  {isLive
                    ? <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>now</Box>
                    : fmtTime(stop.endMs)
                  }
                </Typography>
              </Box>

              {/* Duration + Live chip */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: isLive ? 700 : 500, color: isLive ? 'success.main' : 'text.primary' }}
                >
                  {fmtDuration(stop.minutes)}
                </Typography>
                {isLive && (
                  <Chip
                    label="Live"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 10,
                      fontWeight: 700,
                      bgcolor: 'success.main',
                      color: '#fff',
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />
                )}
              </Box>
            </Box>
          )
        })}
      </Collapse>
    </Paper>
  )
}
