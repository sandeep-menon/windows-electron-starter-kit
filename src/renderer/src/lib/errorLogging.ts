export function globalErrorLogging(): void {
    window.addEventListener("error", (event) => {
        const error = event.error;
        window.api.log.error(
            `[renderer] Uncaught error: ${event.message}`,
            error instanceof Error
                ? { stack: error.stack }
                : { filename: event.filename, line: event.lineno, column: event.colno }
        );
    });

    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        window.api.log.error(
            `[renderer] Unhandled promise rejection: ${message}`,
            reason instanceof Error ? { stack: reason.stack } : { reason: String(reason) }
        );
    });
}