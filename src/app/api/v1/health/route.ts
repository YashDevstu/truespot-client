export const dynamic = 'force-dynamic'

import * as fs from 'fs'
import * as path from 'path'
import { getClientConfig } from '@/services/config/clientConfigService'

function clientsWithData(): string[] {
  const dataDir = path.join(process.cwd(), 'src', 'data')
  if (!fs.existsSync(dataDir)) return []
  return fs.readdirSync(dataDir).filter((name) => {
    const rows = path.join(dataDir, name, 'location-history.json')
    const meta = path.join(dataDir, name, 'meta.json')
    return fs.existsSync(rows) && fs.existsSync(meta)
  })
}

export async function GET() {
  const ready = clientsWithData()

  let dataCheck: { status: 'ok' | 'fail'; clients?: string[]; error?: string }
  try {
    ready.forEach((id) => getClientConfig(id))
    dataCheck = { status: 'ok', clients: ready }
  } catch (err) {
    dataCheck = { status: 'fail', error: String(err) }
  }

  const ok = dataCheck.status === 'ok' && ready.length > 0
  return Response.json(
    {
      status: ok ? 'ok' : 'degraded',
      checks: { data: dataCheck },
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  )
}
