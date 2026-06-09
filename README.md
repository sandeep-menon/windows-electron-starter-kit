# Windows Electron Starter Kit

An enterprise-grade, production-ready Electron starter kit for Windows desktop applications. It ships with a typed, runtime-validated IPC layer, a sandboxed renderer, structured and rotated logging with sensitive-data redaction, and a modern React + TypeScript UI — batteries included, with sensible defaults that hold up in production.

## Stack

| Layer | Technology |
|---|---|
| Framework | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| UI | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| Notifications | [Sonner](https://sonner.emilkowal.ski/) |
| Validation | [Zod](https://zod.dev/) |
| Persistence | [electron-store](https://github.com/sindresorhus/electron-store) |
| Logging | [electron-log](https://github.com/megahertz/electron-log) |
| Auto-update | [electron-updater](https://www.electron.build/auto-update) (dependency available; not yet wired) |
| Packaging | [electron-builder](https://www.electron.build/) |

## Getting Started

```bash
# Clone
git clone https://github.com/sandeep-menon/windows-electron-starter-kit.git
cd windows-electron-starter-kit

# Install
npm install

# Develop
npm run dev

# Build for Windows
npm run build:win
```

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start in development mode. Renderer has full HMR (state-preserving). |
| `npm run dev:watch` | Same as `dev`, but also watches the **main** and **preload** processes and automatically rebuilds + restarts the app when they change. |
| `npm run start` | Preview a production build locally (`electron-vite preview`). |
| `npm run build` | Type-check, then build all processes for distribution. |
| `npm run build:win` | Build and package a Windows installer. |
| `npm run build:mac` / `build:linux` | Build and package for macOS / Linux. |
| `npm run build:unpack` | Build an unpacked directory (useful for inspection/debugging). |
| `npm run typecheck` | Type-check both the Node (main/preload) and web (renderer) projects. |
| `npm run lint` | Run ESLint across the project. |
| `npm run format` | Format the codebase with Prettier. |

> **Note on hot reload:** `npm run dev` only hot-reloads the **renderer** (React UI). The main and preload processes are Node code and cannot be hot-swapped in place — use `npm run dev:watch` to have electron-vite rebuild and **restart** the app automatically when you edit them.

## Project Structure

```
src/
├── main/                     # Electron main process (Node.js)
│   ├── index.ts              # App lifecycle + bootstrap
│   ├── handler.ts            # IPC handlers + sender & schema validation
│   └── utils/
│       ├── application.ts    # Window factory (createWindow), logging setup, rotation, diagnostics
│       ├── store.ts          # electron-store instance (typed, lazy singleton)
│       └── events.ts         # Typed main→renderer broadcast helper
├── preload/                  # Secure bridge between main and renderer
│   ├── index.ts              # contextBridge API + IPC logging + payload redaction
│   └── index.d.ts            # Typed `window.api` declarations
├── renderer/                 # React application (UI)
│   └── src/
│       ├── App.tsx           # Main-window root (entry "#main")
│       ├── Child.tsx         # Child-window root (entry "#child")
│       ├── main.tsx          # Picks the root component from the URL hash
│       ├── hooks/
│       │   └── useFirstName.ts  # Reads + live-subscribes to persisted state
│       └── components/ui/    # shadcn/ui components
└── shared/                   # Code shared across all three processes
    ├── protocol.ts           # IPC contract: Zod schemas + inferred types + events (single source of truth)
    └── types.ts              # Shared types (MainProcessResponse, StoreSchema, …)
```

## Architecture

Electron runs your code in three isolated contexts that cannot call each other directly. This kit treats the boundary between them as a first-class, **fully typed and runtime-validated** contract.

```mermaid
flowchart LR
    subgraph Renderer["Renderer Process — Chromium (sandboxed UI)"]
        UI["React UI<br/>window.api.invoke(channel, params)"]
    end
    subgraph Preload["Preload — contextBridge"]
        Bridge["Typed API surface<br/>IPC logging + payload redaction"]
    end
    subgraph Main["Main Process — Node.js (privileged)"]
        Handlers["ipcMain.handle()<br/>sender + schema validation"]
        Work["Filesystem / Network / OS"]
    end

    UI -->|"1 invoke(channel, params)"| Bridge
    Bridge -->|"2 ipcRenderer.invoke"| Handlers
    Handlers --> Work
    Work --> Handlers
    Handlers -->|"3 MainProcessResponse"| Bridge
    Bridge -->|"4 Promise&lt;result&gt;"| UI
```

- **Renderer** has no Node.js or OS access by design. It can only send the specific messages the preload exposes.
- **Preload** is the single, controlled doorway. It uses `contextBridge.exposeInMainWorld` to publish a minimal `window.api` and nothing else.
- **Main** performs all privileged work (network, filesystem, OS) inside handlers registered in `src/main/handler.ts` — but only after validating the sender and the payload.

### Typed IPC contract

Every IPC channel is declared **once**, in `src/shared/protocol.ts`, as a [Zod](https://zod.dev/) schema. That single declaration is the source of truth for *both* the compile-time types and the runtime validation:

```ts
// src/shared/protocol.ts — the single source of truth
export const IPCParamSchemas = {
  "get-random-todo": z.void(),
  "get-todo-by-id":  z.object({ id: z.number().int().positive() }),
} as const;

// Each channel also declares the shape of the data it resolves with on success:
export interface IPCResponseData extends Record<IPCChannel, unknown> {
  "get-random-todo": Todo;
  "get-todo-by-id":  Todo;
}

// The typed contract is *inferred* from the schemas — no hand-written interface to keep in sync:
export type IPCInvocations = {
  [K in keyof typeof IPCParamSchemas]: {
    params:  z.infer<(typeof IPCParamSchemas)[K]>;
    returns: MainProcessResponse<IPCResponseData[K]>;
  };
};
```

From this one declaration, the generic `invoke<K extends IPCChannel>` signature is able to:

- restrict `channel` to declared channel names only;
- **require** a correctly-typed parameter argument when the channel declares one (`get-todo-by-id`), and **forbid** one when it does not (`get-random-todo`, declared `z.void()`);
- resolve the return type automatically — e.g. `Promise<MainProcessResponse<Todo>>` — so `resp.data` is typed per channel.

So a typo, a wrong parameter, or a changed return shape is caught at compile time across all three processes.

### Runtime validation & trusted senders

Types only exist at compile time — they are erased before the app runs, so they cannot guard the data that actually crosses the process boundary. To close that gap, `registerHandlers()` in `src/main/handler.ts` wraps **every** handler with two checks before it runs:

1. **Trusted-sender check.** The handler inspects `event.senderFrame` and rejects any message that did not originate from our own renderer (the electron-vite dev-server origin in development, a `file:` URL in a packaged build). This is defense in depth: if untrusted content were ever loaded into a frame, it still could not drive privileged handlers.
2. **Schema validation.** The incoming params are run through the channel's Zod schema with `safeParse`. If validation fails, the handler returns a structured `{ success: false, error }` **without executing** — no malformed value ever reaches your business logic, a network call, or a filesystem path.

Both checks are applied centrally, so they are **automatic for every channel** — including any you add later. Declaring the schema is all it takes; you never write per-handler validation code. (See [Extending This Starter Kit](#extending-this-starter-kit) for the add-a-channel recipe.)

### Typed responses & structured errors

Every handler resolves with a `MainProcessResponse<T>` — a **discriminated union**, not a loose bag of optional fields:

```ts
// src/shared/types.ts
export type MainProcessResponse<T = unknown> =
  | { success: true;  data: T }
  | { success: false; error: MainProcessError };

export interface MainProcessError {
  code: MainProcessErrorCode;   // "NOT_FOUND" | "INVALID_PARAMS" | "NETWORK" | … (open-ended)
  message: string;              // human-readable
  details?: unknown;            // e.g. the Zod issue list for INVALID_PARAMS
}
```

Because `success` is the discriminant, checking it **narrows the type** in the renderer — no casts, no optional-field guessing:

```ts
const resp = await window.api.invoke("get-todo-by-id", { id });
if (!resp.success) {
  if (resp.error.code === "NOT_FOUND") { /* show a friendly empty state */ }
  toast.error(resp.error.message);
} else {
  toast.info(resp.data.todo);   // resp.data is typed `Todo` here
}
```

The structured `error.code` lets the UI react per failure type (retry, redirect, friendly message) rather than string-matching, and `details` carries machine-readable context (the param-validation failures attach the full Zod issue list). The per-channel `data` type comes from `IPCResponseData`, so `resp.data` is precisely typed for every channel — the `any` is gone from end to end.

## Multi-Window Architecture

Every window — the main window and any child window — is created through a single factory, `createWindow({ entry, parent })`, in `src/main/utils/application.ts`. Window options (the Chromium sandbox, dimensions, the external-link handler) are therefore defined in exactly one place and can never drift between windows.

Two ideas make multiple windows ergonomic:

**1. One bundle, many "screens" — chosen before React mounts.**

There is a single renderer bundle and a single `index.html`. Which root component a window renders is decided by an `entry` value the main process passes as a **URL hash** (`#main`, `#child`):

```ts
// src/main/utils/application.ts
export function createWindow(
  { entry, parent }: { entry: AppEntry; parent?: BrowserWindow }
): BrowserWindow {
  // ...shared BrowserWindow options...
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#${entry}`);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"), { hash: entry });
  }
  return window;
}
```

`main.tsx` reads that hash **synchronously**, at module-evaluation time, and mounts the matching component:

```tsx
// src/renderer/src/main.tsx
const Root = window.location.hash === "#child" ? Child : App;
// ...render <Root /> inside the providers...
```

Because the choice happens before the first render, the correct screen is painted on the first frame — **no client-side router, and no flash** of the wrong UI followed by a redirect. To add another window type, add a value to the `AppEntry` union and a branch in `main.tsx`.

**2. Modal child windows.**

`createWindow` accepts an optional `parent`. When it's present, the window is created with `parent` and `modal: true`, so it behaves as a true child: it stays above its parent and **blocks interaction with the parent** until it closes. The handler that opens the child resolves the parent from the calling window, so the relationship is wired automatically:

```ts
// src/main/handler.ts — the "open-child-window" handler
const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
createWindow({ entry: "child", parent });
```

Opening a *non-modal* secondary window is simply `createWindow({ entry })` with no `parent`.

## Persistence (electron-store)

Data that must survive restarts is stored with [electron-store](https://github.com/sindresorhus/electron-store), which lives in the **main process** — the single source of truth (see [Cross-Window Reactive State](#cross-window-reactive-state) for why that matters once more than one window is open). The renderer never touches the store directly; it goes through the same typed, validated IPC layer as everything else.

**Typed schema, lazy singleton.** The store's shape is declared once in `src/shared/types.ts`, and the instance is created lazily so it is only constructed after the app is ready:

```ts
// src/main/utils/store.ts
import Store from "electron-store";
import { StoreSchema } from "../../shared/types";

let store: Store<StoreSchema> | null = null;

export function getStore(): Store<StoreSchema> {
  if (!store) {
    store = new Store<StoreSchema>({ defaults: { firstName: "" } });
  }
  return store;
}
```

Reads and writes happen inside IPC handlers — `getStore().set("firstName", value)` / `getStore().get("firstName", "")` — so persistence inherits the sender + schema validation that every channel gets.

> **Gotcha — always pass a per-call default to `.get()`.** The `defaults` option is only applied when the store is *constructed* (it seeds the file once). `store.get("key")` reads the live file on each call and falls back only to its **second argument**, not to `defaults`. So if the config file is missing or deleted while the app is running, `get("firstName")` returns `undefined` rather than `""`. Pass the default explicitly — `get("firstName", "")` — and the value is always well-typed.

**ESM-only — must be bundled into the main process.** electron-store v11 is ESM-only, but the main process is emitted as CommonJS, and electron-vite externalizes `dependencies` by default (leaving a runtime `require()` that would fail on an ESM-only package). It is therefore **excluded from externalization so it gets bundled in** — the same mechanism the preload uses for its dependencies:

```ts
// electron.vite.config.ts
main: {
  build: {
    externalizeDeps: {
      exclude: ['electron-store']
    }
  }
}
```

Add any other ESM-only main-process dependency to this `exclude` list the same way. The store file lives alongside the logs in the per-user data directory — on Windows, `%APPDATA%\windows-electron-starter-kit\config.json`.

## Cross-Window Reactive State

Once a second window is open, a subtle question appears: if one window changes persisted state, how do the others find out? **Client-side state libraries (Zustand, Redux, Jotai, …) do not solve this** — each Electron window is its own renderer process with its own JavaScript heap, so a store updated in one window is invisible to another. The authoritative shared state lives in the **main process**; windows stay in sync by being *notified* when it changes.

The kit does this with **main → renderer broadcast events**, declared in the same `protocol.ts` contract as the request/response channels:

```ts
// src/shared/protocol.ts
export interface IPCEvents {
  "first-name-changed": string;
}
```

A typed `broadcast()` helper sends an event to **every** open window, and handlers fire it right after they mutate state:

```ts
// src/main/utils/events.ts
export function broadcast<K extends IPCEventChannel>(channel: K, data: IPCEvents[K]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, data);
  }
}

// src/main/handler.ts — inside "set-first-name", after persisting:
getStore().set("firstName", params.firstName);
broadcast("first-name-changed", params.firstName);
```

On the renderer side, `window.api.on(channel, cb)` subscribes and **returns an unsubscribe function** — designed to drop straight into a `useEffect` cleanup. The kit wraps "read the current value, then keep it live" in a small hook:

```ts
// src/renderer/src/hooks/useFirstName.ts
export function useFirstName(): string {
  const [firstName, setFirstName] = useState("");
  useEffect(() => {
    let active = true;
    window.api.invoke("get-first-name").then((resp) => {
      if (active && resp.success) setFirstName(resp.data);
    });
    const unsubscribe = window.api.on("first-name-changed", (_event, name) => setFirstName(name));
    return () => { active = false; unsubscribe(); };
  }, []);
  return firstName;
}
```

Any component calls `const firstName = useFirstName()` and gets a value that updates live — including when a **different** window changed it (e.g. the modal child window saves a new name, and the main window's greeting updates the moment the child closes).

```mermaid
flowchart TD
    Child["Child window<br/>invoke('set-first-name', …)"] --> H["Main: set-first-name handler"]
    H --> S["electron-store<br/>(source of truth)"]
    H --> BC["broadcast('first-name-changed')"]
    BC --> W1["Main window<br/>useFirstName() re-renders"]
    BC --> W2["…every other open window"]
```

**Adding your own event:** declare it in `IPCEvents` (`protocol.ts`), call `broadcast("your-event", payload)` from the main process, and subscribe with `window.api.on("your-event", cb)` in the renderer — the channel name and payload type are checked end to end, exactly like invoke channels.

> Reach for broadcast events specifically when state must stay consistent **across** windows, or is persisted in the main process. For state shared only **within** a single window, ordinary React state (or a client store) is the simpler choice.

## Security

Security here isn't one feature — it's layered across the process model, the IPC boundary, and what gets written to disk.

**Process isolation**

- The renderer runs inside the **full Chromium sandbox** (`sandbox: true`), with `contextIsolation: true` and `nodeIntegration: false` set explicitly. The UI has no access to Node.js, `require`, or `ipcRenderer` — its only capability is the minimal, typed `window.api` published via `contextBridge`.
- The **preload is a single, self-contained bundle**: every dependency it uses is inlined at build time, so nothing is resolved from `node_modules` at runtime and the sandbox boundary stays intact.

**The IPC boundary**

- **Trusted-sender validation** — handlers verify `event.senderFrame` and reject messages that aren't from our own renderer (see [Runtime validation & trusted senders](#runtime-validation--trusted-senders)).
- **Runtime payload validation** — every channel's params are validated against its Zod schema before the handler runs, so the type contract is enforced at runtime, not just at compile time.

**Content & navigation**

- External links are delegated to the OS browser via `setWindowOpenHandler`, and new in-app window creation is **denied by default**.

**Log-data protection**

- Secrets in IPC payloads are scrubbed from logs before they are written to disk (see [Sensitive-Data Redaction](#sensitive-data-redaction)).

## Logging

Logging is built on [electron-log](https://github.com/megahertz/electron-log) v5 and is configured in `src/main/utils/application.ts`. It is initialized once on app startup, before the first window is created.

### Behavior at a glance

| Environment | File logging | Verbosity (file + console) |
|---|---|---|
| Development | Always on | `silly` (everything) |
| Production (default) | Always on | `info` |
| Production with `--enable-logging` | Always on | `silly` (everything) |

Verbosity is decided by a single rule:

```ts
function isVerboseLogging() {
  return is.dev || process.argv.includes("--enable-logging")
}
// → level = isVerboseLogging() ? "silly" : "info"
```

This means logging is **always on** — file logging is never silently disabled. In a packaged build you get concise `info`-level logs by default, and you can launch with the `--enable-logging` flag to capture full `silly`-level diagnostics from a customer's machine when troubleshooting, without shipping a new build:

```bash
"Windows Electron Starter Kit.exe" --enable-logging
```

### Log files, location, and rotation

- Logs are written to the OS-standard per-user data directory:
  - **Windows:** `%APPDATA%\windows-electron-starter-kit\logs\`
- Each launch creates a fresh, timestamped file: `app_<YYYYMMDD>_<epoch>.log`.
- **Rotation:** on every launch the kit keeps only the **5 most recent** log files and deletes older ones — in both development and production — so disk usage stays bounded without manual cleanup.

### What gets captured

- **Every process logs to one file.** Main logs via `electron-log/main`, and the preload via `electron-log/renderer` (forwarded through the v5 bridge set up by `log.initialize()`). The **sandboxed React renderer has no direct IPC**, so it logs through a small `window.api.log` bridge the preload exposes — calls run in the preload context, where the renderer transport works, and are redacted like any other payload.
- **Unexpected errors are captured automatically — in every process.** The main process uses `log.errorHandler.startCatching()`. The renderer gets the same safety net without any per-error code: global `error` / `unhandledrejection` handlers (`src/renderer/src/lib/errorLogging.ts`, installed once at startup) catch uncaught errors and rejected promises, and a React **error boundary** (`src/renderer/src/components/ErrorBoundary.tsx`) catches render-time failures (which React routes away from `window.onerror`) and shows a recoverable fallback instead of a blank window. You throw or reject naturally; the stack is recorded.
- **Startup diagnostics:** a structured environment snapshot (app version, Electron/Node/Chromium versions, OS, key paths, process info) is logged at launch to speed up issue triage.
- **IPC tracing:** every `invoke`/`on` request, response, and error is logged with its channel name and payload (see [redaction](#sensitive-data-redaction) below).

```mermaid
flowchart TD
    RE["Renderer errors<br/>(global handlers + ErrorBoundary)"] --> RL
    RL["Renderer logs<br/>window.api.log (runs in preload)"] --> B
    P["Preload logs<br/>(electron-log/renderer)"] --> B
    B["main↔renderer bridge<br/>log.initialize()"] --> F
    M["Main logs (electron-log/main)<br/>+ errorHandler.startCatching()"] --> F
    F["Single rotated log file<br/>userData/logs/app_*.log<br/>(keep latest 5)"]
```

## Sensitive-Data Redaction

The preload logs the full payload of every IPC request and response, which is invaluable for debugging but risky if a payload carries credentials. To prevent secrets from being written to disk, all logged payloads pass through a recursive `redact()` function (`src/preload/index.ts`) **before** they are logged.

- A key is redacted if, after **normalizing** it (lowercasing and stripping `_` and `-`), it **contains** any known sensitive term as a substring. This matches the real-world variants APIs actually use — `access_token`, `api_key`, `x-api-key`, `client_secret`, `refreshToken`, `Set-Cookie` — not just the exact spellings.
- Redaction is **recursive** — it descends into nested objects and arrays at any depth.
- Default sensitive terms include: `password`, `token`, `secret`, `authorization`, `apikey`, `accesstoken`, `personalaccesstoken`, `pat`, `refreshtoken`, `cookie`.

The substring match is **deliberately broad**: it is a logging safety net, so it errs on the side of redacting too much (e.g. a field named `tokenCount` would also be scrubbed). Losing a little debug detail is a worthwhile trade for never leaking a credential to disk.

Critically, **redaction only affects what is logged — never what is sent.** The actual IPC call always receives the original, unredacted arguments; only the copy written to the log is scrubbed.

```ts
// Example — what reaches the log:
invoke("save-credentials", { user: "alice", access_token: "sk-live-123" })
// logged as: { user: "alice", access_token: "[REDACTED]" }
// the handler still receives the real token
```

To protect additional fields, add their key names to the `SENSITIVE_KEYS` array in `src/preload/index.ts` (see [Extending This Starter Kit](#extending-this-starter-kit) below).

## Extending This Starter Kit

This kit is built to be extended. The recipes below cover the common ways to grow it without breaking the guarantees it ships with. More will be added here over time.

### Adding an IPC channel

Because the schema is the single source of truth, adding a channel is a compiler-guided change that gives you typing **and** runtime validation for free:

1. **Declare the schema** in `IPCParamSchemas` (`src/shared/protocol.ts`). Use `z.void()` for a channel that takes no params, or a `z.object({ ... })` for one that does:

   ```ts
   // src/shared/protocol.ts
   export const IPCParamSchemas = {
     "get-random-todo": z.void(),
     "get-todo-by-id":  z.object({ id: z.number().int().positive() }),
     "save-note":       z.object({ title: z.string().min(1), body: z.string() }), // ← new
   } as const;
   ```

2. **Declare the response data type** in `IPCResponseData` (`src/shared/protocol.ts`). The `extends Record<IPCChannel, unknown>` constraint makes this a **compile error to skip** — every channel must say what its `data` looks like on success:

   ```ts
   // src/shared/protocol.ts
   export interface IPCResponseData extends Record<IPCChannel, unknown> {
     "get-random-todo": Todo;
     "get-todo-by-id":  Todo;
     "save-note":       Note; // ← new
   }
   ```

3. **Implement the handler** in the `handlers` map in `src/main/handler.ts`. The mapped type forces this — the build fails until you do, and your handler receives params already validated against the schema and must return `MainProcessResponse<Note>`:

   ```ts
   "save-note": async (_event, params) => saveNote(params), // params is typed AND validated
   ```

4. **Call it** from the renderer — fully typed, with autocomplete on the channel name, params, and `resp.data`:

   ```ts
   const resp = await window.api.invoke("save-note", { title: "Hi", body: "..." });
   if (resp.success) { /* resp.data is typed `Note` */ }
   ```

No preload changes are ever required — the generic bridge adapts automatically, and the sender + schema checks are applied centrally for the new channel.

> **Heads up if you change how the renderer is loaded.** The trusted-sender check in `isTrustedSender()` (`src/main/handler.ts`) assumes the renderer is served from the electron-vite **dev-server origin** in development and from a **`file:` URL** in a packaged build. If you load the renderer some other way — a **custom scheme** (e.g. `app://`) or a **remote URL** — that check will reject *every* IPC call with `"Unauthorized sender"`. Update the allowed origin(s) in `isTrustedSender()` to match your setup when you do this.

### Adding a dependency to the preload

The renderer runs inside the **full Chromium sandbox** (`sandbox: true`), and a sandboxed preload only runs code that is **bundled into the preload itself** — it cannot resolve packages from `node_modules` at runtime. To keep that boundary intact, the preload is built as a **single, self-contained bundle** with every dependency inlined at build time.

Because of this, any new package you `import` from `src/preload/` must be **bundled in**, not externalized. Add its package name to the `exclude` list in `electron.vite.config.ts`:

```ts
// electron.vite.config.ts
preload: {
  build: {
    externalizeDeps: {
      // Every dependency imported from src/preload/ goes here so it is bundled
      // into the self-contained preload and stays available under the sandbox.
      exclude: ['@electron-toolkit/preload', 'electron-log', 'your-new-package']
    }
  }
}
```

By default electron-vite externalizes everything in `dependencies` (leaving runtime `require()` calls in the output, which a sandboxed preload cannot load); `exclude` opts a package **into** the bundle instead. After editing the list, restart `npm run dev` so the preload is rebuilt.

> **Main-process code is unaffected** — the main process is not sandboxed and can use dependencies normally, with no changes to this list.

### Redacting more sensitive fields from logs

Logged IPC payloads are scrubbed by the `redact()` function in `src/preload/index.ts` (see [Sensitive-Data Redaction](#sensitive-data-redaction) above). To protect a new kind of secret, add a lowercase, separator-free **term** to the `SENSITIVE_KEYS` array:

```ts
// src/preload/index.ts
const SENSITIVE_KEYS = [
  'password', 'token', 'secret', 'authorization', 'apikey', 'accesstoken',
  'personalaccesstoken', 'pat', 'refreshtoken', 'cookie',
  'sessionid' // ← your new term: also catches session_id, sessionId, X-Session-ID, …
];
```

Because matching is normalized (lowercased, `_`/`-` stripped) and substring-based, you only add the **core term once** — every prefixed, snake_case, kebab-case, and camelCase variant is then covered automatically. Keep terms lowercase with no separators so they match the normalized key. Redaction takes effect immediately on the next request once the preload is rebuilt.

## Troubleshooting

### 1) Electron binary download fails

If the Electron distributable does not download during installation, run:

```bash
node .\\node_modules\\electron\\install.js
```

Then retry:

```bash
npm install
```

### 2) App icon is not updated in build output

To apply a custom icon consistently, update all of the following files:

- `resources/icon.png`
- `build/icon.png`
- `build/icon.ico`

Icon requirements:

- `icon.ico` should be at least 256x256.
- Use square source assets to avoid scaling artifacts.
- Re-run `npm run build` after replacing icon files.

### 3) Build succeeds but packaged app looks stale

If assets appear outdated:

- Remove previous output directories (for example `dist/`, if present).
- Re-run `npm run build`.
- Confirm you are launching the newly generated package.

### 4) Edits to main/preload don't take effect during development

`npm run dev` only hot-reloads the renderer. Use `npm run dev:watch` so electron-vite rebuilds and restarts the app when main or preload code changes. If a restart doesn't happen, check the terminal for a build error — a failed build skips the restart.

### 5) No log file appears

File logging is always on, so a missing log usually means the app crashed before logging initialized, or you are looking in the wrong directory. Confirm the path `%APPDATA%\windows-electron-starter-kit\logs\` and, for full verbosity in a packaged build, relaunch with `--enable-logging`.

## License

MIT
