// exportReport.ts — dynamically imported from ExportButton; never runs server-side
// jspdf and xlsx are also dynamically imported inside each function for SSR safety
// and code splitting (libraries only download when the user first clicks Export).
import type { LocationHistoryFilters } from '@/hooks/useFilters'
import { parsePings, mergeConsecutiveStops } from '@/utils/stops'

export interface ExportParams {
  clientName: string
  dashboardLabel: string
  dateLabel: string
  filters: LocationHistoryFilters
  tableRows: Record<string, unknown>[]
  selectedAsset?: string
  datePeriod?: string
}

// ── internal formatters ───────────────────────────────────────────────────────

function parseMs(val: unknown): number | null {
  if (!val) return null
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d.getTime()
}

function fmtDateOnly(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${mm}/${dd}/${yy}`
}

function fmtTimeOnly(ms: number): string {
  const d = new Date(ms)
  let h = d.getHours()
  const min = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${min} ${ampm}`
}

function fmtDateTime(val: unknown): string {
  const ms = parseMs(val)
  if (ms === null) return '—'
  return `${fmtDateOnly(ms)} ${fmtTimeOnly(ms)}`
}

function fmtDuration(minutes: number): string {
  if (minutes < 1) return '<1m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function resolveToday(label: string): string {
  return label === 'Today' ? fmtDateOnly(Date.now()) : label
}

function buildFilename(clientName: string, dateLabel: string, ext: 'pdf' | 'xlsx'): string {
  const d = new Date()
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return `TrueSpot_${safe(clientName)}_${safe(resolveToday(dateLabel))}_${yyyymmdd}.${ext}`
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── filter summary ────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<keyof LocationHistoryFilters, string> = {
  beaconId:           'Beacon ID',
  dateSeen:           'Date Seen',
  geofence:           'Geofence',
  subGeoZone:         'Sub Geo Zone',
  floorLevel:         'Floor Level',
  minDurationMinutes: 'Min Stop Duration',
  vin:                'VIN',
  stockNumber:        'Stock Number',
  assetType:          'Asset Type',
}

export function buildFilterRows(filters: LocationHistoryFilters): [string, string][] {
  const rows: [string, string][] = []
  for (const key of Object.keys(FILTER_LABELS) as (keyof LocationHistoryFilters)[]) {
    const val = filters[key]
    if (!val) continue
    if (key === 'minDurationMinutes' && (val === '0' || val === '')) continue
    const displayVal = val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (key === 'dateSeen' ? resolveToday(s) : s))
      .join(' + ')
    rows.push([FILTER_LABELS[key], displayVal])
  }
  return rows.length > 0 ? rows : [['No filters applied', '—']]
}

// ── stats (mirrors AssetStatCards logic) ─────────────────────────────────────

function mergedIntervalMinutes(rows: Record<string, unknown>[]): number {
  const intervals: [number, number][] = []
  for (const r of rows) {
    const s = parseMs(r['[StartTime]'])
    const e = parseMs(r['[EndTime]'])
    if (s !== null && e !== null && e > s) intervals.push([s, e])
  }
  intervals.sort((a, b) => a[0] - b[0])
  let totalMs = 0
  let curS = -Infinity, curE = -Infinity
  for (const [s, e] of intervals) {
    if (s > curE) {
      if (curE > curS) totalMs += curE - curS
      curS = s; curE = e
    } else {
      curE = Math.max(curE, e)
    }
  }
  if (curE > curS) totalMs += curE - curS
  return Math.round(totalMs / 60_000)
}

interface Stats { totalStops: string; uniqueGeofences: string; totalTimeTracked: string; currentZone: string }

function buildStats(rows: Record<string, unknown>[]): Stats | null {
  if (rows.length === 0) return null
  const stops = mergeConsecutiveStops(parsePings(rows))
  const uniqueGeos = new Set(rows.map((r) => String(r['[Geofence]'] ?? ''))).size
  const totalMins = mergedIntervalMinutes(rows)
  const latest = [...rows].sort((a, b) => (parseMs(b['[StartTime]']) ?? 0) - (parseMs(a['[StartTime]']) ?? 0))[0]
  const subZone  = String(latest?.['[SubGeoZone]'] ?? '')
  const geofence = String(latest?.['[Geofence]'] ?? '')
  const currentZone = subZone ? `${geofence} · ${subZone}` : (geofence || '—')
  return {
    totalStops:       String(stops.length),
    uniqueGeofences:  String(uniqueGeos),
    totalTimeTracked: fmtDuration(totalMins),
    currentZone,
  }
}

// ── table builders ────────────────────────────────────────────────────────────

interface TableData { headers: string[]; body: string[][] }

function buildStopsRows(rows: Record<string, unknown>[]): TableData {
  const headers = ['#', 'Vehicle', 'Geofence', 'Sub Zone', 'Floor Level', 'Date', 'Start', 'End', 'Duration']

  // Build lookups keyed by the raw ping's startMs
  const floorMap   = new Map<number, string>()
  const vehicleMap = new Map<number, string>()
  for (const r of rows) {
    const ms = parseMs(r['[StartTime]'])
    if (ms === null) continue
    if (!floorMap.has(ms))   floorMap.set(ms, String(r['[FloorLevel]'] ?? ''))
    if (!vehicleMap.has(ms)) {
      const make  = String(r['[Make]']  ?? '')
      const model = String(r['[Model]'] ?? '')
      const year  = String(r['[Year]']  ?? '')
      const beacon = String(r['[BeaconId]'] ?? '')
      const v = make && model
        ? `${make} ${model}${year ? ` '${year.slice(-2)}` : ''}`
        : (beacon || '—')
      vehicleMap.set(ms, v)
    }
  }

  const stops = mergeConsecutiveStops(parsePings(rows))
  const body  = stops.map((stop, i) => [
    String(i + 1),
    vehicleMap.get(stop.startMs) ?? '—',
    stop.geofence  || '—',
    stop.subGeoZone || '—',
    floorMap.get(stop.startMs) ?? '—',
    fmtDateOnly(stop.startMs),
    fmtTimeOnly(stop.startMs),
    fmtTimeOnly(stop.endMs),
    fmtDuration(stop.totalMinutes),
  ])
  return { headers, body }
}

function buildRawRows(rows: Record<string, unknown>[]): TableData {
  const headers = [
    'Make', 'Model', 'Year', 'Geofence', 'Sub Zone', 'Floor Level',
    'First Seen', 'Last Seen', 'Duration', 'Beacon ID', 'VIN', 'Stock #', 'Asset Type', 'Battery',
  ]
  const body = rows.map((r) => [
    String(r['[Make]']        ?? ''),
    String(r['[Model]']       ?? ''),
    String(r['[Year]']        ?? ''),
    String(r['[Geofence]']    ?? ''),
    String(r['[SubGeoZone]']  ?? ''),
    String(r['[FloorLevel]']  ?? ''),
    fmtDateTime(r['[StartTime]']),
    fmtDateTime(r['[EndTime]']),
    fmtDuration(Number(r['[MinutesDiff]'] ?? 0)),
    String(r['[BeaconId]']    ?? ''),
    String(r['[VIN]']         ?? ''),
    String(r['[StockNumber]'] ?? ''),
    String(r['[AssetType]']   ?? ''),
    r['[BatteryLevel]'] != null ? `${Number(r['[BatteryLevel]']).toFixed(0)}%` : '—',
  ])
  return { headers, body }
}

// ── colour constants ──────────────────────────────────────────────────────────

type RGB = [number, number, number]
const BRAND_BLUE:   RGB = [0,   82,  164]
const HEADER_GRAY:  RGB = [248, 250, 252]
const TEXT_DARK:    RGB = [30,  41,  59]
const TEXT_MUTED:   RGB = [100, 116, 139]
const BORDER_GRAY:  RGB = [226, 232, 240]
const ACCENT_GREEN: RGB = [39,  174, 96]
const SLATE_700:    RGB = [51,  65,  85]

// ── PDF export ────────────────────────────────────────────────────────────────

const PDF_ROW_CAP = 50_000

// jspdf augments doc with lastAutoTable after each autoTable() call
type DocWithTable = { lastAutoTable: { finalY: number } }

export async function exportPdf(params: ExportParams): Promise<void> {
  const { clientName, dashboardLabel, dateLabel, filters, tableRows, selectedAsset } = params

  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc    = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PAGE_W = doc.internal.pageSize.getWidth()
  const PAGE_H = doc.internal.pageSize.getHeight()
  const ML = 14, MR = 14
  const TOTAL_PG = '{totalPages}'

  doc.setProperties({ title: `TrueSpot Export – ${clientName}` })

  // Footer drawn on every page via didDrawPage
  const drawFooter = () => {
    const pgNum = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } })
      .getCurrentPageInfo().pageNumber
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXT_MUTED)
    doc.text('TrueSpot  |  Confidential', ML, PAGE_H - 8)
    doc.text(`Page ${pgNum} of ${TOTAL_PG}`, PAGE_W - MR, PAGE_H - 8, { align: 'right' })
    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.2)
    doc.line(ML, PAGE_H - 12, PAGE_W - MR, PAGE_H - 12)
  }

  // ── Section 1: Branded header (page 1 only) ─────────────────────────────────
  const now = new Date()
  const generatedAt = `${fmtDateOnly(now.getTime())} ${fmtTimeOnly(now.getTime())}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...BRAND_BLUE)
  doc.text('TrueSpot', ML, 26)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(dashboardLabel, ML, 33)

  // Client name chip
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  const chipW = doc.getTextWidth(clientName) + 6
  doc.setFillColor(...BRAND_BLUE)
  doc.roundedRect(ML, 36, chipW, 5.5, 1, 1, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text(clientName, ML + 3, 40)

  // Right side: generated timestamp + date label
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Generated: ${generatedAt}`, PAGE_W - MR, 26, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.text(resolveToday(dateLabel), PAGE_W - MR, 33, { align: 'right' })

  // Horizontal rule below header
  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.line(ML, 45, PAGE_W - MR, 45)
  drawFooter()   // footer on page 1 (drawn before autoTable to avoid overwrite)

  // ── Section 2: Filters ──────────────────────────────────────────────────────
  const filterRows = buildFilterRows(filters)
  autoTable(doc, {
    startY: 49,
    head: [['APPLIED FILTERS', '']],
    body: filterRows,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 }, textColor: TEXT_DARK },
    headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255] as RGB, fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold', textColor: TEXT_MUTED }, 1: { cellWidth: 'auto' } },
    tableWidth: 125,
    margin: { left: ML, right: MR, top: 12 },
    alternateRowStyles: { fillColor: HEADER_GRAY },
    tableLineColor: BORDER_GRAY,
    tableLineWidth: 0.2,
    didDrawPage: drawFooter,
  })

  // ── Section 3: Summary stats (asset selected only) ──────────────────────────
  const stats = selectedAsset ? buildStats(tableRows) : null

  if (stats) {
    const statsY = (doc as unknown as DocWithTable).lastAutoTable.finalY + 7
    autoTable(doc, {
      startY: statsY,
      head: [['STOPS', 'UNIQUE GEOFENCES', 'TOTAL TIME TRACKED', 'CURRENT ZONE']],
      body: [[stats.totalStops, stats.uniqueGeofences, stats.totalTimeTracked, stats.currentZone]],
      theme: 'plain',
      headStyles: { fillColor: HEADER_GRAY, textColor: TEXT_MUTED, fontStyle: 'bold', fontSize: 7, halign: 'center', cellPadding: { top: 3, bottom: 2, left: 3, right: 3 } },
      bodyStyles: { fontSize: 15, fontStyle: 'bold', halign: 'center', textColor: TEXT_DARK, cellPadding: { top: 5, bottom: 5, left: 3, right: 3 } },
      columnStyles: { 3: { textColor: ACCENT_GREEN } },
      tableWidth: 'auto',
      margin: { left: ML, right: MR, top: 12 },
      tableLineColor: BORDER_GRAY,
      tableLineWidth: 0.2,
      didDrawPage: drawFooter,
    })
  }

  // ── Section 4: Locations Visited (asset selected only) ─────────────────────
  const stopsData = selectedAsset ? buildStopsRows(tableRows) : null
  if (stopsData && stopsData.body.length > 0) {
    const prevY = (doc as unknown as DocWithTable).lastAutoTable.finalY
    const titleY = prevY + 9
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEXT_DARK)
    doc.text('LOCATIONS VISITED', ML, titleY)
    autoTable(doc, {
      startY: titleY + 3,
      head: [stopsData.headers],
      body: stopsData.body,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 }, overflow: 'linebreak', textColor: TEXT_DARK },
      headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255] as RGB, fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
      alternateRowStyles: { fillColor: HEADER_GRAY },
      columnStyles: {
        0: { cellWidth: 9,  halign: 'center', textColor: TEXT_MUTED },
        1: { cellWidth: 30 },
        2: { cellWidth: 42 },
        3: { cellWidth: 38 },
        4: { cellWidth: 20 },
        5: { cellWidth: 18 },
        6: { cellWidth: 20 },
        7: { cellWidth: 20 },
        8: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: ML, right: MR, top: 12 },
      tableLineColor: BORDER_GRAY,
      tableLineWidth: 0.2,
      didDrawPage: drawFooter,
    })
  }

  // ── Section 5: Raw Data ─────────────────────────────────────────────────────
  const rawData   = buildRawRows(tableRows)
  const isCapped  = rawData.body.length > PDF_ROW_CAP
  const rawBody   = isCapped ? rawData.body.slice(0, PDF_ROW_CAP) : rawData.body

  // Decide where to start raw section
  const prevY2 = (doc as unknown as DocWithTable).lastAutoTable?.finalY ?? 49
  const hasRoom = PAGE_H - prevY2 > 55
  if (!hasRoom) doc.addPage()
  const rawSectionY = hasRoom ? prevY2 + 9 : 12

  // Warning banner if capped
  if (isCapped) {
    const noteText = `Note: Export limited to ${PDF_ROW_CAP.toLocaleString()} of ${rawData.body.length.toLocaleString()} records. Apply date, asset, or geofence filters to export a specific subset.`
    doc.setFillColor(254, 243, 199)
    doc.rect(ML, rawSectionY, PAGE_W - ML - MR, 8, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(133, 77, 14)
    doc.text(noteText, ML + 3, rawSectionY + 5, { maxWidth: PAGE_W - ML - MR - 6 })
  }

  const rawTitleY = isCapped ? rawSectionY + 11 : rawSectionY
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_DARK)
  doc.text('LOCATION HISTORY DATA', ML, rawTitleY)

  autoTable(doc, {
    startY: rawTitleY + 3,
    head: [rawData.headers],
    body: rawBody,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, overflow: 'ellipsize', textColor: TEXT_DARK },
    headStyles: { fillColor: SLATE_700, textColor: [255, 255, 255] as RGB, fontStyle: 'bold', fontSize: 6.5, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 } },
    alternateRowStyles: { fillColor: HEADER_GRAY },
    columnStyles: {
      0:  { cellWidth: 14 },
      1:  { cellWidth: 18 },
      2:  { cellWidth: 10, halign: 'center' },
      3:  { cellWidth: 32 },
      4:  { cellWidth: 28 },
      5:  { cellWidth: 12 },
      6:  { cellWidth: 26 },
      7:  { cellWidth: 26 },
      8:  { cellWidth: 16, halign: 'right' },
      9:  { cellWidth: 20 },
      10: { cellWidth: 32 },
      11: { cellWidth: 14 },
      12: { cellWidth: 14 },
      13: { cellWidth: 10, halign: 'center' },
    },
    margin: { left: 10, right: 10, top: 12 },
    tableLineColor: BORDER_GRAY,
    tableLineWidth: 0.2,
    didDrawPage: drawFooter,
  })

  doc.putTotalPages(TOTAL_PG)
  doc.save(buildFilename(clientName, dateLabel, 'pdf'))
}

// ── Excel export ──────────────────────────────────────────────────────────────

const EXCEL_SHEET_MAX = 1_048_575  // Excel row limit minus 1 header row

export async function exportExcel(params: ExportParams): Promise<void> {
  const { clientName, dashboardLabel, dateLabel, filters, tableRows, selectedAsset } = params
  const XLSX = await import('xlsx')

  const filterRows  = buildFilterRows(filters)
  const stats       = selectedAsset ? buildStats(tableRows) : null
  const stopsData   = selectedAsset ? buildStopsRows(tableRows) : null
  const rawData     = buildRawRows(tableRows)
  const rawChunks   = chunkArray(rawData.body, EXCEL_SHEET_MAX)

  const now = new Date()
  const wb  = XLSX.utils.book_new()

  // ── Sheet 1: Summary ────────────────────────────────────────────────────────
  const summaryAoa: (string | number)[][] = [
    [`TrueSpot — ${dashboardLabel}`],
    ['Client:', clientName],
    ['Date Range:', resolveToday(dateLabel)],
    ['Generated:', `${fmtDateOnly(now.getTime())} ${fmtTimeOnly(now.getTime())}`],
    [],
    ['APPLIED FILTERS', ''],
    ['Filter', 'Value'],
    ...filterRows,
  ]

  if (stats) {
    summaryAoa.push(
      [],
      ['SUMMARY STATS', ''],
      ['Stat', 'Value'],
      ['Total Stops', stats.totalStops],
      ['Unique Geofences', stats.uniqueGeofences],
      ['Total Time Tracked', stats.totalTimeTracked],
      ['Current Zone', stats.currentZone],
    )
  }

  if (rawChunks.length > 1) {
    summaryAoa.push(
      [],
      [`Raw Data: ${rawData.body.length.toLocaleString()} records across ${rawChunks.length} sheets (Raw Data (1) … Raw Data (${rawChunks.length}))`],
    )
  }

  const ws1 = XLSX.utils.aoa_to_sheet(summaryAoa)
  ws1['!cols'] = [{ wch: 22 }, { wch: 45 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

  // ── Sheet 2: Stops (asset selected only) ───────────────────────────────────
  if (stopsData && stopsData.body.length > 0) {
    const ws2 = XLSX.utils.aoa_to_sheet([stopsData.headers, ...stopsData.body])
    ws2['!cols'] = [
      { wch: 5 }, { wch: 18 }, { wch: 25 }, { wch: 22 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    ]
    XLSX.utils.book_append_sheet(wb, ws2, 'Stops')
  }

  // ── Sheet 3+: Raw Data (auto-split if >1M rows) ─────────────────────────────
  rawChunks.forEach((chunk, idx) => {
    const sheetName = rawChunks.length > 1 ? `Raw Data (${idx + 1})` : 'Raw Data'
    const ws = XLSX.utils.aoa_to_sheet([rawData.headers, ...chunk])
    ws['!cols'] = [
      { wch: 10 }, { wch: 14 }, { wch: 6  }, { wch: 22 }, { wch: 20 },
      { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 16 },
      { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  })

  XLSX.writeFile(wb, buildFilename(clientName, dateLabel, 'xlsx'))
}
