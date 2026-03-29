# Cursor Handoff

## Project

- Project root: `C:\Users\awcar\Downloads\fluxcloud-fit-evaluator\fluxcloud-constellation-map`
- App type: Next.js App Router + TypeScript

## What Changed

The constellation map was refactored around a focus+context exploration model with progressive disclosure and local game-like progression.

Implemented areas:

- Hierarchical layout and snapshot model:
  - region clouds
  - runtime subclusters
  - app systems
  - instance stars
  - scene bounds
  - rare archetype metadata
- New client-side focus/context helpers:
  - disclosure band selection
  - fisheye lens transform
  - density alpha and deterministic jitter helpers
- Scene rendering overhaul:
  - region/runtime clouds render first
  - app anchors appear when a region is active
  - full stars appear only in detail mode
  - hover uses lightweight tooltips
  - cluster click focuses
  - app/star click opens the detail drawer
- New diegetic overlays and progression UI:
  - mini-map
  - HUD
  - quest log
  - hangar / plane skins
  - achievement toast
- Local persistence for:
  - visited regions
  - discovered runtimes
  - inspected apps
  - rare archetype discoveries
  - unlocked skins
  - selected skin

## Important Files

Modified:

- `app/globals.css`
- `components/constellation/ConstellationExperience.tsx`
- `components/constellation/SceneCanvas.tsx`
- `lib/canvas/buoyCategory.ts`
- `lib/canvas/cartoonMarkers.ts`
- `lib/flux/normalize.ts`
- `lib/layout/seededLayout.ts`
- `lib/types/star.ts`

New:

- `components/constellation/AchievementToast.tsx`
- `components/constellation/DiegeticHud.tsx`
- `components/constellation/HangarPanel.tsx`
- `components/constellation/MiniMap.tsx`
- `components/constellation/ProgressProvider.tsx`
- `components/constellation/QuestLog.tsx`
- `lib/layout/focusContext.ts`

## Data Model Notes

`/api/stars` now returns:

- `clusters` with `level`, `parentId`, `radius`, `systemIds`, `counts`, and `rarityFlags`
- `systems` with `regionClusterId`, `runtimeClusterId`, jitter metadata, and archetype rarity metadata
- `stars` with matching cluster links plus jitter/archetype metadata
- `bounds`
- `rareArchetypes`

Region label derivation uses node `regionName`, then country/org fallbacks, then `Unknown Sector`.

## Current Verification Status

Passing:

- `npm.cmd run typecheck`
- `npm.cmd run build -- --experimental-build-mode generate-env`

Blocked in this sandbox by process spawning restrictions (`spawn EPERM`):

- `npm.cmd run build`
- `npm.cmd run build -- --experimental-build-mode compile`
- `npm.cmd run dev`

Observed behavior:

- Next compiles successfully
- type validation completes
- then the environment fails during a later spawn step

This looks environment-specific, not like a TypeScript or bundling error in the app code.

## Manual Smoke Coverage Still Needed In Cursor

Run outside this sandbox:

```powershell
npm run typecheck
npm run build
npm run dev
```

Then verify:

- first load shows region clouds only
- zooming or flying into a region reveals runtime clouds and app anchors
- deep zoom / close approach reveals individual stars
- cluster click focuses without opening the drawer
- app/star click opens the existing detail drawer
- mini-map tracks plane position and active region
- quests progress and skins unlock only once
- selected skin persists across reload
- mobile flight pad still works with overlays present

## Implementation Notes

- Progress is browser-local only via `localStorage`
- The one-time flight tip still uses `sessionStorage`
- Plane skins affect only visuals; no data semantics changed
- Search remains app-focused and still jumps to app systems
- Detail API remains app-focused; no cluster detail endpoint was added

## Suggested Next Steps

1. Run the app in Cursor or a native shell where Next can spawn child processes.
2. Do a manual UX pass on overlay sizing and canvas readability with real data volume.
3. If needed, tune disclosure thresholds in `lib/layout/focusContext.ts`.
4. If needed, tune cluster positioning and rarity thresholds in `lib/layout/seededLayout.ts`.
