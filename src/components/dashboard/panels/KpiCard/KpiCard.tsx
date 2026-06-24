'use client'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import AccessTimeIcon from '@mui/icons-material/AccessTime'

interface KpiCardProps {
  title: string
  row?: Record<string, unknown>
  loading?: boolean
  error?: string | null
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString()
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
  }
  return str
}

export default function KpiCard({ title, row, loading, error }: KpiCardProps) {
  const displayValue = row ? formatValue(Object.values(row)[0]) : '—'
  const isRefresh = title.toLowerCase().includes('refresh')

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: 'block', mb: 0.75 }}
        >
          {title}
        </Typography>
        {loading ? (
          <Skeleton variant="text" width="60%" height={32} />
        ) : error ? (
          <Tooltip title={error}>
            <Typography variant="h6" color="error.main">
              Error
            </Typography>
          </Tooltip>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {isRefresh && (
              <AccessTimeIcon sx={{ fontSize: 17, color: 'text.secondary', mt: '1px' }} />
            )}
            <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {displayValue}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
