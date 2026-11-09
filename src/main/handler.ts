import { BrowserWindow, ipcMain, app, net } from "electron";
import { checkForUpdates, downloadUpdate, installUpdate } from "./updater";
import log from "electron-log";
import { is } from "@electron-toolkit/utils";
import { IPCParamSchemas, type IPCChannel, type IPCInvocations } from "../shared/protocol";
import type { MainProcessResponse, Todo } from "../shared/types";
import { createWindow } from "./utils/application";
import { getStore } from "./utils/store";
import { broadcast } from "./utils/events";

const TRUSTED_PROTOCOLS = ["file:"];

function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
    // Electron net.fetch (Chromium network stack), NOT Node's global fetch: it honours the
    // Windows system proxy / PAC and the OS certificate store. Node's fetch connects directly
    // and times out on corporate networks that require a proxy.
    return net.fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

async function getRandomTodo(): Promise<MainProcessResponse<Todo>> {
    try {
        const response = await fetchWithTimeout("https://dummyjson.com/todos/random");
        if (!response.ok) {
            return {
                success: false,
                error: {
                    code: "NETWORK",
                    message: `Random Todo could not be loaded (status ${response.status})`
                }
            };
        }
        const result = (await response.json()) as Todo;
        return {
            success: true,
            data: result
        };
    } catch (error) {
        log.error(`Failed at getRandomTodo(): ${error}`);
        return {
            success: false,
            error: {
                code: "NETWORK",
                message: error instanceof Error ? error.message : String(error)
            }
        };
    }
}

async function getTodoById(id: number): Promise<MainProcessResponse<Todo>> {
    try {
        const response = await fetchWithTimeout(`https://dummyjson.com/todos/${id}`);
        if (!response.ok) {
            return {
                success: false,
                error: {
                    code: response.status === 404 ? "NOT_FOUND" : "NETWORK",
                    message: `Todo ${id} could not be loaded (status ${response.status})`
                }
            };
        }
        const result = (await response.json()) as Todo;
        return {
            success: true,
            data: result
        };
    } catch (error) {
        log.error(`Failed at getTodoById(${id}): ${error}`);
        return {
            success: false,
            error: {
                code: "NETWORK",
                message: error instanceof Error ? error.message : String(error)
            }
        };
    }
}

const handlers: {
    [K in IPCChannel]: (
        event: Electron.IpcMainInvokeEvent,
        params: IPCInvocations[K]["params"]
    ) => Promise<IPCInvocations[K]["returns"]> | IPCInvocations[K]["returns"];
} = {
    "get-random-todo": async () => getRandomTodo(),
    "get-todo-by-id": async (_event, params) => getTodoById(params.id),
    "open-child-window": async (event) => {
        try {
            const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
            createWindow({ entry: "child", parent });
            return { success: true, data: undefined };
        } catch (error) {
            log.error(`Failed to open child window: ${error}`);
            return {
                success: false,
                error: {
                    code: "UNKNOWN",
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
    },
    "set-first-name": async (_event, params) => {
        try {
            getStore().set("firstName", params.firstName);
            broadcast("first-name-changed", params.firstName);
            return { success: true, data: undefined };
        } catch (error) {
            log.error(`Failed to persist first name: ${error}`);
            return {
                success: false,
                error: {
                    code: "UNKNOWN",
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
    },
    "get-first-name": async () => {
        try {
            return { success: true, data: getStore().get("firstName", "") };
        } catch (error) {
            log.error(`Failed to read first name: ${error}`);
            return {
                success: false,
                error: {
                    code: "UNKNOWN",
                    message: error instanceof Error ? error.message : String(error)
                }
            };
        }
    },
    "check-for-updates": () => {
        checkForUpdates();
        return { success: true, data: undefined };
    },
    "download-update": () => {
        downloadUpdate();
        return { success: true, data: undefined };
    },
    "install-update": () => {
        installUpdate();
        return { success: true, data: undefined };
    },
    "get-app-version": () => ({
        success: true,
        data: app.getVersion()
    })
};

/**
 * Verify an IPC message originated from our own renderer,
 * not from untrusted content that may have been loaded into a frame.
 */
function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
    const url = event.senderFrame?.url;
    if (!url) return false;
    try {
        const { protocol, origin } = new URL(url);
        if (is.dev) {
            const devUrl = process.env["ELECTRON_RENDERER_URL"];
            return !!devUrl && origin === new URL(devUrl).origin;
        }
        return TRUSTED_PROTOCOLS.includes(protocol);
    } catch {
        return false;
    }
}

export const registerHandlers = () => {
    for (const channel of Object.keys(handlers) as IPCChannel[]) {
        ipcMain.handle(channel, async (event, rawParams): Promise<MainProcessResponse> => {
            // Sender validation - reject anything not from our own renderer.
            if (!isTrustedSender(event)) {
                log.warn(
                    `[ipc] Rejected '${channel}' from untrusted sender ${event.senderFrame?.url}`
                );
                return {
                    success: false,
                    error: { code: "UNAUTHORIZED_SENDER", message: "Unauthorized sender" }
                };
            }

            // Runtime param validation against the channel's schema (single source of truth).
            const parsed = IPCParamSchemas[channel].safeParse(rawParams);
            if (!parsed.success) {
                log.warn(`[ipc] Invalid params for '${channel}': ${parsed.error.message}`);
                return {
                    success: false,
                    error: {
                        code: "INVALID_PARAMS",
                        message: `Invalid params for '${channel}'`,
                        details: parsed.error.issues
                    }
                };
            }

            // Dispatch to the typed handler with the validated params.
            const handler = handlers[channel] as (
                event: Electron.IpcMainInvokeEvent,
                params: unknown
            ) => Promise<MainProcessResponse>;

            return handler(event, parsed.data);
        });
    }

    return () => {
        for (const channel of Object.keys(handlers)) {
            ipcMain.removeHandler(channel);
        }
    };
};
