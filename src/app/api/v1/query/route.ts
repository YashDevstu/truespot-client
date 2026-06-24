export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { PanelType } from '@/constants/dashboard'
import { QueryRequestSchema, type QueryResponse } from '@/types/api'
import { getClientConfig } from '@/services/config/clientConfigService'
import { queryRows, getLastRefresh } from '@/services/data/fileQueryService'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = QueryRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 })
  }

  const { clientId, dashboardKey, panelId, filters } = parsed.data

  let clientConfig
  try {
    clientConfig = getClientConfig(clientId)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 404 })
  }

  const dashboard = clientConfig.dashboards[dashboardKey]
  if (!dashboard) {
    return Response.json(
      { error: `Dashboard "${dashboardKey}" not found for client "${clientId}"` },
      { status: 404 }
    )
  }

  const panel = dashboard.panels.find((p) => p.id === panelId)
  if (!panel) {
    return Response.json(
      { error: `Panel "${panelId}" not found in dashboard "${dashboardKey}"` },
      { status: 404 }
    )
  }

  try {
    if (panel.type === PanelType.DATA_TABLE || panel.type === PanelType.JOURNEY_TIMELINE) {
      const rows = queryRows(clientId, {
        dateSeen:           filters?.dateSeen,
        geofence:           filters?.geofence,
        subGeoZone:         filters?.subGeoZone,
        floorLevel:         filters?.floorLevel,
        beaconId:           filters?.beaconId,
        vin:                filters?.vin,
        stockNumber:        filters?.stockNumber,
        assetType:          filters?.assetType,
        minDurationMinutes: filters?.minDurationMinutes,
      })
      return Response.json({ rows, refreshedAt: null } satisfies QueryResponse)
    }

    if (panel.measure) {
      const lastRefresh = getLastRefresh(clientId)
      const rows: Record<string, unknown>[] = [{ '[Value]': lastRefresh }]
      return Response.json({ rows, refreshedAt: null } satisfies QueryResponse)
    }

    return Response.json(
      { error: `Panel "${panelId}" has no measure configured` },
      { status: 400 }
    )
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
