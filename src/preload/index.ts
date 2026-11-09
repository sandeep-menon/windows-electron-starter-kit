import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import log from "electron-log/renderer";
import { redact } from "../shared/redact";

// Set by main via webPreferences.additionalArguments when launched with --debug (or in dev)
const DEBUG = process.argv.includes("--debug");

const loggingIPC = {
    async invoke(channel, ...args) {
        if (DEBUG) log.info(`[renderer → main] (request): '${channel}' → `, ...args.map(redact));
        try {
            const result = await ipcRenderer.invoke(channel, ...args);
            if (DEBUG) log.info(`[main → renderer] (response): '${channel}' → `, redact(result));
            return result;
        } catch (error) {
            log.error(`[main → renderer] (error): '${channel}' → `, redact(error));
            throw error;
        }
    },
    on(channel, callback) {
        const wrapperCallback = (event, ...args): void => {
            if (DEBUG) log.info(`[main → renderer] (event): '${channel}' → `, ...args.map(redact));
            callback(event, ...args);
        };
        ipcRenderer.on(channel, wrapperCallback);
        return () => {
            if (DEBUG) log.info(`[preload] Removing listener: '${channel}'`);
            ipcRenderer.removeListener(channel, wrapperCallback);
        };
    }
};

const rendererLog = {
    error: (message: string, ...args: unknown[]) => log.error(message, ...args.map(redact)),
    warn: (message: string, ...args: unknown[]) => log.warn(message, ...args.map(redact)),
    info: (message: string, ...args: unknown[]) => log.info(message, ...args.map(redact))
};

const api = {
    invoke: loggingIPC.invoke,
    on: loggingIPC.on,
    log: rendererLog
};

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