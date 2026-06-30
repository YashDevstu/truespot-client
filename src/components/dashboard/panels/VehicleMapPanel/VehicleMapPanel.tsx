'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useMemo } from 'react'
import type mapboxgl from 'mapbox-gl'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'

const DOT_COLORS = [
  '#4285F4', '#9C27B0', '#4CAF50', '#FF5722',
  '#00BCD4', '#FF9800', '#E91E63', '#607D8B',
]

interface VehiclePin {
  key: string
  label: string
  color: string
  lat: number
  lon: number
  geofence: string
  subZone: string
  beaconId: string
  vin: string
}

export interface FocusCoords {
  lat: number
  lon: number
  geofence: string
  subZone: string
}

export interface VehicleMapPanelProps {
  rows: Record<string, unknown>[]
  mapsKey: string
  focusCoords?: FocusCoords | null
}

export default function VehicleMapPanel({ rows, mapsKey, focusCoords }: VehicleMapPanelProps) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<mapboxgl.Map | null>(null)
  const selectedMarker  = useRef<mapboxgl.Marker | null>(null)
  const mapReadyRef     = useRef(false)

  // One pin per vehicle — most recent row that has valid coordinates.
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
      const lat    = parseFloat(String(row['[Latitude]']  ?? ''))
      const lon    = parseFloat(String(row['[Longitude]'] ?? ''))
      return {
        key,
        label:    [model, year ? `'${year.slice(-2)}` : ''].filter(Boolean).join(' ') || vin || key,
        color:    DOT_COLORS[ci++ % DOT_COLORS.length],
        lat, lon,
        geofence: String(row['[Geofence]']   ?? ''),
        subZone:  String(row['[SubGeoZone]'] ?? ''),
        beaconId: beacon, vin,
      }
    })
  }, [rows])

  // ── Map initialisation ──────────────────────────────────────────────────────
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
        mapReadyRef.current = true

        pins.forEach((p) => {
          const el = document.createElement('div')
          el.style.cssText = [
            'width:22px', 'height:22px', 'border-radius:50%',
            `background:${p.color}`, 'border:2.5px solid #fff',
            'box-shadow:0 2px 8px rgba(0,0,0,.5)', 'cursor:pointer',
          ].join(';')

          new mapboxgl.Marker({ element: el })
            .setLngLat([p.lon, p.lat])
            .addTo(map)

          const html = `
            <div style="padding:11px 15px;font-family:system-ui,-apple-system,sans-serif;min-width:200px;line-height:1.6">
              <div style="font-weight:700;font-size:13px;color:#111;margin-bottom:4px">${p.label}</div>
              <div style="font-size:12px;color:#444;margin-bottom:2px">📍 ${p.geofence}</div>
              ${p.subZone ? `<div style="font-size:11px;color:#777;margin-bottom:6px">${p.subZone}</div>` : ''}
              <div style="border-top:1px solid #eee;margin-top:6px;padding-top:6px">
                ${p.vin      ? `<div style="font-size:10px;color:#aaa;font-family:monospace">VIN&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${p.vin}</div>` : ''}
                ${p.beaconId ? `<div style="font-size:10px;color:#aaa">Beacon ${p.beaconId}</div>` : ''}
              </div>
            </div>`

          el.addEventListener('mouseenter', () => {
            popupRef.current?.remove()
            popupRef.current = new mapboxgl.Popup({ closeButton: false, offset: 16, maxWidth: '260px' })
              .setLngLat([p.lon, p.lat]).setHTML(html).addTo(map)
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
      mapReadyRef.current = false
      selectedMarker.current?.remove()
      selectedMarker.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [pins, mapsKey])

  // ── Focus on selected stop ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReadyRef.current || !mapRef.current) return

    // Remove any previous selected-stop marker
    selectedMarker.current?.remove()
    selectedMarker.current = null

    if (!focusCoords) {
      // No stop selected — fly back to the live (most recent) position
      if (pins.length === 1) {
        mapRef.current.flyTo({ center: [pins[0].lon, pins[0].lat], zoom: 17, duration: 900 })
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

    // Inject pulse keyframe once
    if (!document.getElementById('mbPulseStyle')) {
      const s = document.createElement('style')
      s.id = 'mbPulseStyle'
      s.textContent = '@keyframes mbPulse{0%{transform:scale(1);opacity:.75}100%{transform:scale(2.8);opacity:0}}'
      document.head.appendChild(s)
    }

    const color = pins[0]?.color ?? DOT_COLORS[0]

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position:relative;width:26px;height:26px'
    const ring = document.createElement('div')
    ring.style.cssText = `position:absolute;inset:-5px;border-radius:50%;border:3px solid ${color};animation:mbPulse 1.6s ease-out infinite`
    const dot = document.createElement('div')
    dot.style.cssText = `position:absolute;inset:0;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.6);z-index:1`
    wrapper.appendChild(ring)
    wrapper.appendChild(dot)

    import('mapbox-gl').then((mod) => {
      if (!mapRef.current) return
      const marker = new mod.default.Marker({ element: wrapper })
        .setLngLat([focusCoords.lon, focusCoords.lat])
        .addTo(mapRef.current)
      selectedMarker.current = marker
      mapRef.current.flyTo({ center: [focusCoords.lon, focusCoords.lat], zoom: 18, duration: 900 })
    })
  }, [focusCoords, pins])

  const hasData = pins.length > 0

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{
        px: 2.5, py: 1.5,
        display: 'flex', alignItems: 'center', gap: 1,
        borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper',
      }}>
        <LocationOnOutlinedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>Live Positions</Typography>
        <Typography variant="caption" color="text.disabled">
          {hasData
            ? focusCoords
              ? `📍 ${focusCoords.geofence}${focusCoords.subZone ? ` · ${focusCoords.subZone}` : ''}`
              : `${pins.length} vehicle${pins.length !== 1 ? 's' : ''} · live`
            : 'No coordinate data'}
        </Typography>
      </Box>

      {/* Map or empty state */}
      {hasData ? (
        <Box ref={containerRef} sx={{ height: 360, width: '100%' }} />
      ) : (
        <Box sx={{
          height: 360, display: 'flex', flexDirection: 'column',
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

      {/* Vehicle legend */}
      {hasData && (
        <Box sx={{
          px: 2.5, py: 1.25,
          borderTop: '1px solid', borderColor: 'divider',
          display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center',
          bgcolor: 'background.paper',
        }}>
          {pins.map((p) => (
            <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary">{p.label}</Typography>
            </Box>
          ))}
          {focusCoords && (
            <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
              click segment again to reset
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  )
}
