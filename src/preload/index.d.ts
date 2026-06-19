import { ElectronAPI } from "@electron-toolkit/preload";
import { IPCChannel, IPCInvocations, IPCEventChannel, IPCEvents } from "../shared/protocol";

declare global {
    interface Window {
        electron: ElectronAPI;
        api: {
            /**
             * Invoke an IPC handler in the main process
             * @param channel - The IPC channel name
             * @param params - Parameters for the handler (if any)
             * @returns Promise with the handler's return value
             */

            invoke<K extends IPCChannel>(
                channel: K,
                ...params: IPCInvocations[K]["params"] extends void
                    ? []
                    : [IPCInvocations[K]["params"]]
            ): Promise<IPCInvocations[K]["returns"]>;

            /**
             * Subscribe to an event from the main process.
             * @returns an unsubscribe function - call it (e.g. in a useEffect cleanup)
             * to remove the listener.
             */
            on<K extends IPCEventChannel>(
                channel: K,
                callback: (event: any, data: IPCEvents[K]) => void
            ): () => void;

            /**
             * Forward a log entry to the main-process log file (args are redacted).
             * Used by the global error handlers; available for intentional logging too.
             */
            log: {
                error(message: string, ...args: unknown[]): void;
                warn(message: string, ...args: unknown[]): void;
                info(message: string, ...args: unknown[]): void;
            };
        };
    }
}
