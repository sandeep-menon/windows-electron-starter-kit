# Auto-Update + Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire electron-updater into WESK with a VSCode-style Check → Download → Restart flow, backed by a tag-triggered GitHub Actions release pipeline that produces a one-click Windows installer.

**Architecture:** A new `src/main/updater.ts` module owns all `electron-updater` logic and is injected with the main window reference at startup. Update state travels from main → renderer exclusively via six typed `update:*` IPC events declared in `IPCEvents`. The renderer reacts to those events with a local `UpdateState` discriminated union — no polling, no shared mutable state. Four new invoke channels (`check-for-updates`, `download-update`, `install-update`, `get-app-version`) let the renderer initiate each step. The updater is a complete no-op when `!app.isPackaged`.

**Tech Stack:** electron-updater (already in dependencies), GitHub provider, Vite define for build-time token injection, GitHub Actions with `windows-latest` runner.

**Spec:** `docs/superpowers/specs/2026-08-24-auto-update-design.md`

## Global Constraints

- `autoDownload: false` — download must be user-initiated via the "Download" button.
- `autoInstallOnAppQuit: false` — install is user-initiated via "Restart to Update".
- Updater returns early when `!app.isPackaged`; `checkForUpdates()` fires `update:not-available` so the renderer never hangs in dev.
- GitHub provider: `owner: "sandeep-menon"`, `repo: "windows-electron-starter-kit"`, `private: false`. Token is omitted when `__GH_TOKEN_RO__` is empty (public repos need no token).
- All IPC channels go through the existing `registerHandlers()` infrastructure — no direct `ipcMain.handle` calls.
- No new preload code — the generic bridge in `src/preload/index.ts` adapts automatically.
- Node 20 LTS for all GitHub Actions workflows.
- `npm ci` (not `npm install`) in all CI steps.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `electron.vite.config.ts` | Modify | Inject `__GH_TOKEN_RO__` at build time via Vite `define` |
| `src/main/updater.ts` | **Create** | `initUpdater`, `checkForUpdates`, `downloadUpdate`, `installUpdate` |
| `src/shared/protocol.ts` | Modify | 4 new invoke channels + 6 new `update:*` events |
| `src/main/handler.ts` | Modify | 4 new handlers wired to updater functions |
| `src/main/index.ts` | Modify | Call `initUpdater(mainWindow)` after window creation |
| `src/renderer/src/App.tsx` | Modify | `UpdateState` union, version/update state, event subscriptions, inline update section |
| `electron-builder.yml` | Modify | Switch `publish` from `generic` to `github` provider |
| `.github/workflows/ci.yml` | **Create** | Lint + typecheck on every PR / push to main |
| `.github/workflows/release.yml` | **Create** | Tag-triggered Windows build + publish |
| `README.md` | Modify | Auto-Update and GitHub Actions sections |
| `docs/index.html` | Modify | Auto-update feature card + setup section |
| `CLAUDE.md` | Modify | Mark CI row of known issues as resolved |

---

### Task 1: Vite define + updater module

**Files:**
- Modify: `electron.vite.config.ts`
- Create: `src/main/updater.ts`

**Interfaces:**
- Produces:
  - `initUpdater(mainWindow: BrowserWindow): void`
  - `checkForUpdates(): void`
  - `downloadUpdate(): void`
  - `installUpdate(): void`

- [ ] **Step 1: Add `__GH_TOKEN_RO__` define to `electron.vite.config.ts`**

The `main` block currently has only `build`. Add a `define` block above it:

```ts
// electron.vite.config.ts
main: {
    define: {
        __GH_TOKEN_RO__: JSON.stringify(process.env.GH_TOKEN_RO ?? "")
    },
    build: {
        externalizeDeps: {
            exclude: ["electron-store"]
        }
    }
},
```

The full file after the change:

```ts
import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    main: {
        define: {
            __GH_TOKEN_RO__: JSON.stringify(process.env.GH_TOKEN_RO ?? "")
        },
        build: {
            externalizeDeps: {
                exclude: ["electron-store"]
            }
        }
    },
    preload: {
        build: {
            externalizeDeps: {
                exclude: ["@electron-toolkit/preload", "electron-log"]
            }
        }
    },
    renderer: {
        resolve: {
            alias: {
                "@renderer": resolve("src/renderer/src"),
                "@": resolve("src/renderer/src")
            }
        },
        plugins: [react(), tailwindcss()]
    }
});
```

- [ ] **Step 2: Create `src/main/updater.ts`**

```ts
import { BrowserWindow, app } from "electron";
import { autoUpdater } from "electron-updater";
import log from "electron-log/main";

declare const __GH_TOKEN_RO__: string;

let win: BrowserWindow | null = null;

function send(channel: string, data?: unknown): void {
    if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
    }
}

export function initUpdater(mainWindow: BrowserWindow): void {
    win = mainWindow;

    if (!app.isPackaged) {
        log.info("[updater] Skipping auto-updater setup (not packaged)");
        return;
    }

    autoUpdater.setFeedURL({
        provider: "github",
        owner: "sandeep-menon",
        repo: "windows-electron-starter-kit",
        private: false,
        ...(__GH_TOKEN_RO__ && { token: __GH_TOKEN_RO__ }),
    });

    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
        send("update:checking");
    });

    autoUpdater.on("update-available", (info) => {
        send("update:available", { version: info.version });
    });

    autoUpdater.on("update-not-available", () => {
        send("update:not-available");
    });

    autoUpdater.on("download-progress", (progress) => {
        send("update:progress", { percent: Math.floor(progress.percent) });
    });

    autoUpdater.on("update-downloaded", (info) => {
        send("update:downloaded", { version: info.version });
    });

    autoUpdater.on("error", (err) => {
        send("update:error", { message: err.message });
    });
}

export function checkForUpdates(): void {
    if (!app.isPackaged) {
        send("update:not-available");
        return;
    }
    autoUpdater.checkForUpdates().catch((err: Error) => {
        log.error("[updater] checkForUpdates() failed:", err);
    });
}

export function downloadUpdate(): void {
    if (!app.isPackaged) return;
    autoUpdater.downloadUpdate().catch((err: Error) => {
        log.error("[updater] downloadUpdate() failed:", err);
    });
}

export function installUpdate(): void {
    if (!app.isPackaged) return;
    autoUpdater.quitAndInstall(true, true);
}
```

- [ ] **Step 3: Verify typecheck passes**

`updater.ts` is not yet imported by anything, so the build graph is unchanged.

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add electron.vite.config.ts src/main/updater.ts
git commit -m "feat: add updater module and GH_TOKEN_RO Vite define"
```

---

### Task 2: IPC contract + handler wiring + entry point

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/main/handler.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `initUpdater`, `checkForUpdates`, `downloadUpdate`, `installUpdate` from `./updater` (Task 1)
- Produces: channels `check-for-updates`, `download-update`, `install-update`, `get-app-version` and events `update:checking`, `update:available`, `update:not-available`, `update:progress`, `update:downloaded`, `update:error` fully wired end-to-end

> **Important:** All three files in this task must be edited together before running typecheck. Adding channels to `IPCParamSchemas` without completing `IPCResponseData` and the `handlers` map will fail typecheck — the `extends Record<IPCChannel, unknown>` constraint and the exhaustive `handlers` type enforce completeness.

- [ ] **Step 1: Add channels and events to `src/shared/protocol.ts`**

Add four entries to `IPCParamSchemas` (after `"get-first-name"`):

```ts
export const IPCParamSchemas = {
    "get-random-todo": z.void(),
    "get-todo-by-id": z.object({ id: z.number().int().positive() }),
    "open-child-window": z.void(),
    "set-first-name": z.object({ firstName: z.string().trim().min(1).max(100) }),
    "get-first-name": z.void(),
    "check-for-updates": z.void(),
    "download-update": z.void(),
    "install-update": z.void(),
    "get-app-version": z.void(),
} as const;
```

Add four entries to `IPCResponseData`:

```ts
export interface IPCResponseData extends Record<IPCChannel, unknown> {
    "get-random-todo": Todo;
    "get-todo-by-id": Todo;
    "open-child-window": void;
    "set-first-name": void;
    "get-first-name": string;
    "check-for-updates": void;
    "download-update": void;
    "install-update": void;
    "get-app-version": string;
}
```

Add six entries to `IPCEvents`:

```ts
export interface IPCEvents {
    "first-name-changed": string;
    "update:checking": void;
    "update:available": { version: string };
    "update:not-available": void;
    "update:progress": { percent: number };
    "update:downloaded": { version: string };
    "update:error": { message: string };
}
```

- [ ] **Step 2: Add handlers and imports to `src/main/handler.ts`**

Add two imports at the top (alongside the existing imports):

```ts
import { app } from "electron";
import { checkForUpdates, downloadUpdate, installUpdate } from "./updater";
```

The existing import line `import { BrowserWindow, ipcMain } from "electron"` becomes:

```ts
import { BrowserWindow, ipcMain, app } from "electron";
```

And add a separate import for the updater:

```ts
import { checkForUpdates, downloadUpdate, installUpdate } from "./updater";
```

Add four entries at the end of the `handlers` map (before the closing `}`):

```ts
    "check-for-updates": (_event, _params) => {
        checkForUpdates();
        return { success: true, data: undefined };
    },
    "download-update": (_event, _params) => {
        downloadUpdate();
        return { success: true, data: undefined };
    },
    "install-update": (_event, _params) => {
        installUpdate();
        return { success: true, data: undefined };
    },
    "get-app-version": () => ({
        success: true,
        data: app.getVersion()
    }),
```

- [ ] **Step 3: Wire `initUpdater` in `src/main/index.ts`**

Add one import line alongside the existing imports:

```ts
import { initUpdater } from "./updater";
```

Add one call immediately after `createWindow`:

```ts
    const mainWindow = createWindow({ entry: "main" });
    initUpdater(mainWindow);
```

The relevant block in `index.ts` after the change:

```ts
    const cleanup = registerHandlers();

    const mainWindow = createWindow({ entry: "main" });
    initUpdater(mainWindow);

    setImmediate(() => {
        initializeLogging();
        getStore();
    });
```

- [ ] **Step 4: Verify typecheck passes**

```
npm run typecheck
```

Expected: no errors. Both `tsconfig.node.json` (main/preload) and `tsconfig.web.json` (renderer) must pass.

- [ ] **Step 5: Commit**

```
git add src/shared/protocol.ts src/main/handler.ts src/main/index.ts
git commit -m "feat: wire update IPC channels, handlers, and initUpdater call"
```

---

### Task 3: Renderer update UI

**Files:**
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: channels `check-for-updates`, `download-update`, `install-update`, `get-app-version` and events `update:checking`, `update:available`, `update:not-available`, `update:progress`, `update:downloaded`, `update:error` (all from Task 2)

- [ ] **Step 1: Replace `App.tsx` with the updated version**

The complete updated `App.tsx` (changes: add `useEffect` to the React import, add `UpdateState` type, add two state vars, add the `useEffect` subscription, add the update section JSX at the bottom of `<main>`):

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Background } from "./components/Background";
import ThemeToggle from "./components/ThemeToggle";
import { Button } from "./components/ui/button";
import { Loader2Icon } from "lucide-react";
import { useFirstName } from "./hooks/useFirstName";

type UpdateState =
    | { status: "idle" }
    | { status: "checking" }
    | { status: "available"; version: string }
    | { status: "downloading"; version: string; percent: number }
    | { status: "downloaded"; version: string }
    | { status: "up-to-date" }
    | { status: "error"; message: string };

export default function App() {
    const [todoId, setTodoId] = useState("1");
    const [loading, setLoading] = useState<null | "random" | "byId">(null);
    const [boom, setBoom] = useState(false);
    const [version, setVersion] = useState<string>("");
    const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });

    if (boom) throw new Error("Testing the error boundary");
    const busy = loading !== null;

    const parsedId = Number(todoId);
    const idValid = todoId.trim() !== "" && Number.isInteger(parsedId) && parsedId > 0;

    const firstName = useFirstName();

    useEffect(() => {
        window.api.invoke("get-app-version").then((resp) => {
            if (resp.success) setVersion(resp.data);
        });

        const unsubs = [
            window.api.on("update:checking", () => {
                setUpdateState({ status: "checking" });
            }),
            window.api.on("update:available", (_event, data) => {
                setUpdateState({ status: "available", version: data.version });
            }),
            window.api.on("update:not-available", () => {
                setUpdateState({ status: "up-to-date" });
                setTimeout(() => setUpdateState({ status: "idle" }), 4000);
            }),
            window.api.on("update:progress", (_event, data) => {
                setUpdateState((prev) =>
                    prev.status === "downloading"
                        ? { ...prev, percent: data.percent }
                        : prev
                );
            }),
            window.api.on("update:downloaded", (_event, data) => {
                setUpdateState({ status: "downloaded", version: data.version });
            }),
            window.api.on("update:error", (_event, data) => {
                setUpdateState({ status: "error", message: data.message });
            }),
        ];

        return () => unsubs.forEach((unsub) => unsub());
    }, []);

    const handleClickMe = (): void => {
        toast.success("You clicked me!");
    };

    const handleLoadRandom = async (): Promise<void> => {
        setLoading("random");
        try {
            const resp = await window.api.invoke("get-random-todo");
            if (!resp.success) {
                toast.error(resp.error.message);
            } else {
                toast.info(resp.data.todo);
            }
        } finally {
            setLoading(null);
        }
    };

    const handleLoadById = async (): Promise<void> => {
        if (!idValid) {
            toast.warning("Enter a whole number greater than 0.");
            return;
        }
        setLoading("byId");
        try {
            const resp = await window.api.invoke("get-todo-by-id", { id: parsedId });
            if (!resp.success) {
                toast.error(resp.error.message);
            } else {
                toast.info(resp.data.todo);
            }
        } finally {
            setLoading(null);
        }
    };

    const handleOpenChildWindow = async (): Promise<void> => {
        const resp = await window.api.invoke("open-child-window");
        if (!resp.success) {
            toast.error(resp.error.message);
        }
    };

    const handleCheckForUpdates = async (): Promise<void> => {
        setUpdateState({ status: "checking" });
        await window.api.invoke("check-for-updates");
    };

    return (
        <>
            <Background />

            <div className="fixed top-4 right-4 z-10">
                <ThemeToggle />
            </div>

            <main className="relative z-0 flex h-screen flex-col items-center justify-center gap-4">
                <h1 className="font-serif text-3xl font-light text-foreground">
                    Hello, {firstName || "stranger"}
                </h1>

                <div className="flex gap-2">
                    <Button onClick={handleLoadRandom} disabled={busy}>
                        {loading === "random" && <Loader2Icon className="size-4 animate-spin" />}
                        Load a random todo
                    </Button>
                    <Button variant="outline" onClick={handleClickMe} disabled={busy}>
                        Click me!
                    </Button>
                </div>

                <div className="flex items-end gap-2">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="todo-id" className="text-xs text-muted-foreground">
                            Todo ID
                        </label>
                        <input
                            id="todo-id"
                            type="number"
                            min={1}
                            step={1}
                            value={todoId}
                            onChange={(e) => setTodoId(e.target.value)}
                            aria-invalid={!idValid}
                            disabled={busy}
                            className="w-24 rounded border bg-background px-2 py-1 text-foreground"
                        />
                    </div>
                    <Button onClick={handleLoadById} disabled={busy || !idValid}>
                        {loading === "byId" && <Loader2Icon className="size-4 animate-spin" />}
                        Load todo by ID
                    </Button>
                </div>

                <Button variant="secondary" onClick={handleOpenChildWindow}>
                    Open child window
                </Button>
                <Button variant="destructive" onClick={() => setBoom(true)}>
                    Throw an error
                </Button>

                {/* Auto-update section */}
                <div className="flex items-center gap-3 mt-2">
                    {version && (
                        <span className="text-sm text-muted-foreground">v{version}</span>
                    )}
                    {updateState.status === "idle" && (
                        <Button variant="outline" size="sm" onClick={handleCheckForUpdates}>
                            Check for Updates
                        </Button>
                    )}
                    {updateState.status === "checking" && (
                        <Button variant="outline" size="sm" disabled>
                            Checking...
                        </Button>
                    )}
                    {updateState.status === "available" && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                                v{updateState.version} available
                            </span>
                            <Button
                                size="sm"
                                onClick={() => {
                                    setUpdateState({
                                        status: "downloading",
                                        version: updateState.version,
                                        percent: 0,
                                    });
                                    window.api.invoke("download-update");
                                }}
                            >
                                Download
                            </Button>
                        </div>
                    )}
                    {updateState.status === "downloading" && (
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                                Downloading v{updateState.version}... {updateState.percent}%
                            </span>
                            <div className="h-1 w-32 rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-primary transition-all duration-300"
                                    style={{ width: `${updateState.percent}%` }}
                                />
                            </div>
                        </div>
                    )}
                    {updateState.status === "downloaded" && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                v{updateState.version} ready
                            </span>
                            <Button
                                size="sm"
                                onClick={() => window.api.invoke("install-update")}
                            >
                                Restart to Update
                            </Button>
                        </div>
                    )}
                    {updateState.status === "up-to-date" && (
                        <span className="text-sm text-muted-foreground">✓ Up to date</span>
                    )}
                    {updateState.status === "error" && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-destructive">Update failed</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUpdateState({ status: "idle" })}
                            >
                                Try Again
                            </Button>
                        </div>
                    )}
                </div>
            </main>
        </>
    );
}
```

- [ ] **Step 2: Verify typecheck passes**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke-test in dev**

```
npm run dev
```

Expected:
- App opens. Below the existing buttons a version label appears (e.g. `v1.0.0`) followed by a "Check for Updates" button.
- Click "Check for Updates" — button changes to "Checking..." then after a moment to "✓ Up to date" (because `!app.isPackaged` causes `checkForUpdates()` to immediately fire `update:not-available`), then resets to idle after 4 seconds.
- No console errors.

- [ ] **Step 4: Commit**

```
git add src/renderer/src/App.tsx
git commit -m "feat: add update UI to App — Check, Download, Restart flow"
```

---

### Task 4: electron-builder publish config

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: Replace the `publish` block in `electron-builder.yml`**

Find the existing block (currently at the bottom):

```yaml
publish:
    provider: generic
    url: https://example.com/auto-updates
```

Replace it with:

```yaml
publish:
    provider: github
    owner: sandeep-menon
    repo: windows-electron-starter-kit
    private: false
```

- [ ] **Step 2: Verify the build script still works locally**

```
npm run build
```

Expected: typecheck passes and all three bundles are built. No publish action happens because `--publish` is not passed. The `dist/` output is present.

- [ ] **Step 3: Commit**

```
git add electron-builder.yml
git commit -m "feat: switch electron-builder publish to github provider"
```

---

### Task 5: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/` directory and `ci.yml`**

```yaml
name: CI

on:
    push:
        branches: [main]
    pull_request:
        branches: [main]

jobs:
    check:
        runs-on: ubuntu-latest

        steps:
            - uses: actions/checkout@v4

            - uses: actions/setup-node@v4
              with:
                  node-version: 20
                  cache: npm

            - run: npm ci

            - run: npm run lint

            - run: npm run typecheck
```

- [ ] **Step 2: Commit and push to verify**

```
git add .github/workflows/ci.yml
git commit -m "ci: add lint + typecheck workflow on PR and push to main"
git push
```

Expected: the "CI" workflow appears in the repo's Actions tab and the `check` job goes green.

---

### Task 6: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Before starting:** confirm two GitHub Actions secrets exist in the repo settings (*Settings → Secrets and variables → Actions*):
- `GH_TOKEN` — a fine-grained PAT with *Contents: Read and write* permission on this repo. Used by `electron-builder` to create the GitHub Release and upload artifacts.
- `GH_TOKEN_RO` — optional for this public repo (can be left empty or omitted from secrets); required for private forks so the packaged app can authenticate to download `latest.yml`.

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
    push:
        tags:
            - "v*.*.*"

jobs:
    release:
        runs-on: windows-latest
        permissions:
            contents: write

        steps:
            - uses: actions/checkout@v4

            - uses: actions/setup-node@v4
              with:
                  node-version: 20
                  cache: npm

            - run: npm ci

            - name: Build
              run: npm run build
              env:
                  GH_TOKEN_RO: ${{ secrets.GH_TOKEN_RO }}

            - name: Publish
              run: npx electron-builder --win --publish always
              env:
                  GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

- [ ] **Step 2: Commit**

```
git add .github/workflows/release.yml
git commit -m "ci: add tag-triggered Windows release workflow"
```

- [ ] **Step 3: Test with a real tag**

Bump the version in `package.json` (e.g. `"version": "1.0.1"`), commit, tag, and push:

```
git add package.json
git commit -m "chore: bump version to 1.0.1"
git tag v1.0.1
git push && git push --tags
```

Expected: the "Release" workflow triggers in the Actions tab, the `windows-latest` runner builds and packages, and a GitHub Release named `v1.0.1` appears under *Releases* with two assets: `windows-electron-starter-kit-1.0.1-setup.exe` and `latest.yml`.

---

### Task 7: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/index.html`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Auto-Update section to `README.md`**

Insert the following block between the **Logging** section and the **Extending This Starter Kit** section:

````markdown
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
````

- [ ] **Step 2: Add GitHub Actions section to `README.md`**

Insert the following block immediately after the Auto-Update section:

````markdown
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
````

- [ ] **Step 3: Add auto-update feature card to `docs/index.html`**

In the `features-grid` div (which contains six `feature-card` divs), add a seventh card after the last existing one (the "Built to extend" card, which ends with `</div>`):

```html
                    <!-- 7 -->
                    <div class="feature-card">
                        <div class="feature-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                        </div>
                        <p class="feature-title">Auto-Update (VSCode-style)</p>
                        <p class="feature-desc">
                            Check → Download → Restart, all user-initiated. <code style="font-size:12px;color:#aaa;background:var(--surface-2);padding:1px 5px;border-radius:4px;">electron-updater</code> with a GitHub provider, typed <code style="font-size:12px;color:#aaa;background:var(--surface-2);padding:1px 5px;border-radius:4px;">update:*</code> events, and a tag-triggered release workflow. No-op in dev.
                        </p>
                    </div>
```

- [ ] **Step 4: Add "Auto-Update" nav link to `docs/index.html`**

In the `<ul class="nav-links">` block, add a new `<li>` before the GitHub CTA link:

```html
                    <li><a href="#auto-update">Auto-Update</a></li>
```

- [ ] **Step 5: Add auto-update section to `docs/index.html`**

Add the following complete `<section>` block immediately before the closing `</body>` tag (or immediately before the `<footer>` element if one exists):

```html
        <!-- Auto-Update -->
        <section id="auto-update">
            <div class="container">
                <p class="section-label">Auto-Update</p>
                <h2 class="section-title">Ship updates like VSCode.</h2>
                <p class="section-sub">
                    Check → Download → Restart. Three steps, all user-initiated. A tag push is all it takes to ship a new version.
                </p>

                <div style="margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start;">
                    <div>
                        <p style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">How it works</p>
                        <ol style="font-size:14px;color:var(--text-muted);line-height:2;padding-left:20px;">
                            <li>User clicks <strong style="color:var(--text)">Check for Updates</strong></li>
                            <li>Update found → <strong style="color:var(--text)">Download</strong> button appears</li>
                            <li>Progress bar streams download</li>
                            <li>Download done → <strong style="color:var(--text)">Restart to Update</strong></li>
                        </ol>
                        <p style="font-size:13px;color:var(--text-dim);margin-top:16px;">
                            <code style="font-size:12px;color:#aaa;background:var(--surface-2);padding:1px 5px;border-radius:4px;">autoDownload: false</code> and <code style="font-size:12px;color:#aaa;background:var(--surface-2);padding:1px 5px;border-radius:4px;">autoInstallOnAppQuit: false</code> — the user is always in control.
                        </p>
                    </div>

                    <div>
                        <p style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">Shipping a release</p>
                        <div class="code-window">
                            <div class="code-titlebar">
                                <span class="dot dot-r"></span>
                                <span class="dot dot-y"></span>
                                <span class="dot dot-g"></span>
                                <span class="code-titlebar-label">terminal</span>
                            </div>
                            <pre><span class="comment"># bump version in package.json, then:</span>
<span class="cmd">git tag v1.2.0</span>
<span class="cmd">git push && git push --tags</span>
<span class="comment"># release workflow builds + publishes automatically</span></pre>
                        </div>
                    </div>
                </div>

                <div class="callout" style="margin-top:48px;">
                    <div class="callout-text">
                        <p class="callout-title">Self-hosted runner</p>
                        <p class="callout-sub">
                            Need code signing or a private fork? Change <code style="font-size:12px;background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px;">runs-on: windows-latest</code> to <code style="font-size:12px;background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px;">runs-on: [self-hosted, Windows]</code> in <code style="font-size:12px;background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px;">release.yml</code> and register your dev machine as a runner in repo settings. Set <code style="font-size:12px;background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px;">GH_TOKEN</code> and <code style="font-size:12px;background:rgba(255,255,255,0.06);padding:1px 6px;border-radius:4px;">GH_TOKEN_RO</code> as machine-level env vars.
                        </p>
                    </div>
                </div>
            </div>
        </section>
```

- [ ] **Step 6: Update `CLAUDE.md` known issues table**

In the known issues table in `CLAUDE.md`, update issue #15 to note CI is now partially resolved:

Find the row:
```
| 15 | 🟡 Low | No test runner and no CI pipeline. Planned: Vitest unit tests (`redact()`, `fetchWithTimeout`, Zod schemas, `broadcast()` guard) + GitHub Actions running lint/typecheck/build. |
```

Replace with:
```
| 15 | 🟡 Low | No test runner. CI (lint + typecheck via GitHub Actions) is now in place. Remaining: Vitest unit tests (`redact()`, `fetchWithTimeout`, Zod schemas, `broadcast()` guard). |
```

- [ ] **Step 7: Commit**

```
git add README.md docs/index.html CLAUDE.md
git commit -m "docs: add auto-update and GitHub Actions documentation"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `src/main/updater.ts` with initUpdater, checkForUpdates, downloadUpdate, installUpdate | Task 1 |
| `__GH_TOKEN_RO__` Vite define in electron.vite.config.ts | Task 1 |
| GitHub provider, `private: false`, conditional token spread | Task 1 |
| `autoDownload: false`, `autoInstallOnAppQuit: false` | Task 1 |
| 4 new IPC channels in protocol.ts | Task 2 |
| 6 new update events in IPCEvents | Task 2 |
| 4 handlers in handler.ts | Task 2 |
| `initUpdater(mainWindow)` in index.ts | Task 2 |
| `UpdateState` union with `available` state | Task 3 |
| `get-app-version` on mount, version label | Task 3 |
| 6 event subscriptions with cleanup | Task 3 |
| Check → Download → Restart UI | Task 3 |
| Optimistic `downloading` state on Download click | Task 3 |
| `up-to-date` auto-resets after 4 s | Task 3 |
| `electron-builder.yml` github provider | Task 4 |
| `.github/workflows/ci.yml` | Task 5 |
| `.github/workflows/release.yml` tag-triggered | Task 6 |
| `GH_TOKEN_RO` in Build step, `GH_TOKEN` in Publish step | Task 6 |
| `permissions: contents: write` | Task 6 |
| README Auto-Update section | Task 7 |
| README GitHub Actions section with self-hosted runner docs | Task 7 |
| `docs/index.html` feature card | Task 7 |
| `docs/index.html` auto-update section with nav link | Task 7 |
| CLAUDE.md known issues update | Task 7 |

All spec requirements are covered. ✓

**Type consistency check:**

- `checkForUpdates`, `downloadUpdate`, `installUpdate`, `initUpdater` — defined in Task 1, imported in Tasks 2. Names match exactly.
- Channel names: `"check-for-updates"`, `"download-update"`, `"install-update"`, `"get-app-version"` — declared in protocol.ts (Task 2), used in handler.ts (Task 2) and App.tsx (Task 3). Consistent.
- Event names: `"update:checking"`, `"update:available"`, `"update:not-available"`, `"update:progress"`, `"update:downloaded"`, `"update:error"` — declared in IPCEvents (Task 2), subscribed in App.tsx (Task 3), sent in updater.ts (Task 1). Consistent.
- `UpdateState.status` values: `"idle"`, `"checking"`, `"available"`, `"downloading"`, `"downloaded"`, `"up-to-date"`, `"error"` — defined once in Task 3, used only in Task 3. No cross-task type drift possible.
