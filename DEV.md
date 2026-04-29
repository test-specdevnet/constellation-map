# Development Notes

## Local run

- Install dependencies with `npm install`.
- Start the app with `npm run dev`.
- Validate the production bundle with `npm run build`.
- Run static validation with `npm run typecheck` and `npm test`.
- Run the full local CI path with `npm run ci`.

## Exploration debugging

- Open flight mode from the main 3D scene and click the sky to focus controls.
- Toggle the debug HUD with `F3`, or enable `Debug HUD` in `Controls / Settings`.
- The debug HUD shows FPS, frame time, sim tick rate, entity counts, input axes, and current route/fuel state.
- Brake near a refuel or upgrade island at low speed to land. Accelerate again to take off.
- During browser testing, `window.render_game_to_text()` exposes a compact flight-state snapshot and `window.advanceTime(ms)` advances the sim deterministically.

## 3D refactor and assets

- Follow `docs/flight-sim-refactor.md` for the incremental repair plan.
- Run `npm run asset:audit` before enabling or replacing runtime GLB assets.
- Run `npm run asset:optimize` after installing `@gltf-transform/cli` or setting `GLTF_TRANSFORM_BIN` to a local glTF-Transform executable.

## Runtime feature flags

These can be changed at runtime in `Controls / Settings`, and default from environment variables:

- `NEXT_PUBLIC_FC_FLAG_PICKUPS`
- `NEXT_PUBLIC_FC_FLAG_CLOUDS`
- `NEXT_PUBLIC_FC_FLAG_DEPLOYMENT_CLUSTERING`
- `NEXT_PUBLIC_FC_FLAG_DEBUG_HUD`
- `NEXT_PUBLIC_FC_FLAG_FUEL`
- `NEXT_PUBLIC_FC_FLAG_LEADERBOARD`
