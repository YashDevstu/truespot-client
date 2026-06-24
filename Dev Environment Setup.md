# TrueSpot Dashboard — Development Environment Setup

---

## 1. Software to Install Locally

| Software | Version | Link | Purpose |
|---------|---------|------|---------|
| Node.js | 20 LTS or higher | nodejs.org | Runtime |
| Git | Latest | git-scm.com | Version control |
| VS Code | Latest | code.visualstudio.com | Editor |

### VS Code Extensions (Install These)
- **ESLint** — code quality
- **Prettier** — code formatting
- **TypeScript** — language support
- **Claude Code** — AI assistant
- **GitLens** — git history in editor
- **DotENV** — highlights .env files

---

## 2. Create the Project

Run this once in your projects folder:

```bash
npx create-next-app@latest truespot-dashboard \
  --typescript \
  --eslint \
  --src-dir \
  --app \
  --no-tailwind \
  --import-alias "@/*"
```

Then install all required packages:

```bash
cd truespot-dashboard

npm install \
  @azure/msal-node \
  server-only \
  axios \
  node-cache \
  zod \
  @mui/material \
  @mui/icons-material \
  @emotion/react \
  @emotion/styled \
  ag-grid-react \
  ag-grid-community \
  ag-grid-enterprise \
  recharts \
  azure-maps-control

npm install -D \
  prettier \
  eslint-config-prettier
```

---

## 3. Folder Structure

```
truespot-dashboard/
│
├── .claude/
│   └── settings.json
│
├── public/
│   └── favicon.ico
│
├── src/
│   │
│   ├── app/                                      # Next.js App Router
│   │   ├── (dashboard)/                          # Route group — shared dashboard layout, no URL segment
│   │   │   ├── layout.tsx                        # Sidebar + header shell
│   │   │   └── dashboard/
│   │   │       ├── page.tsx                      # Default → redirect to first client dashboard
│   │   │       └── [clientId]/
│   │   │           └── [dashboardKey]/
│   │   │               └── page.tsx              # e.g. /dashboard/drivetime/critical_zone
│   │   │
│   │   ├── api/
│   │   │   └── v1/                               # Versioned from day one
│   │   │       ├── health/
│   │   │       │   └── route.ts                  # GET — auth + connectivity check
│   │   │       ├── config/
│   │   │       │   └── route.ts                  # GET — client dashboard config
│   │   │       └── query/
│   │   │           └── route.ts                  # POST — execute DAX, return data
│   │   │
│   │   ├── layout.tsx                            # Root layout (MUI ThemeProvider)
│   │   ├── page.tsx                              # Root → redirect to /dashboard
│   │   └── not-found.tsx                         # 404 page
│   │
│   ├── components/
│   │   ├── dashboard/                            # Dashboard feature components
│   │   │   ├── PanelGrid/
│   │   │   │   ├── index.tsx                     # Barrel export
│   │   │   │   └── PanelGrid.tsx                 # Renders panel layout from config
│   │   │   ├── DashboardHeader/
│   │   │   │   ├── index.tsx
│   │   │   │   └── DashboardHeader.tsx           # Title, refresh time, filters
│   │   │   └── panels/                           # Individual panel types
│   │   │       ├── KpiCard/
│   │   │       │   ├── index.tsx
│   │   │       │   └── KpiCard.tsx               # Single metric tile
│   │   │       ├── LineChart/
│   │   │       │   ├── index.tsx
│   │   │       │   └── LineChart.tsx             # Trend over time (Recharts)
│   │   │       ├── BarChart/
│   │   │       │   ├── index.tsx
│   │   │       │   └── BarChart.tsx
│   │   │       ├── DataTable/
│   │   │       │   ├── index.tsx
│   │   │       │   └── DataTable.tsx             # AG Grid — server-side rows
│   │   │       └── MapPanel/
│   │   │           ├── index.tsx
│   │   │           └── MapPanel.tsx              # Azure Maps
│   │   │
│   │   └── ui/                                   # Generic reusable primitives
│   │       ├── PanelSkeleton/
│   │       │   ├── index.tsx
│   │       │   └── PanelSkeleton.tsx             # Loading state per panel type
│   │       ├── ErrorPanel/
│   │       │   ├── index.tsx
│   │       │   └── ErrorPanel.tsx                # Error state display
│   │       └── PageLoader/
│   │           ├── index.tsx
│   │           └── PageLoader.tsx                # Full-page loading spinner
│   │
│   ├── hooks/                                    # Custom React hooks (client-side only)
│   │   ├── useDashboardConfig.ts                 # Fetch + cache client dashboard config
│   │   ├── usePanelQuery.ts                      # Fetch data for one panel
│   │   └── useFilters.ts                         # Filter state (date range, location)
│   │
│   ├── services/                                 # Server-side business logic (used by API routes only)
│   │   ├── auth/
│   │   │   └── msalService.ts                    # Service Principal token acquisition + auto-refresh
│   │   ├── powerbi/
│   │   │   ├── datasetResolver.ts                # Dataset name → ID (1hr cache, survives republish)
│   │   │   ├── queryService.ts                   # Execute DAX against Semantic Model
│   │   │   └── workspaceService.ts               # List workspaces + datasets
│   │   ├── cache/
│   │   │   └── cacheService.ts                   # node-cache wrapper with TTL per data type
│   │   └── config/
│   │       └── clientConfigService.ts            # Load + Zod-validate client JSON config files
│   │
│   ├── config/                                   # Client dashboard definitions (one file per client)
│   │   └── clients/
│   │       └── {client-id}.json                  # e.g. drivetime.json, clientb.json
│   │
│   ├── constants/                                # App-wide constants — no magic strings in code
│   │   ├── api.ts                                # Power BI API endpoints, timeout values, row limits
│   │   ├── cache.ts                              # TTL values per data type
│   │   └── dashboard.ts                          # Panel type enum, default config values
│   │
│   ├── types/                                    # Zod schemas + inferred TypeScript types (co-located)
│   │   ├── dashboard.ts                          # ClientConfig schema + Panel, Dashboard, PanelType types
│   │   ├── powerbi.ts                            # Execute Queries request + response schemas + types
│   │   └── api.ts                                # Internal API request + response schemas + types
│   │
│   ├── utils/                                    # Pure functions — no side effects, no imports from services
│   │   ├── dax.ts                                # DAX query string builders
│   │   ├── formatters.ts                         # Number, date, percentage formatters
│   │   └── errors.ts                             # Error type guards + user-facing messages
│   │
│   ├── providers/                                # React context providers
│   │   ├── ThemeProvider.tsx                     # MUI theme configuration
│   │   └── DashboardProvider.tsx                 # Active client, filters, dashboard state
│   │
│   └── middleware.ts                             # Next.js middleware — future auth guard
│
├── .env.example                                  # Commit this — empty values
├── .env.local                                    # Never commit — real credentials
├── .gitignore
├── CLAUDE.md
├── next.config.ts
├── tsconfig.json
└── package.json
```

### Why Each Folder Exists

| Folder | Purpose | Rule |
|--------|---------|------|
| `app/(dashboard)/` | Route group — shared layout without URL segment | Pages only |
| `app/api/v1/` | Versioned API — future changes won't break existing callers | Route handlers only |
| `components/dashboard/` | Feature-specific components | Presentational only — no API calls |
| `components/ui/` | Generic reusable primitives | No business logic |
| `hooks/` | Custom React hooks | Client-side only, calls `/api/v1/` |
| `services/` | Server-side business logic | Only imported by API routes — never by components |
| `constants/` | Shared constant values | No functions — values only |
| `types/` | Zod schemas + inferred TypeScript types | Each file exports both the schema and the type inferred from it |
| `utils/` | Pure functions | No imports from services or hooks |
| `providers/` | React context | Wrap app layout only |

---

## 4. Environment Files

### `.env.example` (commit this to git)
```env
# Azure App Registration
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_CLIENT_SECRET_EXPIRY=

# Fabric Workspace
FABRIC_WORKSPACE_ID=

# Azure Maps
AZURE_MAPS_KEY=

# AG Grid Enterprise
AG_GRID_LICENSE_KEY=

# Cache TTL in seconds
CACHE_TTL_KPIS=300
CACHE_TTL_CHARTS=600
CACHE_TTL_DATASETS=3600
```

### `.env.local` (never commit — add to .gitignore)
```env
AZURE_TENANT_ID=your-tenant-id-here
AZURE_CLIENT_ID=your-client-id-here
AZURE_CLIENT_SECRET=your-secret-here
AZURE_CLIENT_SECRET_EXPIRY=2027-06-18

# Fabric Workspace
FABRIC_WORKSPACE_ID=your-workspace-id-here

# Azure Maps — get key from Azure Portal → Azure Maps account → Authentication
AZURE_MAPS_KEY=your-azure-maps-key-here

# AG Grid Enterprise — get from ag-grid.com → licences
AG_GRID_LICENSE_KEY=your-ag-grid-license-key-here

# Cache TTL in seconds
CACHE_TTL_KPIS=300
CACHE_TTL_CHARTS=600
CACHE_TTL_DATASETS=3600
```

> **Note on missing keys:** If you don't have the AG Grid or Azure Maps keys yet, leave them blank for now. AG Grid will show a watermark in dev (acceptable), and MapPanel can be skipped until Phase 4. Do not go to production without both keys.

---

## 5. Client Config Structure

### `src/config/clients/drivetime.json`
```json
{
  "client_id": "drivetime",
  "display_name": "DriveTime",
  "locations": ["atlanta", "charlotte", "dfw"],
  "dashboards": {
    "critical_zone": {
      "label": "Critical Zone Report",
      "dataset_name": "REPLACE_WITH_EXACT_NAME_FROM_FABRIC",
      "panels": [
        {
          "id": "cz-total",
          "title": "Total Critical Zone Units",
          "type": "kpi_card",
          "measure": "[Total Critical Zone Units]"
        },
        {
          "id": "cz-trend",
          "title": "Weekly Trend",
          "type": "line_chart",
          "measure": "[Zone Trend Weekly]"
        }
      ]
    },
    "return_unit": {
      "label": "Return Unit Report",
      "dataset_name": "REPLACE_WITH_EXACT_NAME_FROM_FABRIC",
      "panels": []
    },
    "closing_key": {
      "label": "Closing Key Report",
      "dataset_name": "REPLACE_WITH_EXACT_NAME_FROM_FABRIC",
      "panels": []
    }
  }
}
```

> **Note:** Replace all `dataset_name` values with the exact Semantic Model names from the `test-workspaces.js` output. Names must match character-for-character including spacing and capitalisation.

---

## 6. CLAUDE.md (Root of Project)

Create this file at `truespot-dashboard/CLAUDE.md` — this is what makes Claude Code work efficiently:

```markdown
# TrueSpot Dashboard

## What This Project Is
Next.js web dashboard that queries Microsoft Fabric Semantic Models and renders client-specific dashboards. Replaces Power BI reports with a custom React UI. Integrated into the TrueSpot website.

## Architecture
- Frontend: Next.js App Router + React + Material UI + AG Grid + Azure Maps
- Backend: Next.js API routes (server-side, credentials never reach browser)
- Data: Microsoft Fabric Semantic Models via Power BI Execute Queries REST API
- Auth: Azure Service Principal (MSAL Node) — no user-level auth in this layer
- Cache: node-cache (in-memory, local dev) → Redis (production)
- No database — all data from Semantic Model, config from JSON files

## Key Decisions
- Dataset ID is never hardcoded. Always resolved from dataset name via API (see services/powerbi/datasetResolver.ts)
- Each client has one JSON config file in src/config/clients/
- API routes in src/app/api/v1/ are the ONLY place that touches credentials or calls Power BI
- Components in src/components/ are purely presentational — they receive data as props
- All server-side business logic lives in src/services/ — never imported by components or hooks
- hooks/ calls API routes only — never imports from services/ directly
- utils/ contains pure functions only — no imports from services/, hooks/, or providers/
- constants/ contains values only — no functions
- types/ files export both the Zod schema and the TypeScript type inferred from it — never import from schemas/ (it doesn't exist)

## Environment Variables
Required in .env.local:
- AZURE_TENANT_ID — from Azure App Registration
- AZURE_CLIENT_ID — from Azure App Registration
- AZURE_CLIENT_SECRET — from Azure App Registration
- AZURE_CLIENT_SECRET_EXPIRY — date the secret expires (e.g. 2027-06-18)
- FABRIC_WORKSPACE_ID — from Fabric workspace URL
- AZURE_MAPS_KEY — from Azure Portal → Azure Maps account → Authentication
- AG_GRID_LICENSE_KEY — from ag-grid.com licence portal

## How to Run
npm run dev — starts on localhost:3000

## API Routes
- POST /api/v1/query — body: { clientId, dashboardKey, panelId, filters } → returns DAX query result
- GET /api/v1/config?clientId={client-id} → returns dashboard config for that client
- GET /api/v1/health → tests auth and API connectivity, returns status

## Next.js App Router Rules
- services/ files must have `import 'server-only'` at the top — prevents accidental client-side import
- Any component using useState, useEffect, or browser APIs needs `'use client'` at the top
- All files in hooks/ need `'use client'`
- All files in services/ are server-only — never add `'use client'` to them
- API route files (route.ts) are always server-side — no directive needed
- providers/ files need `'use client'` if they use context or hooks

## Data Flow
1. Page loads → fetches /api/v1/config for client config
2. Config returned → page renders panel grid
3. Each panel → fetches /api/v1/query with its measure + filters
4. API route → gets MSAL token → resolves dataset name to ID → calls Execute Queries API → returns data
5. Panel renders with data

## Power BI Execute Queries API
Endpoint: POST https://api.powerbi.com/v1.0/myorg/groups/{workspaceId}/datasets/{datasetId}/executeQueries
Limit: 100,000 rows per query — filters are mandatory for large tables
Auth: Bearer token from MSAL (Service Principal)

## DAX Query Pattern
```json
{
  "queries": [{ "query": "EVALUATE ROW(\"Value\", [Measure Name])" }],
  "serializerSettings": { "includeNulls": true }
}
```

## Adding a New Client
1. Create src/config/clients/{client-id}.json following drivetime.json structure
2. Add dataset_name values matching exact names in Fabric workspace
3. No code changes needed

## Important Constraints
- 100K row limit on Execute Queries API — always filter by date/location/asset
- Data freshness = last Semantic Model refresh time — show timestamp in UI
- Dataset names must exactly match names in Fabric — any mismatch = silent failure
- Client Secret expires in 24 months — expiry date must be tracked
```

---

## 7. Config Files

### `next.config.ts`
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@azure/msal-node'],
}

export default nextConfig
```

> **Why:** Without `serverExternalPackages`, Next.js tries to bundle `@azure/msal-node` for the browser. It's a Node.js-only package and will crash. This tells Next.js to leave it as-is for server-side use.

---

### `.prettierrc`
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

## 9. .gitignore Additions

Add these to the default Next.js .gitignore:

```
# Environment
.env.local
.env.*.local

# Credentials
*.pem
*.key

# OS
.DS_Store
Thumbs.db
```

---

## 10. Run Order (Local Dev)

```bash
# 1. Install dependencies
npm install

# 2. Create .env.local from template (Windows)
copy .env.example .env.local
# Then open .env.local and fill in your credentials

# 3. Start development server
npm run dev

# 4. Test connectivity — open this in your browser
# http://localhost:3000/api/v1/health
```

---

## 11. What to Build First (Phase 1 Order)

1. `src/constants/api.ts` — Power BI endpoints, timeout values, row limit
2. `src/constants/cache.ts` — TTL values per data type
3. `src/constants/dashboard.ts` — PanelType enum, default values
4. `src/types/powerbi.ts` — Zod schemas + types for Execute Queries API
5. `src/types/dashboard.ts` — Zod schemas + types for ClientConfig, Panel, Dashboard
6. `src/types/api.ts` — Zod schemas + types for internal API requests/responses
7. `src/services/auth/msalService.ts` — token acquisition + refresh
8. `src/services/cache/cacheService.ts` — node-cache wrapper
9. `src/services/powerbi/datasetResolver.ts` — name → ID resolver (uses cache)
10. `src/services/powerbi/queryService.ts` — DAX query executor
11. `src/services/config/clientConfigService.ts` — load + validate client JSON files using types/dashboard.ts schema
12. `src/app/api/v1/health/route.ts` — proves full stack works end to end
13. `src/app/api/v1/config/route.ts` — serves client config to frontend
14. `src/app/api/v1/query/route.ts` — serves DAX results to frontend
15. `src/hooks/usePanelQuery.ts` — fetches data for one panel
16. `src/components/dashboard/panels/KpiCard/` — first visible panel with real data
