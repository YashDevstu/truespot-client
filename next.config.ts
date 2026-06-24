import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@azure/msal-node'],
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
