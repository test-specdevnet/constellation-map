# Constellation Stabilization Note

## Baseline choice

This rebuild keeps the stable flight/map shell and removes the combat-heavy detour that had accumulated inside `SceneCanvas`.

## Why the previous shape was fragile

- `SceneCanvas` had grown into a god-component that owned rendering, flight physics, combat, pickups, scoring, minimap state, and data visibility.
- Gameplay spawning and cleanup were mixed into the render loop, which increased frame instability and made debugging harder.
- The deployment map risked becoming secondary to the arcade layer.

## What stays

- Existing Flux snapshot API shape from `/api/stars`
- Search, filters, detail drawer, hangar, and progression scaffolding
- Weekly leaderboard persistence in the progress store
- Progressive deployment visibility and cluster culling

## What changed

- Enemy planes, bullets, damage, and combat-specific flags were removed.
- Pickup logic was rebuilt as a single exploration collectible system.
- Run scoring now uses route distance, discoveries, and rescues.
- HUD, minimap, and leaderboard copy were updated to match the new loop.

## Current module boundaries

- `lib/game/config.ts`
  Central numeric tuning and feature flags.
- `lib/game/types.ts`
  Shared exploration/session types.
- `lib/game/flightController.ts`
  Pure flight input and movement integration.
- `lib/game/deploymentVisibility.ts`
  Progressive datapoint culling, density limits, and cluster summaries.
- `lib/game/collectibles.ts`
  Parachuter, fuel, and boost spawning plus collection rules.
- `lib/game/session.ts`
  Fuel drain, exploration scoring, HUD snapshot creation, and leaderboard-ready run records.
- `components/constellation/SceneCanvas.tsx`
  Orchestrates the loop and rendering only.

## Rebuild rules

- No combat or enemy state in the map render path.
- No gameplay spawning logic directly inside draw helpers.
- No deployment fetch/render logic coupled to scoring.
- Every active entity type has bounded counts and culling rules.
- Every optional subsystem can be disabled independently.
