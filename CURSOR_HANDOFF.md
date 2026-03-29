# Cursor Handoff

## Project

- Canonical app: repository root at `C:\Users\awcar\Downloads\fluxcloud-fit-evaluator\fluxcloud-constellation-map`
- App type: Next.js App Router + TypeScript
- There is no nested duplicate app folder to keep in sync. Recent remote housekeeping removed the stale nested copy and tightened `.gitignore`.

## What Is Implemented

- App shell and internal APIs:
  - `/api/stars`
  - `/api/detail/[appName]`
  - `/api/search`
  - `/api/filters`
  - `/api/refresh`
  - `/api/version`
- Flux client, normalization, caching, classification, and deterministic layout helpers under `lib/flux/*` and `lib/layout/*`
- Tour waypoint support in `lib/tour/buildTourWaypoints.ts`
- Client-driven constellation scene with focus+context rendering, progressive disclosure, and diegetic overlays

Integrated local feature branches on `main`:

- `focus-context-branch` at `c34581e` (`feat: polish focus context navigation`)
- `gamification-branch` at `738c6f8` (`feat: deepen constellation progression`)
- `visual-layer-branch` at `38ec248` (`feat: brighten constellation art direction`)

Feature work now on `main`:

- Hierarchical layout and snapshot model:
  - region clouds
  - runtime subclusters
  - app systems
  - instance stars
  - scene bounds
  - rare archetype metadata
- Focus + context navigation:
  - narrower configurable fisheye tuning
  - smoother cluster focus fly-in behavior
  - compact clickable mini-map for jump-to-sector navigation
  - disclosure bands for overview, mid, and detail rendering
- Scene rendering overhaul:
  - region/runtime clouds render first
  - app anchors appear when a region is active
  - full stars appear only in detail mode
  - hover uses lightweight tooltips
  - cluster click focuses
  - app/star click opens the detail drawer
- Gamification layer:
  - quest log with progress meters and unlocked badge pills
  - hangar modal for plane skins
  - achievement toasts
  - diegetic HUD quest and exploration counters
  - local progress reset for testing
- Visual layer polish:
  - brighter gradient sky treatment
  - deeper drifting cloud layers
  - slimmer buoy sizing
  - slight category-driven buoy silhouette variation
  - softer glassy panel styling and animated sky accents
- Local persistence for:
  - visited regions
  - discovered runtimes
  - inspected apps
  - rare archetype discoveries
  - unlocked skins
  - selected skin

## Important Files

- `app/page.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `app/api/**/route.ts`
- `components/constellation/ConstellationExperience.tsx`
- `components/constellation/SceneCanvas.tsx`
- `components/constellation/DetailDrawer.tsx`
- `components/constellation/FilterBar.tsx`
- `components/constellation/SearchBox.tsx`
- `components/constellation/MiniMap.tsx`
- `components/constellation/DiegeticHud.tsx`
- `components/constellation/QuestLog.tsx`
- `components/constellation/HangarPanel.tsx`
- `components/constellation/AchievementToast.tsx`
- `components/constellation/ProgressProvider.tsx`
- `lib/buildStamp.ts`
- `lib/canvas/*`
- `lib/flux/*`
- `lib/layout/focusContext.ts`
- `lib/layout/seededLayout.ts`
- `lib/tour/buildTourWaypoints.ts`
- `lib/types/*`
- `next.config.ts`
- `package.json`

## Data Model Notes

`/api/stars` now returns:

- `clusters` with `level`, `parentId`, `radius`, `systemIds`, `counts`, and `rarityFlags`
- `systems` with `regionClusterId`, `runtimeClusterId`, jitter metadata, and archetype rarity metadata
- `stars` with matching cluster links plus jitter/archetype metadata
- `bounds`
- `rareArchetypes`

Region label derivation uses node `regionName`, then country/org fallbacks, then `Unknown Sector`.

## Build Configuration Note

`next.config.ts` uses conservative experimental settings for predictable builds across environments:

- `cpus: 1`
- `webpackBuildWorker: false`
- `workerThreads: false`

## Verification

Completed locally on Windows from repo root:

```powershell
npm run typecheck
npm run build
```

Notes:

- `npm run typecheck` passed after the three feature branches were merged into `main`
- `npm run build` passed on merged `main`
- `npm run dev` was started as a short boot check, but no browser-based smoke test was completed from this environment because the dev server is long-running

## Manual Smoke Still Needed In Cursor

Run from repo root:

```powershell
npm run typecheck
npm run build
npm run dev
```

Then verify:

- first load shows region clouds only
- mini-map stays compact, highlights the current region, and allows jump-to-sector navigation
- fisheye lens feels narrower and less crowding-heavy around the plane
- zooming or flying into a region reveals runtime clouds and app anchors
- deep zoom or close approach reveals individual stars
- cluster click focuses without opening the drawer
- app/star click opens the existing detail drawer
- mini-map tracks plane position and active region
- quests progress and skins unlock only once
- selected skin persists across reload
- hangar modal opens, equips skins, and reset progress clears local storage state
- quest badges, progress meters, and HUD quest readouts stay in sync
- brighter sky, drifting clouds, and slimmer buoy markers still read well on mobile
- mobile flight pad still works with overlays present

## Collaboration And Repo Hygiene

- Do not reintroduce a second full app tree under the repo
- Ignore or delete stray local artifacts such as nested copies or zip exports
- Use `/api/version` and `BUILD_STAMP` to confirm production is serving the intended build

## Practical Summary

- Single Next.js app at repo root
- Public Flux data flows through server routes and deterministic scene layout
- `main` contains the remote housekeeping commits plus the merged focus/context, gamification, and visual-layer work
- After the current push completes, Cursor can handle any final cleanup and deployment follow-through
