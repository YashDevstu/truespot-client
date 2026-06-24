import { z } from 'zod'
import { PanelType } from '@/constants/dashboard'

export const PanelConfigSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.nativeEnum(PanelType),
  measure: z.string().optional(),
  // Maps filter key → DAX column reference (e.g. "geofence" → "AppendFinal[Geofence]")
  // Used by /api/v1/filter-options to run DISTINCT queries server-side.
  filter_columns: z.record(z.string(), z.string()).optional(),
})

export type PanelConfig = z.infer<typeof PanelConfigSchema>

export const DashboardConfigSchema = z.object({
  label: z.string(),
  dataset_name: z.string(),
  panels: z.array(PanelConfigSchema),
})

export type DashboardConfig = z.infer<typeof DashboardConfigSchema>

export const ClientConfigSchema = z.object({
  client_id: z.string(),
  display_name: z.string(),
  locations: z.array(z.string()),
  dashboards: z.record(z.string(), DashboardConfigSchema),
})

export type ClientConfig = z.infer<typeof ClientConfigSchema>
