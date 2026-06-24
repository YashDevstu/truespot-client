export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { getFilterOptions } from '@/services/data/fileQueryService'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId     = searchParams.get('clientId')
  const dashboardKey = searchParams.get('dashboardKey')
  const panelId      = searchParams.get('panelId')

  if (!clientId || !dashboardKey || !panelId) {
    return Response.json(
      { error: 'clientId, dashboardKey and panelId query params are required' },
      { status: 400 }
    )
  }

  let clientConfig
  try {
    clientConfig = getClientConfig(clientId)
  } catch {
    return Response.json({ error: `Client "${clientId}" not found` }, { status: 404 })
  }

  const dashboard = clientConfig.dashboards[dashboardKey]
  if (!dashboard) return Response.json({ error: `Dashboard "${dashboardKey}" not found` }, { status: 404 })

  const panel = dashboard.panels.find((p) => p.id === panelId)
  if (!panel) return Response.json({ error: `Panel "${panelId}" not found` }, { status: 404 })

  if (!panel.filter_columns || Object.keys(panel.filter_columns).length === 0) {
    return Response.json({})
  }

  try {
    const options = getFilterOptions(clientId, panel, {
      dateSeen:    searchParams.get('dateSeen')    ?? undefined,
      geofence:    searchParams.get('geofence')    ?? undefined,
      subGeoZone:  searchParams.get('subGeoZone')  ?? undefined,
      floorLevel:  searchParams.get('floorLevel')  ?? undefined,
      beaconId:    searchParams.get('beaconId')    ?? undefined,
      vin:         searchParams.get('vin')         ?? undefined,
      stockNumber: searchParams.get('stockNumber') ?? undefined,
      assetType:   searchParams.get('assetType')   ?? undefined,
    })
    return Response.json(options)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
