'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

// Distinct dot colors per vehicle slot
const DOT_COLORS = [
  '#4285F4', '#9C27B0', '#4CAF50', '#FF5722',
  '#00BCD4', '#FF9800', '#E91E63', '#607D8B',
]

interface VehicleInfo {
  vin: string
  make: string
  model: string
  year: string
  stockNumber: string
  assetTypes: Set<string>
  color: string
}

interface SelectedAssetCardProps {
  rows: Record<string, unknown>[]
}

export default function SelectedAssetCard({ rows }: SelectedAssetCardProps) {
  const [expanded, setExpanded] = useState(true)

  const { vehicles, heading } = useMemo(() => {
    // Group rows by VIN, preserving insertion order (first seen = first listed)
    const map = new Map<string, VehicleInfo>()
    let colorIdx = 0

    for (const r of rows) {
      const vin  = String(r['[VIN]']         ?? '').trim()
      const type = String(r['[AssetType]']   ?? '').trim()
      const key  = vin || String(r['[StockNumber]'] ?? '').trim() || String(r['[BeaconId]'] ?? '').trim()
      if (!key) continue

      if (!map.has(key)) {
        map.set(key, {
          vin,
          make:        String(r['[Make]']        ?? '').trim(),
          model:       String(r['[Model]']       ?? '').trim(),
          year:        String(r['[Year]']        ?? '').trim(),
          stockNumber: String(r['[StockNumber]'] ?? '').trim(),
          assetTypes:  new Set(),
          color:       DOT_COLORS[colorIdx++ % DOT_COLORS.length],
        })
      }
      if (type) map.get(key)!.assetTypes.add(type)
    }

    const vehicles = [...map.values()]

    // Derive heading from the union of all asset types
    const allTypes = new Set<string>()
    vehicles.forEach((v) => v.assetTypes.forEach((t) => allTypes.add(t.toLowerCase())))
    const hasVehicle = allTypes.has('vehicle')
    const hasKey     = allTypes.has('key')
    const heading =
      hasVehicle && hasKey ? 'Selected Assets'
      : hasKey             ? 'Selected Keys'
      :                      'Selected Vehicles'

    return { vehicles, heading }
  }, [rows])

  if (vehicles.length === 0) return null

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Collapsible header */}
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{
          px: 2.5,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': { bgcolor: 'grey.50' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {heading}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
            {vehicles.length}
          </Typography>
        </Box>
        <IconButton size="small" tabIndex={-1}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        {vehicles.map((v, i) => {
          const name = [v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin || '—'
          return (
            <Box key={v.vin || i}>
              <Divider />
              <Box
                sx={{
                  px: 2.5,
                  py: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                }}
              >
                {/* Left: dot + vehicle name */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: v.color,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {name}
                  </Typography>
                </Box>

                {/* Right: VIN + Stock # */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  {v.vin && (
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', color: 'text.disabled', letterSpacing: 1, fontWeight: 600, fontSize: 10 }}
                      >
                        VIN
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace', letterSpacing: 0.5 }}>
                        {v.vin}
                      </Typography>
                    </Box>
                  )}
                  {v.stockNumber && (
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography
                        variant="caption"
                        sx={{ display: 'block', color: 'text.disabled', letterSpacing: 1, fontWeight: 600, fontSize: 10 }}
                      >
                        STOCK #
                      </Typography>
                      <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.2 }}>
                        {v.stockNumber}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          )
        })}
      </Collapse>
    </Paper>
  )
}
