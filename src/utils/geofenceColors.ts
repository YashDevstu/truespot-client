// Shared colour palette for geofence segments.
// Both JourneyTimeline and LocationsVisitedTable import this so the same
// geofence always renders with the same colour in both components.

export const GEOFENCE_COLORS = [
  '#4A90D9', '#9B59B6', '#27AE60', '#E67E22', '#E74C3C',
  '#1ABC9C', '#E91E63', '#8BC34A', '#FF5722', '#607D8B',
  '#F39C12', '#2ECC71', '#3498DB', '#8E44AD', '#95A5A6',
]

export function buildGeofenceColorMap(geofences: string[]): Map<string, string> {
  const map = new Map<string, string>()
  ;[...new Set(geofences)].forEach((g, i) => map.set(g, GEOFENCE_COLORS[i % GEOFENCE_COLORS.length]))
  return map
}
