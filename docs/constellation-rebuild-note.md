# Constellation Stabilization Note

## Baseline choice

This rebuild uses `0a46b69` (`fix: shrink and brighten background clouds`) as the salvage baseline.

Why this baseline:

- It is the last commit before `6104b8f` merged the large gamification layer into the scene.
- Core flight, map rendering, search/filter flow, hangar progression, and detail drawer behavior were already working.
- The later branch concentrated combat, pickups, scoring, leaderboard writes, and extra rendering state inside `SceneCanvas`, which made the app fragile and hard to reason about.

## Current failure causes

- `SceneCanvas` became a god-component that owns rendering, flight physics, combat, pickup spawning, scoring, minimap state, and data visibility.
- Gameplay spawning and cleanup were mixed into the render loop, so visibility bugs and loop churn made enemies and collectibles unreliable.
- Deployment rendering tried to do too much at once, so distant data flooded the scene instead of revealing meaningful nearby targets.
- Recent worker/tiled loading experiments increased architectural surface area before the gameplay loop was stable.
- HUD/game state updates were tightly coupled to render callbacks, increasing the chance of unnecessary loop churn and frame instability.

## What stays

- The pre-gamification flight/map shell from the stable baseline.
- Existing Flux snapshot API shape from `/api/stars`.
- Search, filters, detail drawer, hangar, and progression scaffolding.
- Weekly leaderboard persistence in the progress store, rebuilt so it does not leak into hot render paths.

## What is removed

- Tiled `/api/stars/index` and `/api/stars/tile` scene-loading experiment.
- Worker-based scene visibility pipeline.
- Monolithic `lib/game/arcade.ts` gameplay blob.
- Any gameplay logic embedded directly in render-only drawing helpers.

## New module boundaries

- `lib/game/config.ts`
  Central numeric tuning and feature flags.
- `lib/game/types.ts`
  Shared gameplay/session types.
- `lib/game/flightController.ts`
  Pure flight input + movement integration.
- `lib/game/deploymentVisibility.ts`
  Progressive datapoint culling, density limits, and cluster summaries.
- `lib/game/pickups.ts`
  Fuel/speed boost spawning, animation state, collection, and respawn rules.
- `lib/game/enemies.ts`
  Enemy spawning, pursuit, firing, hits, scoring, and cleanup.
- `lib/game/session.ts`
  Fuel drain, boost timers, scoring, HUD snapshot creation, and leaderboard-ready run records.
- `components/constellation/SceneCanvas.tsx`
  Orchestrates the loop and rendering only. It consumes pure module outputs instead of owning gameplay rules inline.

## Feature flags

Feature flags live in `lib/game/config.ts` and are persisted through the progress/settings store so systems can be toggled for debugging without code edits.

Flags:

- `fuelSystem`
- `speedBoosts`
- `enemyPlanes`
- `combat`
- `leaderboard`
- `advancedClouds`
- `deploymentDensityLimits`

## Rebuild rules

- No gameplay spawning logic directly inside draw calls.
- No deployment fetch/render logic coupled to scoring or combat.
- Every active entity type has bounded counts and culling rules.
- Every optional subsystem can be disabled independently.
- Hot-path update functions stay pure and measurable.
