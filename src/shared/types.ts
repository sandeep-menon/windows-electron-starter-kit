/**
 * Well known error codes returned by main-process handlers.
 * Branch on 'error.code' in the renderer to react per failure type.
 */
export type MainProcessErrorCode = "INVALID_PARAMS"
    | "UNAUTHORIZED_SENDER"
    | "NOT_FOUND"
    | "NETWORK"
    | "UNKNOWN"
    | (string & {});

export interface MainProcessError {
    code: MainProcessErrorCode;
    message: string;
    details?: unknown;
}

/**
 * Result pattern returned by every IPC handler.
 * Narrow on 'success': when 'true', 'data' is present (typed 'T')
 * when 'false', 'error' is present.
 */
export type MainProcessResponse<T = unknown> = 
    | { success: true; data: T }
    | { success: false; error: MainProcessError };

// A todo returned by the dummyjson.com API
export interface Todo {
    id: number;
    todo: string;
    completed: boolean;
    userId: number;
}