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

// ── Injected CSS ─────────────────────────────────────────────────────────────
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
    /* Mapbox popup — lifted z-index so it escapes any stacking context */
    .mapboxgl-popup { z-index: 10 !important; }
    .mapboxgl-popup-content {
      padding: 0 !important;
      border-radius: 10px !important;
      box-shadow: 0 8px 30px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.12) !important;
      border: 1px solid rgba(0,0,0,.07) !important;
      overflow: hidden;
    }
    .mapboxgl-popup-tip { display:none !important; }
    /* Navigation control — slim dark theme */
    .mapboxgl-ctrl-group {
      border-radius: 8px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,.3) !important;
      overflow: hidden;
      border: none !important;
    }
    .mapboxgl-ctrl-group button {
      width: 32px !important; height: 32px !important;
      background: rgba(20,20,20,.85) !important;
      backdrop-filter: blur(6px);
      border: none !important;
      border-bottom: 1px solid rgba(255,255,255,.08) !important;
    }
    .mapboxgl-ctrl-group button:last-child { border-bottom: none !important; }
    .mapboxgl-ctrl-group button:hover { background: rgba(50,50,50,.92) !important; }
    .mapboxgl-ctrl-icon { filter: invert(1) !important; }
  `
  document.head.appendChild(s)
}

const LIVE_GREEN = '#22c55e'

// Sonar-ping live marker — always green
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

// SVG teardrop pin for a historical stop
function makeStopPin(color: string): HTMLElement {
  injectMapStyles()
  const el = document.createElement('div')
  el.style.cssText = [
    'cursor:default',
    'transform-origin:50% 100%',
    'animation:pinDrop .38s cubic-bezier(.34,1.56,.64,1)',
    'filter:drop-shadow(0 3px 8px rgba(0,0,0,.5))',
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

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function VehicleMapPanel({ rows, mapsKey, focusCoords }: VehicleMapPanelProps) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<mapboxgl.Map | null>(null)
  const selectedMarker = useRef<mapboxgl.Marker | null>(null)

  // Most-recent lat/lon per vehicle
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

  // Chronological route coordinates (all valid pings sorted by time)
  const routeCoords = useMemo<[number, number][]>(() => {
    return rows
      .map((r) => ({
        lat: parseFloat(String(r['[Latitude]']  ?? '')),
        lon: parseFloat(String(r['[Longitude]'] ?? '')),
        t:   new Date(String(r['[StartTime]']   ?? '')).getTime(),
      }))
      .filter(({ lat, lon, t }) =>
        isFinite(lat) && isFinite(lon) && !(lat === 0 && lon === 0) && !isNaN(t)
      )
      .sort((a, b) => a.t - b.t)
      .map(({ lon, lat }): [number, number] => [lon, lat])
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
        attributionControl: false,
      })
      mapRef.current = map

      // Compact attribution in bottom-left
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
      // Navigation controls (zoom + compass)
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

      const popupRef = { current: null as mapboxgl.Popup | null }

      map.on('load', () => {
        if (destroyed) return

        // ── Route trail ────────────────────────────────────────────────────
        if (routeCoords.length >= 2) {
          const color = pins[0]?.color ?? DOT_COLORS[0]
          map.addSource('route', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: routeCoords },
              properties: {},
            },
          })
          // Glow layer under the dashed line for depth
          map.addLayer({
            id: 'route-glow',
            type: 'line',
            source: 'route',
            paint: {
              'line-color': color,
              'line-width': 6,
              'line-opacity': 0.18,
              'line-blur': 4,
            },
          })
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            paint: {
              'line-color': color,
              'line-width': 2,
              'line-opacity': 0.75,
              'line-dasharray': [3, 2],
            },
          })
        }

        // ── Live vehicle markers ───────────────────────────────────────────
        pins.forEach((p) => {
          const el = makeLiveMarker()
          new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([p.lon, p.lat])
            .addTo(map)

          const html = `
            <div style="padding:14px 16px;font-family:system-ui,-apple-system,sans-serif;min-width:220px;line-height:1.7">
              <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px">
                <div style="width:11px;height:11px;border-radius:50%;background:${LIVE_GREEN};
                  box-shadow:0 0 0 3px ${LIVE_GREEN}30;flex-shrink:0"></div>
                <span style="font-weight:700;font-size:13.5px;color:#111;letter-spacing:-.1px">${p.label}</span>
                <span style="margin-left:auto;font-size:9.5px;font-weight:700;color:#16a34a;letter-spacing:.7px;
                  background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;padding:2px 7px">LIVE</span>
              </div>
              <div style="font-size:12px;color:#444;margin-bottom:2px;display:flex;align-items:center;gap:5px">
                <span style="color:#aaa">📍</span>${p.geofence}
              </div>
              ${p.subZone ? `<div style="font-size:11px;color:#999;padding-left:19px;margin-bottom:4px">${p.subZone}</div>` : ''}
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f0f0f0;display:flex;flex-direction:column;gap:3px">
                ${p.vin      ? `<div style="font-size:10.5px;color:#bbb;font-family:monospace;letter-spacing:.5px"><span style="color:#ddd">VIN</span>&nbsp;&nbsp;${p.vin}</div>` : ''}
                ${p.beaconId ? `<div style="font-size:10.5px;color:#bbb"><span style="color:#ddd">Beacon</span>&nbsp;${p.beaconId}</div>` : ''}
              </div>
            </div>`

          el.addEventListener('mouseenter', () => {
            popupRef.current?.remove()
            popupRef.current = new mapboxgl.Popup({
              closeButton: false, anchor: 'bottom', offset: [0, -26], maxWidth: '280px',
            }).setLngLat([p.lon, p.lat]).setHTML(html).addTo(map)
          })
          el.addEventListener('mouseleave', () => {
            popupRef.current?.remove()
            popupRef.current = null
          })
        })

        // Fit to show all vehicles
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
  }, [pins, mapsKey, routeCoords])

  // ── Selected stop focus ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyFocus = () => {
      selectedMarker.current?.remove()
      selectedMarker.current = null

      if (!focusCoords) {
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

      const p       = pins[0]
      const color   = p?.color ?? DOT_COLORS[0]
      const pinEl   = makeStopPin(color)

      const durationMin = Math.round((focusCoords.endMs - focusCoords.startMs) / 60_000)
      const durStr = durationMin >= 60
        ? `${Math.floor(durationMin / 60)}h ${durationMin % 60 > 0 ? durationMin % 60 + 'm' : ''}`.trim()
        : `${durationMin}m`

      const stopHtml = `
        <div style="padding:14px 16px;font-family:system-ui,-apple-system,sans-serif;min-width:230px;line-height:1.7">
          <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px">
            <div style="width:11px;height:11px;border-radius:50%;background:${color};flex-shrink:0"></div>
            <span style="font-weight:700;font-size:13.5px;color:#111;letter-spacing:-.1px">${p?.label ?? 'Vehicle'}</span>
            <span style="margin-left:auto;font-size:9.5px;font-weight:700;color:#6366f1;letter-spacing:.7px;
              background:#eef2ff;border:1px solid #c7d2fe;border-radius:5px;padding:2px 7px">STOP</span>
          </div>
          <div style="font-size:12px;color:#444;margin-bottom:2px;display:flex;align-items:center;gap:5px">
            <span style="color:#aaa">📍</span>${focusCoords.geofence}
          </div>
          ${focusCoords.subZone ? `<div style="font-size:11px;color:#999;padding-left:19px;margin-bottom:4px">${focusCoords.subZone}</div>` : ''}
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f0f0f0;display:flex;flex-direction:column;gap:4px">
            <div style="font-size:11.5px;color:#555;display:flex;align-items:center;gap:6px">
              <span style="color:#aaa">🕐</span>
              <span style="font-weight:600">${fmtTime(focusCoords.startMs)}</span>
              <span style="color:#bbb">→</span>
              <span style="font-weight:600">${fmtTime(focusCoords.endMs)}</span>
            </div>
            <div style="font-size:11px;color:#999;padding-left:20px">⏱ ${durStr} at this location</div>
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
            closeButton: false, anchor: 'bottom', offset: [0, -48], maxWidth: '280px',
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
    // No overflow:hidden — lets Mapbox popups float above the panel without clipping
    <Paper variant="outlined" sx={{ borderRadius: 2, bgcolor: 'background.paper', position: 'relative' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Box sx={{
        px: 2.5, py: 1.5,
        display: 'flex', alignItems: 'center', gap: 1.5,
        borderBottom: '1px solid', borderColor: 'divider',
        borderRadius: '8px 8px 0 0',
      }}>
        {isLive
          ? <MyLocationIcon sx={{ fontSize: 17, color: '#22c55e' }} />
          : <LocationOnOutlinedIcon sx={{ fontSize: 17, color: 'primary.main' }} />
        }
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, fontSize: 14 }}>
          {focusCoords ? focusCoords.geofence : 'Live Positions'}
        </Typography>

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
        <Box
          ref={containerRef}
          sx={{
            height: 420, width: '100%',
            // clip only the canvas; popup elements float outside this via Mapbox absolute positioning
            '& .mapboxgl-canvas-container': { borderRadius: 0 },
          }}
        />
      ) : (
        <Box sx={{
          height: 420, display: 'flex', flexDirection: 'column',
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
          borderRadius: '0 0 8px 8px',
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
        }}>
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
