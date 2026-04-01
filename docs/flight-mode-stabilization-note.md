# Flight Mode Stabilization Note

This repo now ships an exploration-first flight loop instead of a combat minigame. The goal of the pass was to keep the FluxCloud deployment visualization primary while making the flight layer measurable, toggleable, and stable.

## What Changed

- Removed enemy spawning, projectiles, collision damage, and combat-only feature flags.
- Rebuilt the collectible loop around `lib/game/collectibles.ts` for parachuters, fuel, and speed boosts.
- Kept deployment visibility logic bounded with caps, zoom buckets, hysteresis, and cluster fades in `lib/game/deploymentVisibility.ts`.
- Simplified run state and scoring in `lib/game/session.ts` so leaderboard writes are based on route distance, deployments discovered, and rescues completed.
- Kept the default HUD compact, with detailed mode available from Controls / Settings.

## Main Tuning Points

- `lib/game/config.ts`
  Fuel drain, boost duration, collectible counts, distance scaling, and feature-flag defaults.
- `lib/game/collectibles.ts`
  Spawn pacing, rescue density, supply placement, pickup feedback, and respawn timing.
- `lib/game/flightController.ts`
  Turn response, acceleration, drag, and max-speed feel.
- `lib/game/deploymentVisibility.ts`
  Marker budgets, near-field reveal rules, zoom buckets, and hysteresis thresholds.
- `lib/canvas/cartoonMarkers.ts`
  Pickup silhouettes, cloud styling, biplane scale, and parallax depth.

## Debug / Rollout Switches

Feature flags live in `lib/game/config.ts`, persist through `components/constellation/ProgressProvider.tsx`, and are exposed in `components/constellation/FlightSettingsPanel.tsx`.

- `pickups`
- `fuelSystem`
- `leaderboard`
- `clouds`
- `deploymentClustering`
- `debugHud`

Use `F3` in flight mode to toggle the debug HUD.
