import { ipcMain } from "electron";
import log from "electron-log";
import { is } from "@electron-toolkit/utils";
import { IPCParamSchemas, type IPCChannel, type IPCInvocations } from "../shared/protocol";
import type { MainProcessResponse, Todo } from "../shared/types";

async function getRandomTodo(): Promise<MainProcessResponse<Todo>> {
    try {
        const response = await fetch("https://dummyjson.com/todos/random");
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
        }
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
        const response = await fetch(`https://dummyjson.com/todos/${id}`);
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
    ) => Promise<IPCInvocations[K]["returns"]> | IPCInvocations[K]["returns"]
} = {
    "get-random-todo": async (_event, _params) => getRandomTodo(),
    "get-todo-by-id": async (_event, params) => getTodoById(params.id),
}

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
        return protocol === "file:";
    } catch {
        return false;
    }
}

export const registerHandlers = () => {
    for (const channel of Object.keys(handlers) as IPCChannel[]) {
        ipcMain.handle(channel, async (event, rawParams): Promise<MainProcessResponse> => {
            // Sender validation - reject anything not from our own renderer.
            if (!isTrustedSender(event)) {
                log.warn(`[ipc] Rejected '${channel}' from untrusted sender ${event.senderFrame?.url}`);
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
    }
}