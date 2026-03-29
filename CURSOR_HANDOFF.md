# Cursor Handoff

## Project

- **Canonical app**: repository root (Next.js App Router). There is no nested duplicate app folder in this repo.
- This handoff describes the shipped FluxCloud Constellation Map UX: galactic atlas, cartoon sky, tour mode, and internal APIs.

## What is implemented

- App shell, global styling (Flux-aligned palette), error boundaries (`not-found`, `global-error`)
- **Client-driven scene**: `ConstellationExperience` loads stars from `/api/stars` after mount (avoids heavy server/client serialization on `/`).
- **Internal API routes**:
  - `/api/stars`, `/api/detail/[appName]`, `/api/search`, `/api/filters`, `/api/refresh`
  - `/api/version` — JSON with `buildStamp` for deploy verification (see `lib/buildStamp.ts`)
- Flux client, normalization, classification, caching (`lib/flux/*`)
- Deterministic layout (`lib/layout/seededLayout.ts`)
- **Canvas / UX**: cartoon markers and buoy styling (`lib/canvas/*`), scene interactions (`components/constellation/SceneCanvas.tsx`)
- **Tour**: waypoint builder (`lib/tour/buildTourWaypoints.ts`) integrated in the constellation experience
- Search, filters, detail drawer, onboarding-style hints where applicable

## Important files (non-exhaustive)

- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`
- `app/api/**/route.ts` (including `app/api/version/route.ts`)
- `components/constellation/*.tsx`
- `lib/flux/*`, `lib/layout/seededLayout.ts`, `lib/types/*`
- `lib/buildStamp.ts`, `lib/canvas/*`, `lib/tour/buildTourWaypoints.ts`
- `next.config.ts`, `package.json`

## Build configuration note

`next.config.ts` uses conservative experimental settings (`cpus: 1`, `webpackBuildWorker: false`, `workerThreads: false`) for predictable builds across environments.

## Verification (local)

From the repo root:

```powershell
npm install
npm run typecheck
npm run build
```

As of the last stewardship pass, `typecheck` and `next build` completed successfully on Windows (Next 15.x). If `build` fails in a new environment, capture the full stack trace and whether it occurs during compile, data collection, or static generation.

## Collaboration / repo hygiene

- Do not reintroduce a second full app tree under the repo; it duplicates drift and confuses deploy roots.
- Ignore or delete local artifacts such as stray `.zip` files or nested copies of this folder; `.gitignore` includes common patterns for those.

## Practical summary

- Single Next.js app at root, wired to Flux public data via server routes.
- Use `/api/version` and `BUILD_STAMP` to confirm production is serving the intended build.
