import { ipcMain } from "electron";
import log from "electron-log";
import type { IPCChannel, IPCInvocations } from "../shared/protocol";

async function getRandomTodo() {
    try {
        const response = await fetch("https://dummyjson.com/todos/random");
        const result = await response.json();
        return {
            success: true,
            data: result
        }
    } catch (error) {
        log.error(`Failed at getRandomTodo(): ${error}`);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }
    }
}

async function getTodoById(id: number) {
    try {
        const response = await fetch(`https://dummyjson.com/todos/${id}`);
        if (!response.ok) {
            throw new Error(`Todo ${id} not found (status ${response.status})`);
        }
        const result = await response.json();
        return {
            success: true,
            data: result
        }
    } catch (error) {
        log.error(`Failed at getTodoById(${id}): ${error}`);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }
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

export const registerHandlers = () => {
    for (const [channel, handler] of Object.entries(handlers)) {
        ipcMain.handle(channel, handler);
    }

    return () => {
        for (const channel of Object.keys(handlers)) {
            ipcMain.removeHandler(channel);
        }
    }
}