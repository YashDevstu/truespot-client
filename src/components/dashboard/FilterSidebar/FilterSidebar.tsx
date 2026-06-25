'use client'
import Image from 'next/image'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Slider from '@mui/material/Slider'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined'
import type { LocationHistoryFilters } from '@/hooks/useFilters'


export interface FilterOptions {
  geofence: string[]
  subGeoZone: string[]
  floorLevel: string[]
  beaconId: string[]
  vin: string[]
  stockNumber: string[]
  assetType: string[]
}

interface FilterSidebarProps {
  filters: LocationHistoryFilters
  onFilterChange: (key: keyof LocationHistoryFilters, value: string) => void
  onReset: () => void
  filterOptions: FilterOptions
}

// Parse a comma-separated filter string into an array for multi-select inputs.
function toArray(val: string | undefined): string[] {
  if (!val) return []
  return val.split(',').map((s) => s.trim()).filter(Boolean)
}

// Typed multi-select autocomplete so TypeScript infers renderTags correctly.
function MultiFilter({
  label,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (vals: string[]) => void
  placeholder?: string
}) {
  return (
    <Autocomplete<string, true, false, false>
      multiple
      options={options}
      value={value}
      onChange={(_, vals) => onChange(vals)}
      filterOptions={(opts, { inputValue }) =>
        opts.filter((o) => o.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 100)
      }
      clearOnEscape
      autoHighlight
      size="small"
      limitTags={1}
      disableCloseOnSelect
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          fullWidth
          placeholder={value.length === 0 ? placeholder : undefined}
        />
      )}
    />
  )
}

export default function FilterSidebar({
  filters,
  onFilterChange,
  onReset,
  filterOptions,
}: FilterSidebarProps) {
  const handleMulti = (key: keyof LocationHistoryFilters) => (vals: string[]) =>
    onFilterChange(key, vals.join(','))

  return (
    <Box
      sx={{
        width: 236,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <Image
          src="/images/logo.jpg"
          alt="TrueSpot"
          width={140}
          height={36}
          style={{ objectFit: 'contain', objectPosition: 'left center' }}
          priority
        />
      </Box>

      {/* Filters section */}
      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontSize: 11,
            color: 'text.secondary',
          }}
        >
          Filters
        </Typography>
      </Box>

      <Divider sx={{ mx: 2 }} />

      {/* Scrollable filter list */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
        <Stack spacing={1.5}>

          {/* Asset Type — both options can be active simultaneously */}
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, mb: 0.75, display: 'block' }}>
              Asset Type
            </Typography>
            <ToggleButtonGroup
              value={toArray(filters.assetType)}
              onChange={(_, vals: string[]) => onFilterChange('assetType', vals.join(','))}
              fullWidth
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  flex: 1,
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: 13,
                  gap: 0.75,
                  borderRadius: '8px !important',
                  border: '1px solid',
                  borderColor: 'divider',
                  color: 'text.secondary',
                  py: 0.75,
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: '#fff',
                    borderColor: 'primary.main',
                    '&:hover': { bgcolor: 'primary.dark' },
                  },
                },
                gap: 1,
              }}
            >
              <ToggleButton value="Vehicle">
                <DirectionsCarOutlinedIcon sx={{ fontSize: 15 }} />
                Vehicle
              </ToggleButton>
              <ToggleButton value="Key">
                <VpnKeyOutlinedIcon sx={{ fontSize: 15 }} />
                Key
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <MultiFilter
            label="Geofence"
            options={filterOptions.geofence}
            value={toArray(filters.geofence)}
            onChange={handleMulti('geofence')}
          />

          <MultiFilter
            label="Sub Geo Zone"
            options={filterOptions.subGeoZone}
            value={toArray(filters.subGeoZone)}
            onChange={handleMulti('subGeoZone')}
          />

          <MultiFilter
            label="Floor Level"
            options={filterOptions.floorLevel}
            value={toArray(filters.floorLevel)}
            onChange={handleMulti('floorLevel')}
          />

          {/* Bounce Filter Interval */}
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, mb: 1, display: 'block' }}>
              Bounce Filter Interval
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <TextField
                type="number"
                value={filters.minDurationMinutes}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(60, Number(e.target.value)))
                  onFilterChange('minDurationMinutes', String(v))
                }}
                slotProps={{ htmlInput: { min: 0, max: 60 } }}
                size="small"
                sx={{ width: 60, '& input': { textAlign: 'center', px: 0.5 } }}
              />
              <Slider
                value={Number(filters.minDurationMinutes) || 0}
                onChange={(_, val) => onFilterChange('minDurationMinutes', String(val))}
                min={0}
                max={60}
                step={1}
                size="small"
                sx={{ flex: 1, color: 'primary.main' }}
              />
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block' }}>
              Min stop duration (minutes)
            </Typography>
          </Box>

          <MultiFilter
            label="Beacon ID"
            options={filterOptions.beaconId}
            value={toArray(filters.beaconId)}
            onChange={handleMulti('beaconId')}
          />

          <MultiFilter
            label="VIN"
            options={filterOptions.vin}
            value={toArray(filters.vin)}
            onChange={handleMulti('vin')}
          />

          <MultiFilter
            label="Stock Number"
            options={filterOptions.stockNumber}
            value={toArray(filters.stockNumber)}
            onChange={handleMulti('stockNumber')}
          />

        </Stack>
      </Box>

      {/* Reset button */}
      <Box sx={{ px: 2, py: 2, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<RestartAltIcon />}
          onClick={onReset}
          fullWidth
          disableElevation
        >
          Reset Filters
        </Button>
      </Box>
    </Box>
  )
}
