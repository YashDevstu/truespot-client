'use client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import RefreshIcon from '@mui/icons-material/Refresh'
interface DashboardHeaderProps {
  clientName: string
  dashboardLabel: string
  lastRefresh?: string
  onRefresh?: () => void
  onExportPdf?: () => Promise<void>
  onExportExcel?: () => Promise<void>
  exportDisabled?: boolean
}

export default function DashboardHeader({
  clientName,
  dashboardLabel,
  lastRefresh,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
      {/* Title */}
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {dashboardLabel}
        </Typography>
        <Chip
          label={clientName}
          size="small"
          sx={{ mt: 0.75, bgcolor: 'primary.main', color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}
        />
      </Box>

      {/* Controls: last refresh + export + refresh */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexShrink: 0 }}>
        {lastRefresh && (
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
            Last refresh: {lastRefresh}
          </Typography>
        )}

        {onRefresh && (
          <Tooltip title="Refresh data">
            <IconButton onClick={onRefresh} size="small" sx={{ color: 'text.secondary' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}
