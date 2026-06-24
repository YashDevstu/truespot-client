export const CACHE_TTL_KPIS = parseInt(process.env.CACHE_TTL_KPIS ?? '300', 10)

export const CACHE_TTL_CHARTS = parseInt(process.env.CACHE_TTL_CHARTS ?? '600', 10)

export const CACHE_TTL_DATASETS = parseInt(process.env.CACHE_TTL_DATASETS ?? '3600', 10)

// Location history rows are expensive to fetch (Power BI API, 15 MB limit per chunk).
// TTL matches typical Fabric model refresh cadence. Stale-while-revalidate in cacheService
// ensures users always get instant responses; background refresh keeps data current.
export const CACHE_TTL_LOCATION_HISTORY = parseInt(process.env.CACHE_TTL_LOCATION_HISTORY ?? '7200', 10)

// Short TTL for 0-row query results. The Fabric model labels the most recent day "Today" and
// rolls the label over on each refresh (e.g. Jun 22 becomes "06/22/26" after the next refresh).
// Without this, a cached "06/22/26 → 0 rows" result would persist for the full TTL even though
// the model has since made that date's data available.
export const CACHE_TTL_EMPTY_ROWS = parseInt(process.env.CACHE_TTL_EMPTY_ROWS ?? '300', 10)
