import { z } from 'zod'

export const QueryRequestSchema = z.object({
  clientId: z.string(),
  dashboardKey: z.string(),
  panelId: z.string(),
  filters: z
    .object({
      location: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      beaconId: z.string().optional(),
      dateSeen: z.string().optional(),
      geofence: z.string().optional(),
      subGeoZone: z.string().optional(),
      floorLevel: z.string().optional(),
      minDurationMinutes: z.coerce.number().optional(),
      vin: z.string().optional(),
      stockNumber: z.string().optional(),
      assetType: z.string().optional(),
    })
    .optional(),
})

export type QueryRequest = z.infer<typeof QueryRequestSchema>

export const QueryResponseSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  refreshedAt: z.string().nullable(),
})

export type QueryResponse = z.infer<typeof QueryResponseSchema>

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
})

export type ApiError = z.infer<typeof ApiErrorSchema>
