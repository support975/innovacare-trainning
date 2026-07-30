// src/splash/preload.ts
//
// Bridge for the launcher's OWN trusted chrome (splash/picker/lock-overlay
// window) — distinct from src/preload/index.ts, which is the narrow bridge
// handed to the remote, untrusted InnovaClinic content window. Still
// sandboxed and isolated (this window loads only our bundled index.html,
// but "our own code" is not a reason to relax contextIsolation/sandbox).
import { contextBridge, ipcRenderer } from 'electron';
import { CHROME_IPC_EVENTS } from '../main/ipc/schemas';
import type { KnownEnvironment, SplashErrorPayload, SplashStatusUpdate } from '../shared/types';

export interface ChromeInitResult {
  knownEnvironments: KnownEnvironment[];
  lastSelectedEnvId: string | null;
  autoSelectedEnvId: string | null;
}

const innovaLauncherChrome = {
  init: (): Promise<ChromeInitResult> => ipcRenderer.invoke('chrome:init'),

  selectEnvironment: (envId: string): Promise<void> =>
    ipcRenderer.invoke('chrome:select-environment', { envId }),

  unlock: (): Promise<void> => ipcRenderer.invoke('chrome:unlock'),

  cancel: (): Promise<void> => ipcRenderer.invoke('chrome:cancel'),

  onStatus: (callback: (update: SplashStatusUpdate) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, update: SplashStatusUpdate) => callback(update);
    ipcRenderer.on(CHROME_IPC_EVENTS.status, listener);
    return () => ipcRenderer.removeListener(CHROME_IPC_EVENTS.status, listener);
  },

  onError: (callback: (error: SplashErrorPayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: SplashErrorPayload) => callback(error);
    ipcRenderer.on(CHROME_IPC_EVENTS.error, listener);
    return () => ipcRenderer.removeListener(CHROME_IPC_EVENTS.error, listener);
  },

  onLocked: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on(CHROME_IPC_EVENTS.locked, listener);
    return () => ipcRenderer.removeListener(CHROME_IPC_EVENTS.locked, listener);
  }
};

export type InnovaLauncherChromeApi = typeof innovaLauncherChrome;

contextBridge.exposeInMainWorld('innovaLauncherChrome', innovaLauncherChrome);
