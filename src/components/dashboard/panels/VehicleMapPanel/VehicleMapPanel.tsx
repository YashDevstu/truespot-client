'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useMemo } from 'react'
import type mapboxgl from 'mapbox-gl'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'

const DOT_COLORS = [
  '#4285F4', '#9C27B0', '#4CAF50', '#FF5722',
  '#00BCD4', '#FF9800', '#E91E63', '#607D8B',
]

// ── CSS animations injected once into <head> ────────────────────────────────
function injectMapStyles() {
  if (document.getElementById('mbMapStyles')) return
  const s = document.createElement('style')
  s.id = 'mbMapStyles'
  s.textContent = `
    @keyframes sonarRing {
      0%   { transform:scale(.35); opacity:.9 }
      100% { transform:scale(2.9); opacity:0  }
    }
    @keyframes pinDrop {
      0%   { transform:scale(0) translateY(-14px); opacity:0 }
      65%  { transform:scale(1.12) translateY(3px); opacity:1 }
      100% { transform:scale(1) translateY(0);      opacity:1 }
    }
  `
  document.head.appendChild(s)
}

const LIVE_GREEN = '#22c55e'

// Sonar-ping live marker — always green, two expanding rings + solid core
function makeLiveMarker(): HTMLElement {
  injectMapStyles()
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:relative;width:44px;height:44px;cursor:pointer'
  wrapper.innerHTML = `
    <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${LIVE_GREEN};
      animation:sonarRing 2.3s ease-out infinite;pointer-events:none"></div>
    <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${LIVE_GREEN};
      animation:sonarRing 2.3s ease-out .9s infinite;pointer-events:none"></div>
    <div style="position:absolute;inset:11px;border-radius:50%;background:${LIVE_GREEN};
      border:2.5px solid #fff;box-shadow:0 0 0 3px ${LIVE_GREEN}35,0 2px 10px rgba(0,0,0,.5)"></div>
  `
  return wrapper
}

// SVG teardrop location pin — clearly a historical point-in-time marker
function makeStopPin(color: string): HTMLElement {
  injectMapStyles()
  const el = document.createElement('div')
  el.style.cssText = [
    'cursor:default',
    'transform-origin:50% 100%',
    'animation:pinDrop .38s cubic-bezier(.34,1.56,.64,1)',
    'filter:drop-shadow(0 3px 7px rgba(0,0,0,.45))',
  ].join(';')
  el.innerHTML = `
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10.4 16 24 16 24S32 26.4 32 16C32 7.163 24.837 0 16 0z"
        fill="${color}"/>
      <circle cx="16" cy="16" r="8" fill="white"/>
      <circle cx="16" cy="16" r="4.5" fill="${color}"/>
    </svg>`
  return el
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours(), m = d.getMinutes()
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// ── Types ───────────────────────────────────────────────────────────────────

interface VehiclePin {
  key: string; label: string; color: string
  lat: number; lon: number
  geofence: string; subZone: string; beaconId: string; vin: string
}

export interface FocusCoords {
  lat: number; lon: number
  geofence: string; subZone: string
  startMs: number; endMs: number
}

export interface VehicleMapPanelProps {
  rows: Record<string, unknown>[]
  mapsKey: string
  focusCoords?: FocusCoords | null
}

// ── Component ───────────────────────────────────────────────────────────────

export default function VehicleMapPanel({ rows, mapsKey, focusCoords }: VehicleMapPanelProps) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<mapboxgl.Map | null>(null)
  const selectedMarker = useRef<mapboxgl.Marker | null>(null)

  // One pin per vehicle — most recent row with valid coordinates
  const pins = useMemo<VehiclePin[]>(() => {
    const byVehicle = new Map<string, { row: Record<string, unknown>; time: number }>()
    for (const row of rows) {
      const lat = parseFloat(String(row['[Latitude]']  ?? ''))
      const lon = parseFloat(String(row['[Longitude]'] ?? ''))
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) continue
      const vin    = String(row['[VIN]']      ?? '').trim()
      const beacon = String(row['[BeaconId]'] ?? '').trim()
      const key    = vin || beacon
      if (!key) continue
      const t = new Date(String(row['[StartTime]'] ?? '')).getTime()
      if (isNaN(t)) continue
      const ex = byVehicle.get(key)
      if (!ex || t > ex.time) byVehicle.set(key, { row, time: t })
    }
    let ci = 0
    return [...byVehicle.entries()].map(([key, { row }]) => {
      const model  = String(row['[Model]']    ?? '').trim()
      const year   = String(row['[Year]']     ?? '').trim()
      const vin    = String(row['[VIN]']      ?? '').trim()
      const beacon = String(row['[BeaconId]'] ?? '').trim()
      return {
        key,
        label:    [model, year ? `'${year.slice(-2)}` : ''].filter(Boolean).join(' ') || vin || key,
        color:    DOT_COLORS[ci++ % DOT_COLORS.length],
        lat:      parseFloat(String(row['[Latitude]']  ?? '')),
        lon:      parseFloat(String(row['[Longitude]'] ?? '')),
        geofence: String(row['[Geofence]']   ?? ''),
        subZone:  String(row['[SubGeoZone]'] ?? ''),
        beaconId: beacon, vin,
      }
    })
  }, [rows])

  // ── Map initialisation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !mapsKey || pins.length === 0) return
    let destroyed = false

    import('mapbox-gl').then((mod) => {
      if (destroyed || !containerRef.current) return
      const mapboxgl = mod.default

      const avgLat = pins.reduce((s, p) => s + p.lat, 0) / pins.length
      const avgLon = pins.reduce((s, p) => s + p.lon, 0) / pins.length

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        accessToken: mapsKey,
        center: [avgLon, avgLat],
        zoom: 15,
      })
      mapRef.current = map

      const popupRef = { current: null as mapboxgl.Popup | null }

      map.on('load', () => {
        if (destroyed) return

        pins.forEach((p) => {
          const el = makeLiveMarker()

          new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([p.lon, p.lat])
            .addTo(map)

          const html = `
            <div style="padding:12px 15px;font-family:system-ui,-apple-system,sans-serif;min-width:210px;line-height:1.65">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
                <div style="width:10px;height:10px;border-radius:50%;background:${p.color};flex-shrink:0"></div>
                <span style="font-weight:700;font-size:13px;color:#111">${p.label}</span>
                <span style="margin-left:auto;font-size:10px;font-weight:600;color:#22c55e;
                  background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:1px 6px">LIVE</span>
              </div>
              <div style="font-size:12px;color:#555;margin-bottom:3px">📍 ${p.geofence}</div>
              ${p.subZone ? `<div style="font-size:11px;color:#888;margin-bottom:6px">${p.subZone}</div>` : ''}
              <div style="border-top:1px solid #f0f0f0;margin-top:7px;padding-top:7px;display:flex;flex-direction:column;gap:2px">
                ${p.vin      ? `<div style="font-size:10px;color:#bbb;font-family:monospace;letter-spacing:.4px">VIN&nbsp;&nbsp;${p.vin}</div>` : ''}
                ${p.beaconId ? `<div style="font-size:10px;color:#bbb">Beacon&nbsp;${p.beaconId}</div>` : ''}
              </div>
            </div>`

          el.addEventListener('mouseenter', () => {
            popupRef.current?.remove()
            popupRef.current = new mapboxgl.Popup({
              closeButton: false, anchor: 'bottom', offset: [0, -26], maxWidth: '270px',
            }).setLngLat([p.lon, p.lat]).setHTML(html).addTo(map)
          })
          el.addEventListener('mouseleave', () => {
            popupRef.current?.remove()
            popupRef.current = null
          })
        })

        if (pins.length > 1) {
          const bounds = new mapboxgl.LngLatBounds()
          pins.forEach((p) => bounds.extend([p.lon, p.lat]))
          map.fitBounds(bounds, { padding: 80, maxZoom: 17 })
        }
      })
    })

    return () => {
      destroyed = true
      selectedMarker.current?.remove()
      selectedMarker.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [pins, mapsKey])

  // ── React to selected stop ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyFocus = () => {
      selectedMarker.current?.remove()
      selectedMarker.current = null

      if (!focusCoords) {
        // Fly back to live position
        if (pins.length === 1) {
          map.flyTo({ center: [pins[0].lon, pins[0].lat], zoom: 17, duration: 900 })
        } else if (pins.length > 1) {
          import('mapbox-gl').then((mod) => {
            if (!mapRef.current) return
            const bounds = new mod.default.LngLatBounds()
            pins.forEach((p) => bounds.extend([p.lon, p.lat]))
            mapRef.current.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 900 })
          })
        }
        return
      }

      const p     = pins[0]
      const color = p?.color ?? DOT_COLORS[0]
      const pinEl = makeStopPin(color)

      const durationMin = Math.round((focusCoords.endMs - focusCoords.startMs) / 60_000)
      const durStr = durationMin >= 60
        ? `${Math.floor(durationMin / 60)}h ${durationMin % 60 > 0 ? durationMin % 60 + 'm' : ''}`.trim()
        : `${durationMin}m`

      const stopHtml = `
        <div style="padding:12px 15px;font-family:system-ui,-apple-system,sans-serif;min-width:220px;line-height:1.65">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
            <span style="font-weight:700;font-size:13px;color:#111">${p?.label ?? 'Vehicle'}</span>
            <span style="margin-left:auto;font-size:10px;font-weight:600;color:#6366f1;
              background:#eef2ff;border:1px solid #c7d2fe;border-radius:4px;padding:1px 6px">STOP</span>
          </div>
          <div style="font-size:12px;color:#555;margin-bottom:3px">📍 ${focusCoords.geofence}</div>
          ${focusCoords.subZone ? `<div style="font-size:11px;color:#888;margin-bottom:6px">${focusCoords.subZone}</div>` : ''}
          <div style="border-top:1px solid #f0f0f0;margin-top:7px;padding-top:7px;display:flex;flex-direction:column;gap:3px">
            <div style="font-size:11px;color:#555">
              🕐 ${fmtTime(focusCoords.startMs)} → ${fmtTime(focusCoords.endMs)}
            </div>
            <div style="font-size:11px;color:#888">⏱ ${durStr} at this location</div>
          </div>
        </div>`

      import('mapbox-gl').then((mod) => {
        if (!mapRef.current) return
        const mapboxgl = mod.default

        const marker = new mapboxgl.Marker({ element: pinEl, anchor: 'bottom' })
          .setLngLat([focusCoords.lon, focusCoords.lat])
          .addTo(mapRef.current)
        selectedMarker.current = marker

        let stopPopup: mapboxgl.Popup | null = null
        pinEl.addEventListener('mouseenter', () => {
          stopPopup?.remove()
          stopPopup = new mapboxgl.Popup({
            closeButton: false, anchor: 'bottom', offset: [0, -48], maxWidth: '270px',
          }).setLngLat([focusCoords.lon, focusCoords.lat])
            .setHTML(stopHtml)
            .addTo(mapRef.current!)
        })
        pinEl.addEventListener('mouseleave', () => {
          stopPopup?.remove()
          stopPopup = null
        })

        mapRef.current.flyTo({ center: [focusCoords.lon, focusCoords.lat], zoom: 18, duration: 900 })
      })
    }

    if (map.isStyleLoaded()) {
      applyFocus()
    } else {
      map.once('load', applyFocus)
      return () => { map.off('load', applyFocus) }
    }
  }, [focusCoords, pins])

  const hasData = pins.length > 0
  const isLive  = hasData && !focusCoords

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Box sx={{
        px: 2.5, py: 1.5,
        display: 'flex', alignItems: 'center', gap: 1.5,
        borderBottom: '1px solid', borderColor: 'divider',
      }}>
        {isLive
          ? <MyLocationIcon sx={{ fontSize: 17, color: '#22c55e' }} />
          : <LocationOnOutlinedIcon sx={{ fontSize: 17, color: 'primary.main' }} />
        }
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, fontSize: 14 }}>
          {focusCoords ? focusCoords.geofence : 'Live Positions'}
        </Typography>

        {/* Right side badge */}
        {hasData && (
          isLive ? (
            <Chip
              size="small"
              label="LIVE"
              sx={{
                height: 22, fontSize: 10, fontWeight: 700, letterSpacing: '.6px',
                bgcolor: '#f0fdf4', color: '#16a34a',
                border: '1px solid #bbf7d0',
                '& .MuiChip-label': { px: 1 },
                '&::before': {
                  content: '""',
                  display: 'inline-block',
                  width: 7, height: 7,
                  borderRadius: '50%',
                  bgcolor: '#22c55e',
                  mr: 0.75,
                  animation: 'liveDot 1.8s ease-in-out infinite',
                  '@keyframes liveDot': {
                    '0%,100%': { opacity: 1 },
                    '50%':     { opacity: .3 },
                  },
                },
              }}
            />
          ) : (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 11 }}>
              {focusCoords?.subZone || 'historical stop'}
            </Typography>
          )
        )}
      </Box>

      {/* ── Map ───────────────────────────────────────────────────────────── */}
      {hasData ? (
        <Box ref={containerRef} sx={{ height: 380, width: '100%' }} />
      ) : (
        <Box sx={{
          height: 380, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          bgcolor: 'grey.50', gap: 1.5, px: 3,
        }}>
          <LocationOnOutlinedIcon sx={{ fontSize: 48, color: 'grey.300' }} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            No location coordinates available
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', maxWidth: 360 }}>
            Add <strong>Latitude</strong> and <strong>Longitude</strong> columns to your Semantic Model
            data export to enable live vehicle positioning on the map.
          </Typography>
        </Box>
      )}

      {/* ── Footer legend ─────────────────────────────────────────────────── */}
      {hasData && (
        <Box sx={{
          px: 2.5, py: 1.25,
          borderTop: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
        }}>
          {/* Vehicle dots */}
          {pins.map((p) => (
            <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{
                width: 10, height: 10, borderRadius: '50%',
                bgcolor: p.color, flexShrink: 0,
                boxShadow: `0 0 0 2px ${p.color}30`,
              }} />
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: 11 }}>
                {p.label}
              </Typography>
            </Box>
          ))}

          {/* Stop time when focused, or hint when live */}
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {focusCoords ? (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 11 }}>
                {fmtTime(focusCoords.startMs)} → {fmtTime(focusCoords.endMs)}
                &nbsp;·&nbsp;click again to reset
              </Typography>
            ) : (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 11 }}>
                satellite view · click a timeline segment to inspect
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Paper>
  )
}
