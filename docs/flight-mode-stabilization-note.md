# Flight Mode Stabilization Note

This repo now ships the rebuilt flight loop in bounded subsystems instead of one giant scene blob. The goal of the pass was to make flight mode measurable, toggleable, and easier to debug when combat, pickups, clustering, or clouds regress.

## What Changed

- Added a semi-fixed simulation loop with centralized input handling in `lib/game/inputController.ts` and `components/constellation/SceneCanvas.tsx`.
- Rebuilt combat flow around explicit projectile and enemy updates in `lib/game/enemies.ts`.
- Rebuilt pickup effects and feedback in `lib/game/pickups.ts`.
- Stabilized deployment visibility with caps, zoom buckets, hysteresis, and cluster fades in `lib/game/deploymentVisibility.ts`.
- Split the default flight UI into compact and detailed modes, moved secondary panels behind toggles, and limited touch controls to coarse-pointer devices.
- Added a runtime debug HUD plus feature flags so subsystems can be isolated without ripping code out.

## Main Tuning Points

- `lib/game/config.ts`
  Enemy caps, spawn cadence, fuel drain, boost duration, pickup limits, feature-flag defaults, and flight settings defaults.
- `lib/game/enemies.ts`
  Enemy steering feel, projectile cadence, hit damage, spawn cleanup, and active-enemy pressure.
- `lib/game/pickups.ts`
  Fuel gain, boost refresh behavior, pickup collision radius, and respawn timing.
- `lib/game/deploymentVisibility.ts`
  Marker budgets, near-field reveal rules, zoom buckets, and hysteresis thresholds.
- `lib/game/inputController.ts`
  Keyboard normalization, mouse-turn bias, idle decay, and blur/reset behavior.
- `lib/canvas/cartoonMarkers.ts`
  Cloud layer counts, drift speeds, puff styling, and parallax depth.

## Debug / Rollout Switches

Feature flags live in `lib/game/config.ts`, persist through `components/constellation/ProgressProvider.tsx`, and are exposed in `components/constellation/FlightSettingsPanel.tsx`.

- `combat`
- `pickups`
- `fuelSystem`
- `enemyPlanes`
- `leaderboard`
- `clouds`
- `deploymentClustering`
- `debugHud`

Use `F3` in flight mode to toggle the debug HUD. The default user-facing HUD is now compact; switch to detailed mode from Controls / Settings when tuning gameplay.
