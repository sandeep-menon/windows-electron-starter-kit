# Windows Electron Starter Kit

An enterprise-grade Electron starter for Windows desktop applications — typed, runtime-validated IPC, sandboxed renderer, structured logging with redaction, and a modern React + TypeScript UI.

## Stack

| Layer         | Technology                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Framework     | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)            |
| UI            | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)                   |
| Styling       | [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)                |
| Notifications | [Sonner](https://sonner.emilkowal.ski/)                                                          |
| Validation    | [Zod](https://zod.dev/)                                                                          |
| Persistence   | [electron-store](https://github.com/sindresorhus/electron-store)                                 |
| Logging       | [electron-log](https://github.com/megahertz/electron-log)                                        |
| Auto-update   | [electron-updater](https://www.electron.build/auto-update) (dependency available; not yet wired) |
| Packaging     | [electron-builder](https://www.electron.build/)                                                  |

## Getting Started

```bash
git clone https://github.com/sandeep-menon/windows-electron-starter-kit.git
cd windows-electron-starter-kit
npm install
npm run dev
```

## Available Scripts

| Script                              | Description                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                       | Start in development mode with renderer HMR.                                     |
| `npm run dev:watch`                 | Same as `dev`, but also rebuilds and restarts when main or preload code changes. |
| `npm run start`                     | Preview a production build locally.                                              |
| `npm run build`                     | Type-check, then build all processes for distribution.                           |
| `npm run build:win`                 | Build and package a Windows installer.                                           |
| `npm run build:mac` / `build:linux` | Build and package for macOS / Linux.                                             |
| `npm run build:unpack`              | Build an unpacked directory (useful for inspection/debugging).                   |
| `npm run typecheck`                 | Type-check both the Node (main/preload) and web (renderer) projects.             |
| `npm run lint`                      | Run ESLint across the project.                                                   |
| `npm run format`                    | Format the codebase with Prettier.                                               |

> `npm run dev` only hot-reloads the renderer. Use `dev:watch` to also rebuild and restart when main or preload code changes.

## Project Structure

```
src/
├── main/                     # Electron main process (Node.js)
│   ├── index.ts              # App lifecycle + bootstrap
│   ├── handler.ts            # IPC handlers, sender validation, schema validation
│   └── utils/
│       ├── application.ts    # Window factory (createWindow), logging, rotation, diagnostics
│       ├── store.ts          # electron-store instance (typed, lazy singleton)
│       └── events.ts         # Typed main→renderer broadcast helper
├── preload/                  # Secure bridge between main and renderer
│   ├── index.ts              # contextBridge API, IPC logging, payload redaction
│   └── index.d.ts            # Typed window.api declarations
├── renderer/                 # React application (UI)
│   └── src/
│       ├── App.tsx           # Main-window root (entry "#main")
│       ├── Child.tsx         # Child-window root (entry "#child")
│       ├── main.tsx          # Picks root component from URL hash
│       ├── hooks/
│       │   └── useFirstName.ts  # Reads + live-subscribes to persisted state
│       └── components/ui/    # shadcn/ui components
└── shared/                   # Code shared across all three processes
    ├── protocol.ts           # IPC contract: Zod schemas, inferred types, events
    └── types.ts              # Shared types (MainProcessResponse, StoreSchema, …)
```

## Architecture

### Typed IPC contract

Every IPC channel is declared once in `src/shared/protocol.ts` as a Zod schema — the single source of truth for compile-time types, mapped response types, and runtime param validation. A typo, wrong param, or changed return shape is caught at compile time across all three processes.

```ts
export const IPCParamSchemas = {
    "get-first-name": z.void(),
    "set-first-name": z.object({ firstName: z.string().trim().min(1).max(100) })
} as const;

export interface IPCResponseData extends Record<IPCChannel, unknown> {
    "get-first-name": string;
    "set-first-name": void;
}
```

### Runtime validation and trusted senders

`registerHandlers()` in `src/main/handler.ts` wraps every handler with two automatic checks:

1. **Trusted-sender check** — rejects any message not from our own renderer (`file:` URL in production, the dev-server origin in development). Add custom schemes to the `TRUSTED_PROTOCOLS` array in `handler.ts`.
2. **Schema validation** — runs incoming params through the channel's Zod schema. If it fails, returns `{ success: false, error }` without executing the handler.

Both checks apply automatically to every channel you add — no per-handler validation code required.

### Typed responses

Every handler resolves with `MainProcessResponse<T>` — a discriminated union that narrows cleanly in the renderer:

```ts
const resp = await window.api.invoke("get-first-name");
if (!resp.success) {
    window.api.log.error(resp.error.message);
} else {
    setFirstName(resp.data); // typed `string`
}
```

### Multi-window

All windows are created through `createWindow({ entry, parent })` in `src/main/utils/application.ts`. The `entry` value rides along as a URL hash (`#main`, `#child`), and `main.tsx` reads it synchronously before React mounts — no router, no flash of the wrong UI.

```ts
const Root = window.location.hash === "#child" ? Child : App;
```

Pass a `parent` to `createWindow` to open a modal child window that blocks the parent until it closes. Omit it for a non-modal secondary window.

### Cross-window reactive state

Client-side state libraries don't work across Electron windows — each window has its own JavaScript heap. State lives in the main process; windows stay in sync via typed broadcast events declared in `IPCEvents` (`protocol.ts`):

```ts
// After persisting, broadcast to all windows
broadcast("first-name-changed", params.firstName);

// Renderer subscribes with automatic cleanup
const unsubscribe = window.api.on("first-name-changed", (_event, name) => setFirstName(name));
return () => unsubscribe();
```

Use `broadcast()` when state must stay consistent across windows or is owned by the main process. For state shared only within a single window, use ordinary React state.

### Persistence

`electron-store` lives in the main process — the renderer never touches it directly. The store is a typed, lazy singleton initialized after the app is ready (`src/main/utils/store.ts`).

> **Always pass a per-call default to `.get()`.** The `defaults` option seeds the file once at construction. `store.get("key")` falls back only to its second argument, not to `defaults`. Use `get("firstName", "")` to guarantee a well-typed value if the config file is missing.

`electron-store` v11 is ESM-only and must be bundled into the main process. It is excluded from externalization in `electron.vite.config.ts`. Add any other ESM-only main-process dependency to the same `exclude` list.

## Security

- **Sandboxed renderer**: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. The renderer's only capability is the minimal `window.api` surface published via `contextBridge`.
- **Trusted-sender validation**: every handler verifies `event.senderFrame` before executing.
- **Runtime schema validation**: every channel's params are validated against its Zod schema — no malformed value reaches business logic.
- **External links**: delegated to the OS browser via `setWindowOpenHandler`; in-app navigation is denied by default.
- **CSP**: inline theme script is allowed by its SHA-256 hash — no `unsafe-inline`.
- **Log redaction**: secrets in IPC payloads are scrubbed before being written to disk.

## Logging

Logging is built on [electron-log](https://github.com/megahertz/electron-log) v5 and initialized in `src/main/utils/application.ts` before the first window opens.

| Environment                        | Verbosity     |
| ---------------------------------- | ------------- |
| Development                        | `silly` (all) |
| Production (default)               | `info`        |
| Production with `--enable-logging` | `silly` (all) |

File logging is always on. To capture full diagnostics from a production machine without shipping a new build:

```bash
"Windows Electron Starter Kit.exe" --enable-logging
```

**Log files** — written to `%APPDATA%\windows-electron-starter-kit\logs\` as `app_<YYYYMMDD>_<epoch>.log`. The 5 most recent files are kept; older ones are deleted on every launch.

**What's captured** — all processes write to one file. Main uses `electron-log/main`; the preload bridges renderer logs via `window.api.log`. Startup diagnostics (versions, OS, paths) are logged at launch. Every IPC request, response, and error is logged with redaction applied. Uncaught errors are caught automatically in every process — main via `log.errorHandler.startCatching()`, renderer via global error handlers and an `ErrorBoundary`.

### Sensitive-data redaction

`redact()` in `src/preload/index.ts` scrubs logged IPC payloads before they reach disk. A key is redacted if, after lowercasing and stripping `_`/`-`, it contains any sensitive term as a substring — catching `access_token`, `x-api-key`, `refreshToken`, and similar variants without listing each one.

Redaction only affects what is logged — the actual IPC call always receives the original arguments.

Default sensitive terms: `password`, `token`, `secret`, `authorization`, `apikey`, `accesstoken`, `personalaccesstoken`, `pat`, `refreshtoken`, `cookie`.

To protect additional fields, add a lowercase separator-free term to `SENSITIVE_KEYS` in `src/preload/index.ts`.

## Extending This Starter Kit

### Adding an IPC channel

1. **Declare the schema** in `IPCParamSchemas` (`src/shared/protocol.ts`). Use `z.void()` for no params.
2. **Declare the response type** in `IPCResponseData`. The `extends Record<IPCChannel, unknown>` constraint makes it a compile error to skip.
3. **Implement the handler** in the `handlers` map in `src/main/handler.ts`. The build fails until you do.
4. **Call it** from the renderer with `window.api.invoke("your-channel", params)` — fully typed.

No preload changes needed — the generic bridge adapts automatically, and sender + schema checks apply to the new channel for free.

> If you load the renderer from a custom scheme (e.g. `app://`) or a remote URL, update `isTrustedSender()` in `src/main/handler.ts` — the default `TRUSTED_PROTOCOLS` only allows `file:`, which will reject every IPC call from a different origin.

### Adding a preload dependency

The sandboxed preload only runs code bundled into it at build time. Add any new `src/preload/` import to the `exclude` list in `electron.vite.config.ts`:

```ts
preload: {
    build: {
        externalizeDeps: {
            exclude: ["@electron-toolkit/preload", "electron-log", "your-new-package"]
        }
    }
}
```

Restart `npm run dev` after editing the list.

### Adding a broadcast event

1. Declare it in `IPCEvents` (`src/shared/protocol.ts`).
2. Call `broadcast("your-event", payload)` from a handler after mutating state.
3. Subscribe in the renderer with `window.api.on("your-event", cb)` — channel name and payload type are checked end to end.

## Troubleshooting

**Electron binary download fails**

```bash
node .\node_modules\electron\install.js
npm install
```

**App icon not updated in build output**

Update all three files: `resources/icon.png`, `build/icon.png`, `build/icon.ico`. Minimum 256×256, square source assets. Re-run `npm run build`.

**Packaged app looks stale**

Delete the `dist/` output directory and re-run `npm run build`.

**Edits to main/preload don't take effect**

Use `npm run dev:watch`. If a restart doesn't happen, check the terminal for a build error.

**No log file appears**

File logging is always on. Check `%APPDATA%\windows-electron-starter-kit\logs\`. For full verbosity in a packaged build, relaunch with `--enable-logging`.

## License

MIT
