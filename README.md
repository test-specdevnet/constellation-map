# FluxCloud Constellation Map

Interactive star-atlas style discovery surface for public FluxCloud deployment data, now framed as a non-combat exploration flight.

## Exploration loop

- Fly smoothly through the FluxCloud deployment map with keyboard or touch controls.
- Discover deployment buoys tied to real FluxCloud snapshot data.
- Rescue parachuters, collect fuel jerry cans, and grab speed boosts while exploring.
- Track weekly leaderboard runs scored from the sum of route distance, deployments discovered, and parachuters rescued.

## Core features

- Canvas-rendered constellation scene with pan, zoom, hover, and selection
- Cartoon-style sky layer with parallax clouds and buoy markers
- Deterministic constellation and system layout
- Runtime, status, category, and resource-tier filtering
- Search-to-focus camera flow with smooth flight follow
- Compact or detailed HUD modes, minimap, hangar, and leaderboard panels
- Internal API layer for render-ready stars, detail hydration, filters, search, and refresh

## Gameplay architecture

- `lib/game/flightController.ts`
  Pure flight motion integration and follow-camera behavior.
- `lib/game/deploymentVisibility.ts`
  Progressive datapoint culling, density limits, and cluster summaries.
- `lib/game/collectibles.ts`
  Parachuter, fuel, and speed-boost spawning, collection, feedback, and respawn rules.
- `lib/game/session.ts`
  Fuel drain, exploration scoring, run lifecycle, and HUD snapshot creation.
- `components/constellation/SceneCanvas.tsx`
  Main render/simulation loop that orchestrates the exploration experience.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## Deploy verification

- `GET /api/version` returns JSON including `buildStamp` (mirrors `lib/buildStamp.ts`).
- Bump `BUILD_STAMP` in `lib/buildStamp.ts` when you need to confirm Flux served a fresh build.

## FluxCloud deployment baseline

- Docker image: `runonflux/orbit:latest`
- App port: `3000`
- Optional webhook port: `9001`

Recommended environment variables:

```bash
GIT_REPO_URL=https://github.com/YOUR_ORG/YOUR_REPO
APP_PORT=3000
GIT_BRANCH=main
PROJECT_TYPE=node
POLLING_INTERVAL=300
```

## Notes

- The map is a discovery and recommendation surface, not a single-node pinning UI.
- Public Flux endpoints are normalized server-side before the client scene renders them.
- The exploration layer is intentionally lightweight so the deployment visualization remains the main focus.
