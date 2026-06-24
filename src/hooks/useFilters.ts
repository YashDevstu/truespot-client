'use client'
import { useTransition, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export interface LocationHistoryFilters {
  beaconId: string
  dateSeen: string
  geofence: string
  subGeoZone: string
  floorLevel: string
  minDurationMinutes: string
  vin: string
  stockNumber: string
  assetType: string
}

const DEFAULTS: LocationHistoryFilters = {
  beaconId: '',
  dateSeen: 'Today',
  geofence: '',
  subGeoZone: '',
  floorLevel: '',
  minDurationMinutes: '0',
  vin: '',
  stockNumber: '',
  assetType: '',
}

export function useFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // startTransition marks the router.push as non-urgent work so the browser
  // stays responsive (can process clicks, input events) while React re-renders
  // the dashboard with the new filter value.
  const [, startTransition] = useTransition()

  const filters: LocationHistoryFilters = {
    beaconId: searchParams.get('beaconId') ?? DEFAULTS.beaconId,
    dateSeen: searchParams.get('dateSeen') ?? DEFAULTS.dateSeen,
    geofence: searchParams.get('geofence') ?? DEFAULTS.geofence,
    subGeoZone: searchParams.get('subGeoZone') ?? DEFAULTS.subGeoZone,
    floorLevel: searchParams.get('floorLevel') ?? DEFAULTS.floorLevel,
    minDurationMinutes: searchParams.get('minDurationMinutes') ?? DEFAULTS.minDurationMinutes,
    vin: searchParams.get('vin') ?? DEFAULTS.vin,
    stockNumber: searchParams.get('stockNumber') ?? DEFAULTS.stockNumber,
    assetType: searchParams.get('assetType') ?? DEFAULTS.assetType,
  }

  const setFilter = useCallback(
    (key: keyof LocationHistoryFilters, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== DEFAULTS[key]) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      // Wrapping in startTransition keeps the dropdown / sidebar interactive
      // while React processes the navigation and subsequent data re-fetch.
      startTransition(() => {
        router.push(`?${params.toString()}`, { scroll: false })
      })
    },
    [searchParams, router, startTransition]
  )

  const resetFilters = useCallback(() => {
    startTransition(() => {
      router.push('?', { scroll: false })
    })
  }, [router, startTransition])

  return { filters, setFilter, resetFilters }
}
