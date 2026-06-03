import { app } from "electron";
import path from "path";
import fs from "fs";
import log from "electron-log";
import os from "os";

export function isLoggingEnabled() {
    // return true;
    return (process.argv.includes("--enable-logging"));
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

export function initializeLogging() {
    const logFileName = generateLogFileName();
    const logDir = path.join(app.getPath("userData"), "logs");
    const logFilePath = path.join(logDir, logFileName);
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(logFilePath, "");
    log.transports.file.resolvePathFn = () => logFilePath;
    log.info("Application launched with logging...");
    const envInfo = getEnvironmentInfo();
    log.info("Environment:");
    log.info(envInfo);
}