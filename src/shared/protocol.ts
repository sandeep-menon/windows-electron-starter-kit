import { z } from "zod";
import { MainProcessResponse } from "./types";

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
} as const;

export type IPCChannel = keyof typeof IPCParamSchemas;

/**
 * The typed request/response contract, derived from 'IPCParamSchemas'.
 * 'params' is inferred from each channel's schema; 'returns' is the shared response shape.
 */
export type IPCInvocations = {
    [K in IPCChannel]: {
        params: z.infer<(typeof IPCParamSchemas)[K]>;
        returns: MainProcessResponse;
    }
}

/**
 * Main → Renderer events
 */
export interface IPCEvents {
    // Add event channels here...
}

export type IPCEventChannel = keyof IPCEvents;