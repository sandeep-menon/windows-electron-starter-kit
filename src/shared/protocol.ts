import { z } from "zod";
import { MainProcessResponse, Todo } from "./types";

/**
 * Renderer → Main invocations (request/response)
 * 
 * Each channel's params are declared once, as a Zod schema - the single source of truth.
 * - The compile-time type is inferred from the schema (see 'IPCInvocations' below)
 * - The same schema is used by 'registerHandlers()' to validate params at runtime.
 * 
 * Add a channel here and you get end-to-end type-checking AND runtime validation for free
 * Use 'z.void()' for channels that take no params.
 */
export const IPCParamSchemas = {
    "get-random-todo": z.void(),
    "get-todo-by-id": z.object({ id: z.number().int().positive() }),
    "open-child-window": z.void(),
} as const;

export type IPCChannel = keyof typeof IPCParamSchemas;

/**
 * Per channel response data - the 'T' in 'MainProcessResponse<T>' for each channel
 * 
 * extends 'Record<IPCChannel, unknown>' forces this map to cover every cahnnel:
 * add a channel to 'IPCParamSchemas' and the compiler makes you declare its 
 * response-data type here too. Use the data shape your handler resolves with on success.
 */
export interface IPCResponseData extends Record<IPCChannel, unknown> {
    "get-random-todo": Todo,
    "get-todo-by-id": Todo,
    "open-child-window": void,
}

/**
 * The typed request/response contract, derived from 'IPCParamSchemas'.
 * 'params' is inferred from each channel's schema; 'returns' wraps each channel's
 * data type from IPCResponseData
 */
export type IPCInvocations = {
    [K in IPCChannel]: {
        params: z.infer<(typeof IPCParamSchemas)[K]>;
        returns: MainProcessResponse<IPCResponseData[K]>;
    }
}

/**
 * Main → Renderer events
 */
export interface IPCEvents {
    // Add event channels here...
}

export type IPCEventChannel = keyof IPCEvents;