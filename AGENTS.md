# AGENTS.md

## Cursor Cloud specific instructions

This is a **single-service Next.js 15 / React 19 / TypeScript** project. No databases, Docker, or external services are needed for development.

### Running the app

- `npm run dev` starts the Next.js dev server on port **3000**.
- All data is fetched server-side from the public Flux API (`https://api.runonflux.io`); no API keys or `.env` file required.

### Available npm scripts

See `package.json` for the full list. Key scripts:

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (port 3000) |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run build` | Production build (see caveat below) |

### Lint / typecheck

There is no ESLint configuration in this project. The only static analysis tool is TypeScript: `npm run typecheck`.

### Known caveats

- **`npm run build` has a known `DataCloneError`** during static page generation (documented in `CURSOR_HANDOFF.md`). This is an environment-specific issue with Next.js 15 static generation, not a code bug. `npm run dev` works fine.
- The `fluxcloud-constellation-map-final/` directory at the repo root is a prior snapshot/backup copy; ignore it for development.
