'use client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FilterListIcon from '@mui/icons-material/FilterList'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import type { LocationHistoryFilters } from '@/hooks/useFilters'
import type { FilterOptions } from '@/components/dashboard/FilterSidebar'

function buildDateOptions() {
  const options: { value: string; label: string }[] = [
    { value: 'all', label: 'All Dates' },
    { value: 'Today', label: 'Today' },
  ]
  for (let i = 1; i <= 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    const label = `${mm}/${dd}/${yy}`
    options.push({ value: label, label })
  }
  return options
}

const DATE_OPTIONS = buildDateOptions()

function makeAutoProps(options: string[]) {
  return {
    options,
    filterOptions: (opts: string[], { inputValue }: { inputValue: string }) =>
      opts.filter((o) => o.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 100),
    freeSolo: true as const,
    clearOnEscape: true,
    autoHighlight: true,
    size: 'small' as const,
  }
}

interface FilterBarProps {
  filters: LocationHistoryFilters
  onFilterChange: (key: keyof LocationHistoryFilters, value: string) => void
  onReset: () => void
  filterOptions: FilterOptions
}

export default function FilterBar({ filters, onFilterChange, onReset, filterOptions }: FilterBarProps) {
  const handleAuto =
    (key: keyof LocationHistoryFilters) =>
    (_: React.SyntheticEvent, value: string | null) =>
      onFilterChange(key, value ?? '')

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        flexWrap: 'wrap',
        px: 3,
        py: 1.25,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      {/* Label */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <FilterListIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.8 }}
        >
          Filters
        </Typography>
      </Box>

      <Divider orientation="vertical" flexItem />

      {/* Date Seen */}
      <TextField
        select
        label="Date Seen"
        value={filters.dateSeen}
        onChange={(e) => onFilterChange('dateSeen', e.target.value)}
        size="small"
        sx={{ minWidth: 130 }}
      >
        {DATE_OPTIONS.map((o) => (
          <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
        ))}
      </TextField>

      <Autocomplete
        {...makeAutoProps(filterOptions.geofence)}
        value={filters.geofence || null}
        onChange={handleAuto('geofence')}
        sx={{ minWidth: 155 }}
        renderInput={(params) => <TextField {...params} label="Geofence" />}
      />

      <Autocomplete
        {...makeAutoProps(filterOptions.subGeoZone)}
        value={filters.subGeoZone || null}
        onChange={handleAuto('subGeoZone')}
        sx={{ minWidth: 145 }}
        renderInput={(params) => <TextField {...params} label="Sub Zone" />}
      />

      <Autocomplete
        {...makeAutoProps(filterOptions.floorLevel)}
        value={filters.floorLevel || null}
        onChange={handleAuto('floorLevel')}
        sx={{ minWidth: 125 }}
        renderInput={(params) => <TextField {...params} label="Floor Level" />}
      />

      <Autocomplete
        {...makeAutoProps(filterOptions.beaconId)}
        value={filters.beaconId || null}
        onChange={handleAuto('beaconId')}
        sx={{ minWidth: 150 }}
        renderInput={(params) => <TextField {...params} label="Beacon ID" />}
      />

      <Autocomplete
        {...makeAutoProps(filterOptions.assetType)}
        value={filters.assetType || null}
        onChange={handleAuto('assetType')}
        sx={{ minWidth: 135 }}
        renderInput={(params) => <TextField {...params} label="Asset Type" />}
      />

      <Autocomplete
        {...makeAutoProps(filterOptions.vin)}
        value={filters.vin || null}
        onChange={handleAuto('vin')}
        sx={{ minWidth: 175 }}
        renderInput={(params) => <TextField {...params} label="VIN" />}
      />

      <Autocomplete
        {...makeAutoProps(filterOptions.stockNumber)}
        value={filters.stockNumber || null}
        onChange={handleAuto('stockNumber')}
        sx={{ minWidth: 140 }}
        renderInput={(params) => <TextField {...params} label="Stock Number" />}
      />

      <TextField
        label="Min Dur (min)"
        type="number"
        value={filters.minDurationMinutes}
        onChange={(e) => onFilterChange('minDurationMinutes', e.target.value)}
        slotProps={{ htmlInput: { min: 0 } }}
        size="small"
        sx={{ minWidth: 115 }}
      />

      <Divider orientation="vertical" flexItem />

      <Button
        variant="text"
        size="small"
        startIcon={<RestartAltIcon sx={{ fontSize: 15 }} />}
        onClick={onReset}
        sx={{ color: 'text.secondary', whiteSpace: 'nowrap', minWidth: 'auto' }}
      >
        Reset
      </Button>
    </Box>
  )
}
