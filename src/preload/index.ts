import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import log from 'electron-log'

const LoggingIPCWrapper = () => {
  const invokeWithLogging = async (channel, ...args) => {
    log.info(`[renderer → main] (request): '${channel}' → `, ...args);
    try {
      const result = await ipcRenderer.invoke(channel, ...args);
      log.info(`[main → renderer] (response): '${channel}' → `, result);
      return result;
    } catch (error) {
      log.error(`[main → renderer] (error): '${channel}' → `, error);
      throw error;
    }
  }

  const onWithLogging = (channel, callback) => {
    const wrapperCallback = (event, ...args) => {
      log.info(`[main → renderer] (event): '${channel}' → `, ...args);
      callback(event, ...args);
    }
    ipcRenderer.on(channel, wrapperCallback);
    return wrapperCallback;
  }

  const offWithLogging = (channel, callback) => {
    log.info(`[preload] Removing listener: '${channel}'`);
    ipcRenderer.removeListener(channel, callback);
  }

  return {
    invoke: invokeWithLogging,
    on: onWithLogging,
    removeListener: offWithLogging
  }
}

const loggingIPC = LoggingIPCWrapper();

// Custom APIs for renderer
const api = {
  invoke: loggingIPC.invoke,
  on: loggingIPC.on,
  removeListener: loggingIPC.removeListener
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
