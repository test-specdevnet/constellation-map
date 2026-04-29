# FluxCloud Flight Sim Refactor

## Direction

Keep the current Next.js, React, Three.js, and React Three Fiber stack. The app already has working data normalization, flight-state logic, progress persistence, HUD components, and tests, so the repair path should be incremental rather than a rewrite. Treat the existing 2D-to-3D code as a system to strangle module by module: isolate one concern, add tests around it, replace the risky internals, then move to the next concern.

## Audit Hotspots

- Asset loading: `components/constellation/ThreeScene.tsx` currently keeps runtime GLB rendering behind `RUNTIME_GLB_MODELS_ENABLED`; the GLBs in `public/models` are valid but very large. Run `npm run asset:audit` before enabling them broadly.
- Render loop: `ThreeScene` owns the R3F `useFrame` loop, flight integration, proximity checks, camera follow, telemetry, and object rendering. Refactor only when a smaller helper has a testable boundary.
- Game mechanics: deterministic logic already lives under `lib/game`. Prefer moving landing, docking, and collider math there before changing scene components.
- UI/HUD: counters flow through `createSessionSnapshot`, `DiegeticHud`, `FuelGauge`, and `MiniMap`. Fix broken counters at the session snapshot boundary first.
- Networking: Flux data is fetched outside the render loop through the app API routes and `ConstellationExperience`; keep detail hydration async and never call fetch from `useFrame`.

## Engine Decision

Use Three.js for this codebase. Babylon.js is a reasonable option for a new browser game that wants built-in physics and tooling, but moving this repository to Babylon, Unity, or Godot would be a rewrite and would discard working app, data, and test behavior. Add a physics library only if simple sphere/box collision in `lib/game` becomes insufficient.

## Staged Implementation

1. Stabilize assets.
   - Keep raw GLBs in `public/models`.
   - Generate optimized variants in `public/models-optimized` with `npm run asset:optimize` once `@gltf-transform/cli` is available.
   - Add per-model transform metadata for scale, rotation, ground offset, and fallback geometry.

2. Separate world layout and collisions.
   - Move station, buoy, and collectible layout descriptors out of `ThreeScene`.
   - Use deterministic inputs from clusters/systems and expose collider descriptors for the scene.
   - Unit-test landing thresholds, refuel docking, deployment discovery, and minimap snapshots in `lib/game`.

3. Re-enable GLBs safely.
   - Load models asynchronously and show fallback meshes until ready.
   - Clone cached model scenes before placing multiple instances.
   - Recenter each model with `THREE.Box3`, apply scale uniformly, and place its bottom on the intended terrain altitude.
   - Dispose cloned geometries/materials when an instance is removed.

4. Reduce frame-loop work.
   - Keep one `useFrame` loop.
   - Reuse vectors/quaternions instead of allocating per frame.
   - Keep network fetches, React state updates, and expensive selection work outside the render loop.
   - Watch `renderer.info.render.calls` while flying and target fewer than roughly 100 draw calls on normal scenes.

5. Verify in browser.
   - Use Chrome DevTools Performance and Memory panels while flying, landing, and clicking deployments.
   - Fix long tasks before adding more visuals.
   - Confirm console has no loader, shader, or context-loss errors.

## Codex Task Prompts

- "Extract station and deployment world layout from `ThreeScene` into a tested helper under `lib/game`, preserving current behavior."
- "Add collider helpers for sphere and box proximity checks, then wire landing/refuel/discovery to those helpers with Jest coverage."
- "Create a React Three Fiber GLB model component that loads an asset once, clones it for instances, recenters it by bounding box, and falls back to existing procedural geometry on load failure."
- "Profile `ThreeScene` and remove per-frame allocations from the camera and object rendering paths without changing gameplay."
- "Expand `GameSessionSnapshot.miniMap` to include stations and discovered deployments, then update `MiniMap` and tests."

## CI And Validation

The GitHub Actions workflow runs install, typecheck, unit tests, asset audit, and production build. Local equivalent:

```bash
npm run ci
```

Use `npm run asset:audit` to check that required GLBs exist, are valid GLB v2 files, and are not above the hard size limit. Size warnings are intentional until optimized files replace raw assets in runtime.

## Asset Recovery

If a GLB is missing or corrupt, first check git history and source files before replacing it. If a replacement is needed, document the substitute in this file and keep its filename stable so scene metadata does not drift.
