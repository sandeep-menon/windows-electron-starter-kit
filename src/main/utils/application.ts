import { app } from "electron";
import path, { join } from "path";
import fs from "fs";
import log from "electron-log/main";
import os from "os";
import { is } from "@electron-toolkit/utils";
import { BrowserWindow } from "electron/main";
import icon from "../../../resources/icon.png?asset"
import { shell } from "electron/common";
export type AppEntry = "main" | "child";

const MAX_LOG_FILES = 5;

function isVerboseLogging() {
    return is.dev || process.argv.includes("--enable-logging");
}

export function generateTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}_${date.getTime()}`;
}

export function generateLogFileName() {
    return `app_${generateTimestamp()}.log`;
}

function getEnvironmentInfo() {
    const info = {
        app: {
            name: app.getName(),
            version: app.getVersion(),
            isPackaged: app.isPackaged
        },
        runtime: {
            electron: process.versions.electron,
            chromium: process.versions.chrome,
            node: process.versions.node,
            v8: process.versions.v8,
            openssl: process.versions.openssl,
            uv: process.versions.uv,
            zlib: process.versions.zlib
        },
        os: {
            platform: process.platform,
            arch: process.arch,
            type: os.type(),
            release: os.release(),
            version: os.version(),
            hostname: os.hostname()
        },
        process: {
            pid: process.pid,
            ppid: process.ppid,
            execPath: process.execPath,
            cwd: process.cwd(),
            argv: process.argv
        },
        paths: {
            userData: app.getPath("userData"),
            appData: app.getPath("appData"),
            home: app.getPath("home"),
            temp: app.getPath("temp"),
            logs: app.getPath("logs")
        },
        env: {
            NODE_ENV: process.env.NODE_ENV,
            ELECTRON_RENDERER_URL: process.env.ELECTRON_RENDERER_URL,
            REMOTE_DEBUGGING_PORT: process.env.REMOTE_DEBUGGING_PORT
        }
    }

    return info;
}

function cleanupOldLogs(logDir: string) {
    const files = fs.readdirSync(logDir)
        .filter((file) => file.startsWith("app_") && file.endsWith(".log"))
        .map((file) => ({
            name: file,
            time: fs.statSync(path.join(logDir, file)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);
    for (const file of files.slice(MAX_LOG_FILES)) {
        fs.rmSync(path.join(logDir, file.name), { force: true });
    }
}

export function initializeLogging() {
    const logFileName = generateLogFileName();
    const logDir = path.join(app.getPath("userData"), "logs");
    const logFilePath = path.join(logDir, logFileName);
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(logFilePath, "");
    cleanupOldLogs(logDir);
    log.transports.file.resolvePathFn = () => logFilePath;
    const level = isVerboseLogging() ? "silly" : "info";
    log.transports.file.level = level;
    log.transports.console.level = level;
    log.initialize();
    log.errorHandler.startCatching();
    log.info("Application launched with logging...");
    const envInfo = getEnvironmentInfo();
    log.info("Environment:");
    log.info(envInfo);
}

export function createWindow({ entry, parent }: { entry: AppEntry; parent?: BrowserWindow }): BrowserWindow {
    const window = new BrowserWindow({
        width: 900,
        height: 670,
        minWidth: 900,
        minHeight: 670,
        show: false,
        autoHideMenuBar: true,
        parent,
        modal: Boolean(parent),
        ...(process.platform === "win32" ? { icon }: {}),
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    window.on("ready-to-show", () => {
        window.show();
    });

    window.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
    });

    // 'entry' rides along as a URL hash (#main, #child) so the renderer can
    // pick its root component synchronously, before React mounts - no flash
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#${entry}`);
    } else {
        window.loadFile(join(__dirname, "../renderer/index.html"), { hash: entry });
    }

    return window;
}