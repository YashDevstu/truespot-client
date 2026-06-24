'use client'
import { useState, useCallback, useMemo } from 'react'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import TimelineIcon from '@mui/icons-material/Timeline'
import { useFilters } from '@/hooks/useFilters'
import { usePanelQuery } from '@/hooks/usePanelQuery'
import { useProgressiveDatesQuery } from '@/hooks/useProgressiveDatesQuery'
import { useFilterOptions } from '@/hooks/useFilterOptions'
import { buildGeofenceColorMap } from '@/utils/geofenceColors'
import FilterSidebar from './FilterSidebar'
import DashboardHeader from './DashboardHeader'
import KpiCard from './panels/KpiCard'
import DataTable from './panels/DataTable'
import JourneyTimeline from './panels/JourneyTimeline/JourneyTimeline'
import AssetStatCards from './panels/AssetStatCards'
import LocationsVisitedTable from './panels/LocationsVisitedTable'
import SelectedAssetCard from './SelectedAssetCard'

interface Props {
  clientId: string
  dashboardKey: string
  displayName: string
  dashboardLabel: string
}

// Above this threshold we skip the timeline/table and show the AG Grid instead,
// preventing the main thread from being blocked by a huge useMemo.
const TIMELINE_MAX_ROWS = 5_000

export default function LocationHistoryDashboard({
  clientId,
  dashboardKey,
  displayName,
  dashboardLabel,
}: Props) {
  const { filters, setFilter, resetFilters } = useFilters()
  const [refreshToken, setRefreshToken] = useState(0)
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null)

  // Parse comma-separated date selection; empty / 'all' = show all 8 dates
  const selectedDates: string[] | null = (() => {
    const raw = filters.dateSeen?.trim()
    if (!raw || raw === 'all') return null
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  })()
  const isAllDates = selectedDates === null
  const isMultiDate = selectedDates !== null && selectedDates.length > 1
  const isSingleDate = selectedDates !== null && selectedDates.length === 1

  // Trim needed because comma-separated multi-values are never empty after join
  const hasAssetFilter = !!(filters.beaconId?.trim() || filters.vin?.trim() || filters.stockNumber?.trim())

  const baseFilters = {
    beaconId: filters.beaconId || undefined,
    geofence: filters.geofence || undefined,
    subGeoZone: filters.subGeoZone || undefined,
    floorLevel: filters.floorLevel || undefined,
    vin: filters.vin || undefined,
    stockNumber: filters.stockNumber || undefined,
    assetType: filters.assetType || undefined,
    minDurationMinutes: filters.minDurationMinutes ? Number(filters.minDurationMinutes) : undefined,
    _r: refreshToken,
  }

  // ── Query modes ────────────────────────────────────────────────────────────
  // Progressive (parallel per-date fetches) when:
  //   • all dates + no asset filter (avoids single 700K-row query)
  //   • multiple specific dates selected (any filter state)
  const useProgressiveMode = (isAllDates && !hasAssetFilter) || isMultiDate

  const singleQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    filters: {
      ...baseFilters,
      dateSeen: isAllDates ? 'all' : isSingleDate ? selectedDates![0] : undefined,
    },
    enabled: !useProgressiveMode,
  })

  const progressiveQuery = useProgressiveDatesQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    baseFilters,
    // For all-dates mode, pass no override (hook uses full 8-day list).
    // For multi-date selection, pass only the chosen dates.
    dateLabels: isMultiDate ? selectedDates! : undefined,
    enabled: useProgressiveMode,
  })

  const kpiQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'last-refresh',
    filters: { _r: refreshToken },
  })

  const { options: filterOptions } = useFilterOptions({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    filters,
  })

  const handleRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
  }, [])

  const lastRefreshValue = kpiQuery.data?.rows?.[0]
    ? String(Object.values(kpiQuery.data.rows[0])[0] ?? '')
    : undefined

  const tableRows = useMemo(() => {
    if (useProgressiveMode) return progressiveQuery.rows
    if (singleQuery.loading) return []
    return (singleQuery.data?.rows ?? []) as Record<string, unknown>[]
  }, [useProgressiveMode, progressiveQuery.rows, singleQuery.loading, singleQuery.data?.rows])

  const tableLoading = useProgressiveMode ? progressiveQuery.loading : singleQuery.loading
  const tableError = useProgressiveMode ? null : singleQuery.error

  const dateLabel = isAllDates
    ? 'All Dates'
    : isSingleDate
    ? selectedDates![0]
    : `${selectedDates!.length} dates selected`

  const subtitleText = (() => {
    if (useProgressiveMode && progressiveQuery.loading) {
      const ctx = isMultiDate ? `${progressiveQuery.loadedDates}/${progressiveQuery.totalDates} selected dates` : `${progressiveQuery.loadedDates}/${progressiveQuery.totalDates} dates`
      return `Loading ${ctx} · ${tableRows.length.toLocaleString()} records so far…`
    }
    if (tableLoading) return `${dateLabel} · Loading…`
    return `${dateLabel} · ${tableRows.length.toLocaleString()} records`
  })()

  const selectedAsset = filters.beaconId || filters.vin || filters.stockNumber || undefined

  // ── Rows for timeline + locations table ───────────────────────────────────
  // All rows for the selected asset, capped at TIMELINE_MAX_ROWS to keep the
  // main thread responsive. "All Dates" passes all 8 days combined — no
  // per-day filtering so the user sees the full picture.
  const timelineRows = useMemo(() => {
    if (!selectedAsset || tableLoading) return []
    if (tableRows.length > TIMELINE_MAX_ROWS) return []
    return tableRows
  }, [selectedAsset, tableLoading, tableRows])

  const timelineTooLarge = !!(selectedAsset && !tableLoading && tableRows.length > TIMELINE_MAX_ROWS)

  // All timeline rows passed directly — no single-day slice.
  const singleDayRows = timelineRows

  // Shared colour map — build once from sorted geofences so both components agree
  const sharedColorMap = useMemo(() => {
    const geos = [...singleDayRows]
      .sort((a, b) => {
        const sa = String(a['[StartTime]'] ?? '')
        const sb = String(b['[StartTime]'] ?? '')
        return sa < sb ? -1 : sa > sb ? 1 : 0
      })
      .map((r) => String(r['[Geofence]'] ?? ''))
    return buildGeofenceColorMap(geos)
  }, [singleDayRows])

  // Caption text for AssetStatCards
  const datePeriod = isAllDates
    ? 'last 8 days'
    : isSingleDate && selectedDates![0] === 'Today'
    ? 'today'
    : isSingleDate
    ? `on ${selectedDates![0]}`
    : `over ${selectedDates!.length} dates`

  const singleDayPeriod = datePeriod

  const handleExportPdf = async () => {
    const { exportPdf } = await import('@/utils/exportReport')
    await exportPdf({ clientName: displayName, dashboardLabel, dateLabel, filters, tableRows, selectedAsset: selectedAsset || undefined, datePeriod })
  }

  const handleExportExcel = async () => {
    const { exportExcel } = await import('@/utils/exportReport')
    await exportExcel({ clientName: displayName, dashboardLabel, dateLabel, filters, tableRows, selectedAsset: selectedAsset || undefined, datePeriod })
  }

  // Label above the timeline bar
  const journeyDateLabel = isAllDates
    ? 'ALL DATES JOURNEY'
    : isSingleDate && selectedDates![0] === 'Today'
    ? "TODAY'S JOURNEY"
    : isSingleDate
    ? `${selectedDates![0]} JOURNEY`
    : `${selectedDates!.length} DATES JOURNEY`

  // Show Live badge when Today's data is included
  const showLive = isAllDates || (selectedDates?.includes('Today') ?? false)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'flex-start' }}>
      {/* ── Left sidebar ───────────────────────────────────────────────────── */}
      <FilterSidebar
        filters={filters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        filterOptions={filterOptions}
      />

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          bgcolor: '#f8fafc',
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
        }}
      >
          {/* Alerts */}
          {tableError && <Alert severity="error">{tableError}</Alert>}
          {kpiQuery.error && <Alert severity="error">{kpiQuery.error}</Alert>}

          {/* Page heading */}
          <DashboardHeader
            clientName={displayName}
            dashboardLabel={dashboardLabel}
            lastRefresh={lastRefreshValue}
            onRefresh={handleRefresh}
            onExportPdf={handleExportPdf}
            onExportExcel={handleExportExcel}
            exportDisabled={tableLoading && tableRows.length === 0}
          />

          {/* ── Asset selected: stat cards + timeline + locations table ─── */}
          {selectedAsset ? (
            <>
              {/* Stat cards */}
              {!tableLoading && singleDayRows.length > 0 && (
                <AssetStatCards rows={singleDayRows} datePeriod={singleDayPeriod} />
              )}

              {/* Journey timeline */}
              {timelineTooLarge ? (
                <Paper
                  variant="outlined"
                  sx={{ p: 2.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, color: 'text.disabled' }}
                >
                  <TimelineIcon sx={{ fontSize: 28 }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Journey Timeline</Typography>
                    <Typography variant="caption">
                      {tableRows.length.toLocaleString()} records — add a date or geofence filter to view the timeline.
                    </Typography>
                  </Box>
                </Paper>
              ) : (
                <JourneyTimeline
                  rows={singleDayRows}
                  colorMap={sharedColorMap}
                  dateLabel={journeyDateLabel}
                  selectedIndex={selectedStopIndex}
                  onSelectIndex={setSelectedStopIndex}
                />
              )}

              {/* Selected asset card */}
              {!timelineTooLarge && singleDayRows.length > 0 && (
                <SelectedAssetCard rows={singleDayRows} />
              )}

              {/* Locations visited table */}
              {!timelineTooLarge && (
                <LocationsVisitedTable
                  rows={singleDayRows}
                  colorMap={sharedColorMap}
                  showLive={showLive}
                  selectedIndex={selectedStopIndex}
                  onSelectRow={setSelectedStopIndex}
                />
              )}

              {/* Fall back to AG Grid when rows exceed the cap */}
              {timelineTooLarge && (
                <Box
                  sx={{
                    flex: 1,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h6">Location History</Typography>
                    <Typography variant="caption" color="text.secondary">{subtitleText}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <DataTable
                      rows={tableRows}
                      loading={tableLoading && tableRows.length === 0}
                      error={tableError}
                    />
                  </Box>
                </Box>
              )}
            </>
          ) : (
            <>
              {/* ── No asset: KPI cards + timeline placeholder + AG Grid ── */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <KpiCard
                    title="Last Refresh"
                    row={kpiQuery.data?.rows?.[0]}
                    loading={kpiQuery.loading}
                    error={kpiQuery.error}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <KpiCard
                    title="Records"
                    row={{ Count: tableRows.length }}
                    loading={tableLoading && tableRows.length === 0}
                    error={null}
                  />
                </Grid>
              </Grid>

              {/* Timeline placeholder */}
              <Paper
                variant="outlined"
                sx={{ p: 2.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, color: 'text.disabled' }}
              >
                <TimelineIcon sx={{ fontSize: 28 }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Journey Timeline</Typography>
                  <Typography variant="caption">
                    Filter by Beacon ID, VIN, or Stock Number to view that asset&apos;s journey timeline.
                  </Typography>
                </Box>
              </Paper>

              {/* Full AG Grid table */}
              <Box
                sx={{
                  flex: 1,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6">Location History</Typography>
                  <Typography variant="caption" color="text.secondary">{subtitleText}</Typography>
                </Box>

                {useProgressiveMode && progressiveQuery.loading && (
                  <LinearProgress
                    variant="determinate"
                    value={(progressiveQuery.loadedDates / progressiveQuery.totalDates) * 100}
                    sx={{ height: 3 }}
                  />
                )}

                <Box sx={{ flex: 1 }}>
                  <DataTable
                    rows={tableRows}
                    loading={tableLoading && tableRows.length === 0}
                    error={tableError}
                  />
                </Box>
              </Box>
            </>
          )}
      </Box>
    </Box>
  )
}
