import { app } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { createWindow, initializeLogging } from "./utils/application";
import log from "electron-log/main";
import { registerHandlers } from "./handler";
import { getStore } from "./utils/store";
import { initUpdater } from "./updater";
import { redact } from "../shared/redact";

// Every log call in main (and renderer logs forwarded over IPC) passes through this before any
// transport writes it. Registered at module load so nothing logged earlier slips past.
log.hooks.push((message) => ({ ...message, data: message.data.map(redact) }));

app.whenReady().then(() => {
    electronApp.setAppUserModelId("com.smenon.windowselectronstarterkit");

    app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window);
    });

    const cleanup = registerHandlers();

    const mainWindow = createWindow({ entry: "main" });
    initUpdater(mainWindow);

    setImmediate(() => {
        initializeLogging();
        getStore();
    });

    app.on("will-quit", () => {
        log.info("Application quitting...");
        cleanup();
    });
});

app.on("window-all-closed", () => {
    app.quit();
});
