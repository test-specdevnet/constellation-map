# Cursor Handoff

## Project

- Project root: `C:\Users\awcar\Downloads\fluxcloud-fit-evaluator\fluxcloud-constellation-map`
- Source spec: `C:\Users\awcar\Downloads\fluxcloud_constellation_map_spec.md`

## What Was Built

This is a new Next.js App Router project implementing the FluxCloud Constellation Map as a dark, interactive public atlas of FluxCloud deployments.

Implemented areas:

- App shell and global styling
- Internal API routes:
  - `/api/stars`
  - `/api/detail/[appName]`
  - `/api/search`
  - `/api/filters`
  - `/api/refresh`
- Flux API client and normalization layer
- Deterministic constellation layout generator
- Interactive client UI:
  - search
  - filters
  - pan and zoom canvas
  - hover preview
  - detail drawer

## Important Files

- `app/page.tsx`
- `app/layout.tsx`
- `app/not-found.tsx`
- `app/global-error.tsx`
- `app/api/stars/route.ts`
- `app/api/detail/[appName]/route.ts`
- `app/api/search/route.ts`
- `app/api/filters/route.ts`
- `app/api/refresh/route.ts`
- `app/globals.css`
- `components/constellation/ConstellationExperience.tsx`
- `components/constellation/SceneCanvas.tsx`
- `components/constellation/DetailDrawer.tsx`
- `components/constellation/SearchBox.tsx`
- `components/constellation/FilterBar.tsx`
- `lib/flux/client.ts`
- `lib/flux/normalize.ts`
- `lib/flux/classify.ts`
- `lib/flux/cache.ts`
- `lib/layout/seededLayout.ts`
- `lib/types/app.ts`
- `lib/types/node.ts`
- `lib/types/star.ts`
- `next.config.ts`
- `package.json`

## Current Build Status

### Passing

- `npm.cmd run typecheck`
- `npm.cmd run build -- --experimental-build-mode compile`
- `npm.cmd run build -- --experimental-build-mode generate-env`

### Failing in this sandbox

- `npm.cmd run build`

Failure:

- Next.js reaches `Generating static pages`
- then throws:
  - `Error [DataCloneError]: ()=>null could not be cloned.`

## What Was Already Tried

The failing standard build was debugged extensively.

Changes already made:

- moved scene loading to the client in `components/constellation/ConstellationExperience.tsx`
  - the page no longer passes the scene snapshot from server to client
  - the client now fetches `/api/stars` after mount
- marked the live API routes as dynamic
- added local `app/not-found.tsx`
- added local `app/global-error.tsx`
- disabled Next webpack build worker in `next.config.ts`
- constrained build CPUs in `next.config.ts`
- removed `AbortController` usage from the Flux fetch helper

Extra isolation that was tested:

- `app/page.tsx` was temporarily reduced to a minimal `<main>` element
- the same `DataCloneError` still happened during `Generating static pages`

Conclusion from current evidence:

- app code typechecks and compile-builds
- the remaining failure appears tied to Next 15 static generation in this sandboxed environment, not the page logic itself

## Current Next Config

`next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    cpus: 1,
    workerThreads: true,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
```

## Notes About the Main Refactor

`components/constellation/ConstellationExperience.tsx` now:

- takes no props
- fetches `/api/stars` in a `useEffect`
- keeps the search, filter, focus, hover, and detail flows intact
- uses the existing internal API architecture instead of server-passing the scene

This was done specifically to reduce server/client serialization pressure during build.

## Recommended Next Steps in Cursor

1. Open the folder:
   - `C:\Users\awcar\Downloads\fluxcloud-fit-evaluator\fluxcloud-constellation-map`
2. Run:

```powershell
npm install
npm run typecheck
npm run build
```

3. If `npm run build` succeeds outside this sandbox:
   - treat the earlier failure as environment-specific
   - proceed to GitHub and deployment

4. If `npm run build` still fails outside the sandbox with the same `DataCloneError`:
   - inspect whether Next is still trying to statically process one of:
     - `/`
     - `/_not-found`
     - a framework fallback route
   - check if downgrading or pinning a different Next 15 patch version resolves it
   - test whether removing `workerThreads: true` changes the failure mode
   - test whether `output` settings or forcing all app routes dynamic changes the static-generation phase

## Practical Summary

- The app itself is built and wired up.
- TypeScript is clean.
- Compile-mode Next build is clean.
- The unresolved item is the standard static-generation stage of `next build` in this sandbox.

