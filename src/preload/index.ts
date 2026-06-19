import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import log from "electron-log/renderer";

const SENSITIVE_KEYS = [
    "password",
    "token",
    "secret",
    "authorization",
    "apikey",
    "accesstoken",
    "personalaccesstoken",
    "pat",
    "refreshtoken",
    "cookie"
];

const redact = (value: any): any => {
    if (Array.isArray(value)) {
        return value.map(redact);
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, val]) => {
                // Normalize (drop separators) + substring match so prefixed/snake_case/
                // kebab-case variants are caught too: access_token, x-api-key, client_secret...
                // Deliberately broad - over-redacting a log is safer than leaking a secret.
                const norm = key.toLowerCase().replace(/[_-]/g, "");
                return SENSITIVE_KEYS.some((k) => norm.includes(k))
                    ? [key, "[REDACTED]"]
                    : [key, redact(val)];
            })
        );
    }
    return value;
};

const LoggingIPCWrapper = () => {
    const invokeWithLogging = async (channel, ...args) => {
        log.info(`[renderer → main] (request): '${channel}' → `, ...args.map(redact));
        try {
            const result = await ipcRenderer.invoke(channel, ...args);
            log.info(`[main → renderer] (response): '${channel}' → `, redact(result));
            return result;
        } catch (error) {
            log.error(`[main → renderer] (error): '${channel}' → `, error);
            throw error;
        }
    };

    const onWithLogging = (channel, callback) => {
        const wrapperCallback = (event, ...args) => {
            log.info(`[main → renderer] (event): '${channel}' → `, ...args.map(redact));
            callback(event, ...args);
        };
        ipcRenderer.on(channel, wrapperCallback);
        return () => {
            log.info(`[preload] Removing listener: '${channel}'`);
            ipcRenderer.removeListener(channel, wrapperCallback);
        };
    };

    return {
        invoke: invokeWithLogging,
        on: onWithLogging
    };
};

const rendererLog = {
    error: (message: string, ...args: unknown[]) => log.error(message, ...args.map(redact)),
    warn: (message: string, ...args: unknown[]) => log.warn(message, ...args.map(redact)),
    info: (message: string, ...args: unknown[]) => log.info(message, ...args.map(redact))
};

const loggingIPC = LoggingIPCWrapper();

// Custom APIs for renderer
const api = {
    invoke: loggingIPC.invoke,
    on: loggingIPC.on,
    log: rendererLog
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld("electron", electronAPI);
        contextBridge.exposeInMainWorld("api", api);
    } catch (error) {
        console.error(error);
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI;
    // @ts-ignore (define in dts)
    window.api = api;
}
