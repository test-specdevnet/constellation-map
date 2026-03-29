# FluxCloud Constellation Map

Interactive star-atlas style discovery surface for public FluxCloud deployment data.

## MVP features

- Canvas-rendered constellation scene with pan, zoom, hover, and selection
- Cartoon-style sky layer with parallax clouds and aviation-style deployment markers
- Guided tour mode over the map (waypoints and camera flow)
- Internal API layer for render-ready stars, detail hydration, filters, search, and refresh
- Deterministic constellation and system layout
- Runtime, status, category, and resource-tier filtering
- Search-to-focus camera flow; wheel zoom, keyboard (WASD), and touch-friendly controls
- Responsive detail drawer and mobile bottom sheet behavior
- Static deployment notes for FluxCloud Deploy with Git

## Deploy verification

- `GET /api/version` returns JSON including `buildStamp` (mirrors `lib/buildStamp.ts`).
- Bump `BUILD_STAMP` in `lib/buildStamp.ts` when you need to confirm Flux served a fresh build.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm install
npm run build
npm run start
```

Scripts: `dev`, `build`, `start`, `typecheck` (`tsc --noEmit`). Next.js also runs lint/type checks during `next build`.

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
- This repository has a single Next.js app at the repo root (no nested duplicate app tree).
