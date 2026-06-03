import { MainProcessResponse } from "./types"


/**
 * Renderer → Main invocations (request/response)
 */
export interface IPCInvocations {
    "get-random-todo": { params: void, returns: MainProcessResponse },
    "get-todo-by-id": { params: { id: number }, returns: MainProcessResponse },
}

/**
 * Main → Renderer events
 */
export interface IPCEvents {
    // Add event channels here...
}

export type IPCChannel = keyof IPCInvocations;
export type IPCEventChannel = keyof IPCEvents;