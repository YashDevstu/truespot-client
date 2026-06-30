import type { Metadata } from 'next'
import './globals.css'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import ThemeProvider from '@/providers/ThemeProvider'

export const metadata: Metadata = {
  title: 'TrueSpot Dashboard',
  description: 'TrueSpot client dashboards powered by Microsoft Fabric',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AppRouterCacheProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
