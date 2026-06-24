import 'server-only'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ClientConfigSchema, type ClientConfig } from '@/types/dashboard'

const configCache = new Map<string, ClientConfig>()

export function getClientConfig(clientId: string): ClientConfig {
  if (configCache.has(clientId)) return configCache.get(clientId)!

  const filePath = join(process.cwd(), 'src', 'config', 'clients', `${clientId}.json`)

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    throw new Error(
      `Client config not found for "${clientId}". Expected file at src/config/clients/${clientId}.json`
    )
  }

  const result = ClientConfigSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `Invalid config for client "${clientId}": ${result.error.message}`
    )
  }

  configCache.set(clientId, result.data)
  return result.data
}
