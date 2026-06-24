import { z } from 'zod'

export const ExecuteQueriesRequestSchema = z.object({
  queries: z.array(z.object({ query: z.string() })),
  serializerSettings: z.object({ includeNulls: z.boolean() }).optional(),
})

export type ExecuteQueriesRequest = z.infer<typeof ExecuteQueriesRequestSchema>

export const ExecuteQueriesResponseSchema = z.object({
  results: z.array(
    z.object({
      tables: z.array(
        z.object({
          rows: z.array(z.record(z.string(), z.unknown())),
        })
      ),
    })
  ),
})

export type ExecuteQueriesResponse = z.infer<typeof ExecuteQueriesResponseSchema>

export const DatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export type Dataset = z.infer<typeof DatasetSchema>

export const DatasetsResponseSchema = z.object({
  value: z.array(DatasetSchema),
})

export type DatasetsResponse = z.infer<typeof DatasetsResponseSchema>
