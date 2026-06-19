import { app } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { createWindow, initializeLogging } from "./utils/application";
import log from "electron-log/main";
import { registerHandlers } from "./handler";
import { getStore } from "./utils/store";

app.whenReady().then(() => {
    electronApp.setAppUserModelId("com.smenon.windowselectronstarterkit");

    app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window);
    });

    const cleanup = registerHandlers();

    createWindow({ entry: "main" });

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
