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
