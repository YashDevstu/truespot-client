@AGENTS.md

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
