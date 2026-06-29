'use client'
import 'azure-maps-control/dist/atlas.min.css'
import { useEffect, useRef, useMemo } from 'react'
import type * as AtlasTypes from 'azure-maps-control'
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

export interface VehicleMapPanelProps {
  rows: Record<string, unknown>[]
  mapsKey: string
}

export default function VehicleMapPanel({ rows, mapsKey }: VehicleMapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<AtlasTypes.Map | null>(null)

  // Derive one pin per vehicle using the most recent row that has coordinates.
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
      const model  = String(row['[Model]']     ?? '').trim()
      const year   = String(row['[Year]']      ?? '').trim()
      const vin    = String(row['[VIN]']       ?? '').trim()
      const beacon = String(row['[BeaconId]']  ?? '').trim()
      const lat    = parseFloat(String(row['[Latitude]']  ?? ''))
      const lon    = parseFloat(String(row['[Longitude]'] ?? ''))
      return {
        key,
        label:    [model, year ? `'${year.slice(-2)}` : ''].filter(Boolean).join(' ') || vin || key,
        color:    DOT_COLORS[ci++ % DOT_COLORS.length],
        lat,
        lon,
        geofence: String(row['[Geofence]']   ?? ''),
        subZone:  String(row['[SubGeoZone]'] ?? ''),
        beaconId: beacon,
        vin,
      }
    })
  }, [rows])

  useEffect(() => {
    if (!containerRef.current || !mapsKey || pins.length === 0) return

    let destroyed = false

    import('azure-maps-control').then((atlas) => {
      if (destroyed || !containerRef.current) return

      const avgLat = pins.reduce((s, p) => s + p.lat, 0) / pins.length
      const avgLon = pins.reduce((s, p) => s + p.lon, 0) / pins.length

      const map = new atlas.Map(containerRef.current, {
        authOptions: {
          authType: atlas.AuthenticationType.subscriptionKey,
          subscriptionKey: mapsKey,
        },
        style: 'satellite_road_labels',
        center: [avgLon, avgLat],
        zoom: 16,
        language: 'en-US',
      })
      mapRef.current = map

      map.events.add('ready', () => {
        if (destroyed) return

        const ds = new atlas.source.DataSource()
        map.sources.add(ds)

        pins.forEach((p) => {
          ds.add(new atlas.data.Feature(
            new atlas.data.Point([p.lon, p.lat]),
            { label: p.label, color: p.color, geofence: p.geofence, subZone: p.subZone, beaconId: p.beaconId, vin: p.vin },
          ))
        })

        const bubbleLayer = new atlas.layer.BubbleLayer(ds, undefined, {
          radius: 11,
          color: ['get', 'color'],
          strokeColor: '#ffffff',
          strokeWidth: 2.5,
        })
        map.layers.add(bubbleLayer)

        // Vehicle label floating above each dot
        map.layers.add(new atlas.layer.SymbolLayer(ds, undefined, {
          iconOptions: { image: 'none' },
          textOptions: {
            textField: ['get', 'label'],
            offset: [0, -2],
            color: '#ffffff',
            haloColor: 'rgba(0,0,0,0.72)',
            haloWidth: 1.5,
            size: 11,
          },
        }))

        const popup = new atlas.Popup({ closeButton: false, pixelOffset: [0, -18] })

        map.events.add('mousemove', bubbleLayer, (e) => {
          if (!e.shapes?.length) return
          const shape = e.shapes[0] as AtlasTypes.Shape
          const props = shape.getProperties() as Record<string, string>
          const pos   = shape.getCoordinates() as AtlasTypes.data.Position
          popup.setOptions({
            position: pos,
            content: `
              <div style="padding:11px 15px;font-family:system-ui,-apple-system,sans-serif;min-width:200px;line-height:1.6">
                <div style="font-weight:700;font-size:13px;color:#111;margin-bottom:4px">${props.label}</div>
                <div style="font-size:12px;color:#444;margin-bottom:2px">📍 ${props.geofence}</div>
                ${props.subZone ? `<div style="font-size:11px;color:#777;margin-bottom:6px">${props.subZone}</div>` : ''}
                <div style="border-top:1px solid #eee;margin-top:6px;padding-top:6px">
                  ${props.vin    ? `<div style="font-size:10px;color:#aaa;font-family:monospace">VIN&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${props.vin}</div>`    : ''}
                  ${props.beaconId ? `<div style="font-size:10px;color:#aaa">Beacon ${props.beaconId}</div>` : ''}
                </div>
              </div>`,
          })
          popup.open(map)
          ;(map.getCanvasContainer() as HTMLElement).style.cursor = 'pointer'
        })

        map.events.add('mouseleave', bubbleLayer, () => {
          popup.close()
          ;(map.getCanvasContainer() as HTMLElement).style.cursor = ''
        })

        // Auto-fit bounds to show all pins when multiple vehicles
        if (pins.length > 1) {
          const bbox = atlas.data.BoundingBox.fromPositions(
            pins.map((p): AtlasTypes.data.Position => [p.lon, p.lat]),
          )
          map.setCamera({ bounds: bbox, padding: { top: 64, bottom: 64, left: 64, right: 64 } })
        }
      })
    })

    return () => {
      destroyed = true
      mapRef.current?.dispose()
      mapRef.current = null
    }
  }, [pins, mapsKey])

  const hasData = pins.length > 0

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
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
            ? `${pins.length} vehicle${pins.length !== 1 ? 's' : ''} · satellite view`
            : 'No coordinate data'}
        </Typography>
      </Box>

      {/* ── Map or empty state ────────────────────────────────────────────── */}
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

      {/* ── Vehicle legend ────────────────────────────────────────────────── */}
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
        </Box>
      )}
    </Paper>
  )
}
