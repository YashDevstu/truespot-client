export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')

  if (!clientId) {
    return Response.json({ error: 'clientId query parameter is required' }, { status: 400 })
  }

  try {
    const config = getClientConfig(clientId)
    return Response.json(config)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 404 })
  }
}
