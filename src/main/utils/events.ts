import { BrowserWindow } from "electron";
import type { IPCEventChannel, IPCEvents } from "../../shared/protocol";

export function broadcast<K extends IPCEventChannel>(channel: K, data: IPCEvents[K]): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
        window.webContents.send(channel, data);
    }
}