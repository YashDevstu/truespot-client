import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import { getClientConfig } from '@/services/config/clientConfigService'
import LocationHistoryDashboard from '@/components/dashboard/LocationHistoryDashboard'

interface PageProps {
  params: Promise<{ clientId: string; dashboardKey: string }>
}

export default async function DashboardPage({ params }: PageProps) {
  const { clientId, dashboardKey } = await params

  let config
  try {
    config = getClientConfig(clientId)
  } catch {
    notFound()
  }

  const dashboard = config.dashboards[dashboardKey]
  if (!dashboard) notFound()

  return (
    <Suspense
      fallback={
        <Box sx={{ p: 3 }}>
          <Skeleton height={60} sx={{ mb: 2 }} />
          <Skeleton height={400} />
        </Box>
      }
    >
      <LocationHistoryDashboard
        clientId={clientId}
        dashboardKey={dashboardKey}
        displayName={config.display_name}
        dashboardLabel={dashboard.label}
      />
    </Suspense>
  )
}
