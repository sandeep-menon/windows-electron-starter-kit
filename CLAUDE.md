# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start with renderer HMR (main/preload changes need a manual restart)
npm run dev:watch    # Start and auto-restart on main/preload changes
npm run typecheck    # Type-check both tsconfig.node.json and tsconfig.web.json
npm run lint         # ESLint across the project
npm run format       # Prettier write
npm run build        # typecheck → build all processes
npm run build:win    # build → package Windows installer
```

```bash
git tag v1.x.x && git push --tags  # triggers release workflow → publishes installer + latest.yml
```

There are no automated tests in this project (issue #15 — planned: Vitest for unit tests + GitHub Actions CI running `lint` / `typecheck` / `build`).

## Architecture

Three isolated processes communicate through a typed IPC contract:

- **Main process** (`src/main/`) — Node.js. Owns all privileged work: persistence, networking, window management, logging.
- **Preload** (`src/preload/`) — sandboxed bridge. Exposes a minimal `window.api` surface via `contextBridge`. Logs and redacts IPC payloads before they hit disk.
- **Renderer** (`src/renderer/`) — React 19 + TypeScript. Never accesses Node APIs directly; uses only `window.api`.
- **Shared** (`src/shared/`) — imported by all three. `protocol.ts` is the single source of truth for the IPC contract; `types.ts` has shared domain types.

### IPC contract (`src/shared/protocol.ts`)

Every channel is declared once here:

1. `IPCParamSchemas` — a Zod schema per channel (use `z.void()` for no params). Infers compile-time param types and drives runtime validation in `registerHandlers()`.
2. `IPCResponseData` — per-channel response data type. `extends Record<IPCChannel, unknown>` makes omitting a channel a compile error.
3. `IPCEvents` — Main → Renderer broadcast event names and payload types.

### Adding an IPC channel — the full checklist

1. Add to `IPCParamSchemas` in `protocol.ts`.
2. Add to `IPCResponseData` in `protocol.ts`.
3. Add the handler to the `handlers` map in `src/main/handler.ts` (build fails until you do).
4. Call from renderer with `window.api.invoke("your-channel", params)` — fully typed.

No preload changes required — the generic bridge adapts automatically.

### Handler infrastructure (`src/main/handler.ts`)

`registerHandlers()` wraps every handler with:
- **Trusted-sender check** — rejects messages not from the app's own renderer. `TRUSTED_PROTOCOLS` defaults to `["file:"]`; add custom schemes there. In dev, the origin is matched against `ELECTRON_RENDERER_URL`.
- **Schema validation** — runs params through the channel's Zod schema and returns `{ success: false, error }` if invalid.

All handlers resolve with `MainProcessResponse<T>` (a `{ success: true; data: T } | { success: false; error: MainProcessError }` discriminated union).

`registerHandlers()` returns a `cleanup()` closure; it is called on `app.on("will-quit")` in `src/main/index.ts`.

All network calls go through `fetchWithTimeout()` (in `handler.ts`), which wraps `fetch()` with `AbortController` and a 10 s timeout; the timer is cleared in `finally`.

### Multi-window (`src/main/utils/application.ts`)

All windows are created via `createWindow({ entry, parent })`. The `entry` string ("main" | "child") is passed as a URL hash; `src/renderer/src/main.tsx` reads it synchronously before React mounts to pick the right root component. Pass `parent` for a modal child window. Windows use `show: false` + `ready-to-show` to prevent a white flash on startup.

`Child` and `Toaster` are lazy-loaded in `main.tsx` via `React.lazy()` — they are not in the main window's critical bundle.

### Cross-window state

Each window has its own JS heap — client-side state libraries don't span windows. State is owned by the main process; windows subscribe via `broadcast()` / `window.api.on()` using events declared in `IPCEvents`.

### Persistence (`src/main/utils/store.ts`)

`electron-store` v11 is ESM-only. It's bundled into the main process via `exclude: ["electron-store"]` in `electron.vite.config.ts`. The store is constructed with `clearInvalidConfig: true` so a corrupt config file is silently replaced rather than crashing on startup. Always pass a per-call default to `.get()` — `store.get("key", fallback)` — because `defaults` at construction only seeds the file, not subsequent reads.

`getStore()` is pre-warmed at startup (alongside `initializeLogging()`) in the `setImmediate` block in `src/main/index.ts`, so the config is cached before the renderer's first IPC call.

Any other ESM-only main-process dependency must be added to the same `exclude` list in `electron.vite.config.ts`. The preload has its own `exclude` list for its dependencies.

### Auto-update (`src/main/updater.ts`)

`initUpdater(mainWindow)` is called in `src/main/index.ts` immediately after `createWindow`. Returns early when `!app.isPackaged` — complete no-op in dev; `checkForUpdates()` fires `update:not-available` so the renderer never hangs.

State flows one way: `autoUpdater` events → `send()` → typed `update:*` `IPCEvents` → renderer `UpdateState`. Never poll; never write state back to main.

Build-time token: `__GH_TOKEN_RO__` is injected via Vite `define` in `electron.vite.config.ts`. Spread pattern: `...(__GH_TOKEN_RO__ && { token: __GH_TOKEN_RO__ })` — token key omitted entirely when empty (not passed as empty string). Any future build-time constant should follow this pattern.

### Logging

Initialized in `src/main/utils/application.ts` before the first window opens. All processes write to one rotating log file at `%APPDATA%\windows-electron-starter-kit\logs\`. Dev: `silly`; production: `info`; production with `--enable-logging`: `silly`. Sensitive IPC payload keys are redacted in `src/preload/index.ts` by `redact()` before logging; to protect additional fields add a lowercase separator-free term to `SENSITIVE_KEYS` there.

Uncaught errors are caught in every process: main via `log.errorHandler.startCatching()`; renderer via `globalErrorLogging()` (in `src/renderer/src/lib/errorLogging.ts`) and `ErrorBoundary.componentDidCatch`.

## Repository conventions

- `docs/superpowers/` is gitignored. Use `git add -f <path>` to commit specs and plans there.

## Bundler notes

- Build tool: `electron-vite` (wraps Vite). Config: `electron.vite.config.ts`.
- Renderer aliases: `@renderer` and `@` both resolve to `src/renderer/src`.
- Tailwind CSS v4 is used via the `@tailwindcss/vite` plugin (no `tailwind.config.js`).
- shadcn/ui components live in `src/renderer/src/components/ui/`.

## Known outstanding issues (from PROJECT_REVIEW.md)

Issue numbers are stable; this list is kept in sync with `PROJECT_REVIEW.md` (gitignored).

| # | Priority | Description |
|---|----------|-------------|
| 15 | 🟡 Low | No test runner. CI (lint + typecheck via GitHub Actions) is now in place. Remaining: Vitest unit tests (`redact()`, `fetchWithTimeout`, Zod schemas, `broadcast()` guard). |
| 42 | 🟡 Low | `useFirstName` fires an IPC round-trip on every window's first mount, causing a brief "stranger" → real name flicker. Fix: seed the value at window-create time via `additionalArguments` or a hash param. Requires changes to `createWindow`, the preload, and `useFirstName`. |
| 44 | 🟡 Low | `theme-provider.tsx` uses `React.ReactNode` without an explicit `React` import. Fix: `import { type ReactNode }` and replace `React.ReactNode` with `ReactNode` (consistent with `Background.tsx`). |
| 45 | 🟡 Low | `Child.tsx` line 21: `setFirstName(resp.data ?? "")` — the `?? ""` is dead code; `resp.data` is `string` and the handler guarantees non-empty via `get("firstName", "")`. Fix: `setFirstName(resp.data)`. |
