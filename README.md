# Windows Electron Starter Kit

An enterprise-grade Electron starter for Windows desktop applications — typed, runtime-validated IPC, sandboxed renderer, error logging with an opt-in `--debug` mode, and a modern React + TypeScript UI.

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

This repository is a GitHub template. Click **Use this template → Create a new repository** to get your own copy, then:

```bash
git clone https://github.com/<you>/<your-app>.git
cd <your-app>
npm install
npm run dev
```

Before your first release, work through [Make It Yours](#make-it-yours).

## Make It Yours

The template ships with its own identifiers. Replace them before you build or publish — otherwise your installed app will check **this** repository's releases for updates.

| File                                             | What to change                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `package.json`                                   | `name`, `homepage`, `author`, `description`; reset `version` to `0.1.0`         |
| `electron-builder.yml`                           | `appId`, `productName`, `executableName`, `publish.owner`, `publish.repo`       |
| `resources/icon.png`, `build/icon.*`             | your own icon — square, min 256×256; keep `.png`, `.ico` and `.icns` in sync    |
| `src/main/updater.ts`                            | `owner` and `repo` in the feed URL                                              |
| `dev-app-update.yml`                             | `updaterCacheDirName`                                                           |
| `src/renderer/src/components/theme-provider.tsx` | `THEME_STORAGE_KEY`                                                             |
| `src/renderer/index.html`                        | the theme key in the inline script — must match `THEME_STORAGE_KEY` (see below) |
| `LICENSE`                                        | copyright holder and year                                                       |
| `README.md`, `docs/`                             | your own content                                                                |

> **CSP hash:** the inline theme script in `src/renderer/index.html` is allowed by its SHA-256 hash in the `Content-Security-Policy` meta tag. Changing any character of that script (including the storage key) changes the hash. Run `npm run dev`, copy the new `sha256-…` value from the CSP error in DevTools, and paste it into the meta tag.

The log and config folder (`%APPDATA%\<name>\`) follows these values automatically — `package.json` `name` in dev, `productName` in packaged builds.

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
- **Log redaction**: secrets in IPC payloads are scrubbed before being written to the log file (debug mode only, since payloads are not logged otherwise).

## Logging

Logging is built on [electron-log](https://github.com/megahertz/electron-log) v5 and initialized in `src/main/utils/application.ts` before the first window opens. All processes write to one log file.

Logging has two modes:

| Mode                                   | Logged                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Default (production)                   | Errors only. No launch/environment info, no IPC traffic. No file is created until the first error occurs. |
| `--debug` launch argument (or dev)     | Everything: `error`, `warn`, `info`, `debug`, `silly`, launch/environment info, and the full IPC stream.   |

To capture full diagnostics from a packaged build, relaunch it with the flag:

```bash
"Windows Electron Starter Kit.exe" --debug
```

**Log files** — written to `%APPDATA%\windows-electron-starter-kit\logs\` as `app_<YYYYMMDD>_<epoch>.log`. The 5 most recent files are kept; older ones are deleted on every launch.

**What's captured in debug mode** — every IPC request, response, and event, with redaction applied. Main uses `electron-log/main`; the preload forwards renderer logs via `window.api.log`. Uncaught errors are captured automatically in every process in both modes — main via `log.errorHandler.startCatching()`, renderer via global error handlers and an `ErrorBoundary`.

Debug mode is detected in the main process (`isDebugMode()` in `src/main/utils/application.ts`) and forwarded to renderers with `webPreferences.additionalArguments`, since the sandboxed preload can't read the app's own arguments reliably.

### Sensitive-data redaction

`redact()` in `src/preload/index.ts` scrubs IPC payloads before they reach the log file. Since IPC payloads are only logged in debug mode, redaction only applies there. A key is redacted if, after lowercasing and stripping `_`/`-`, it contains any sensitive term as a substring — catching `access_token`, `x-api-key`, `refreshToken`, and similar variants without listing each one.

Redaction only affects what is logged — the actual IPC call always receives the original arguments.

Default sensitive terms: `password`, `token`, `secret`, `authorization`, `apikey`, `accesstoken`, `personalaccesstoken`, `pat`, `refreshtoken`, `cookie`.

To protect additional fields, add a lowercase separator-free term to `SENSITIVE_KEYS` in `src/preload/index.ts`.

## Auto-Update

The auto-update flow follows VSCode's three-step pattern: **Check → Download → Restart** — all user-initiated. `electron-updater` is a complete no-op when the app is not packaged; the dev experience is unchanged.

### How it works

1. User clicks **Check for Updates** → `check-for-updates` IPC channel → `autoUpdater.checkForUpdates()`.
2. If an update is found, the renderer receives `update:available` and shows a **Download** button.
3. User clicks **Download** → `download-update` IPC → `autoUpdater.downloadUpdate()`. Progress is streamed via `update:progress` events.
4. When the download completes (`update:downloaded`), a **Restart to Update** button appears.
5. User clicks it → `install-update` IPC → `autoUpdater.quitAndInstall(true, true)`.

### Shipping an update

Tag a commit and push — the release workflow does the rest:

```bash
# Bump version in package.json first, then:
git tag v1.2.0
git push && git push --tags
```

The workflow builds the installer and publishes it to GitHub Releases. Running instances of the app will find the new version on their next check.

### `GH_TOKEN_RO` — the read-only token

`GH_TOKEN_RO` is a read-only GitHub PAT baked into the app binary at build time via a Vite `define`. The packaged app uses it to authenticate when checking for updates.

| Scenario | Token needed? |
|---|---|
| Public repo (e.g. this one) | No — leave `GH_TOKEN_RO` empty |
| Private fork | Yes — create a PAT with `Contents: Read` and add it as a `GH_TOKEN_RO` secret |

Never confuse `GH_TOKEN_RO` (baked into the binary, read-only) with `GH_TOKEN` (used by the release workflow to upload artifacts, never baked in).

### Testing the end-to-end flow

1. `npm run build:win` → install the output `.exe`.
2. Bump `version` in `package.json`, commit, push, and tag.
3. Wait for the release workflow to complete.
4. In the running older version, click **Check for Updates**.

## GitHub Actions

### `ci.yml` — lint + typecheck

Runs on every push to `main` and every pull request. Uses an `ubuntu-latest` runner (cheap). Runs `npm run lint` and `npm run typecheck`.

### `release.yml` — Windows installer

Triggers on `v*.*.*` tag pushes. Uses a `windows-latest` runner. Produces a one-click NSIS installer (`*-setup.exe`) and the update manifest (`latest.yml`) as GitHub Release assets.

**Secrets required in repo settings (*Settings → Secrets and variables → Actions*):**

| Secret | Permission | Required |
|---|---|---|
| `GH_TOKEN` | Contents: Read and write (to create releases) | Yes |
| `GH_TOKEN_RO` | Contents: Read (baked into binary) | Only for private forks |

### Using your dev machine as the runner

Useful when you need a code-signing certificate (which lives on your machine), have a private fork, or want to avoid GitHub runner minutes.

**Setup:**

1. Go to *Repo → Settings → Actions → Runners → New self-hosted runner*.
2. Follow the Windows installation steps shown in the UI.
3. In `.github/workflows/release.yml`, change:
   ```yaml
   runs-on: windows-latest
   ```
   to:
   ```yaml
   runs-on: [self-hosted, Windows]
   ```
4. Set `GH_TOKEN` and `GH_TOKEN_RO` as machine-level environment variables (or in the runner's `.env` file) — the workflow reads them the same way as GitHub secrets.

**Code signing (optional):** Set `WIN_CSP_KEY_PASSWORD`, `WIN_CSP_SHA1`, and related variables as environment variables on the runner machine. `electron-builder` picks them up automatically. Without signing, Windows SmartScreen will warn on first launch.

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

In default mode, a log file is only created when the first error is logged, so a clean run leaves no file. Check `%APPDATA%\windows-electron-starter-kit\logs\`. For full verbosity (including info and the IPC stream) in a packaged build, relaunch with `--debug`.

## License

MIT
