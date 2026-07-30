// src/preload/index.ts
//
// Runs with contextIsolation + sandbox on, so this is the ONLY place code
// running as the remote Angular app can ever reach into Node/Electron. The
// bridge is intentionally narrow and explicitly enumerated — no
// `invoke(channel, args)` passthrough — so the attack surface exposed to a
// compromised or malicious page is exactly these eight calls, each with a
// fixed shape, and nothing else.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_EVENTS } from '../main/ipc/schemas';
import type {
  AuditEvent,
  DeviceInfo,
  RendererEnvironmentInfo
} from '../shared/types';
import type { PrintDocumentPayload } from '../main/ipc/schemas';

export interface InnovaNativeApi {
  getEnvironment: () => Promise<RendererEnvironmentInfo>;
  printDocument: (payload: PrintDocumentPayload) => Promise<void>;
  scanBadge: () => Promise<{ badgeId: string }>;
  getDeviceInfo: () => Promise<DeviceInfo>;
  onIdleWarning: (callback: (secondsRemaining: number) => void) => () => void;
  extendSession: () => Promise<void>;
  writeAuditEvent: (event: AuditEvent) => Promise<void>;
}

const innovaNative: InnovaNativeApi = {
  getEnvironment: () => ipcRenderer.invoke('env:get'),

  printDocument: (payload) => ipcRenderer.invoke('print:document', payload),

  scanBadge: () => ipcRenderer.invoke('badge:scan'),

  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),

  onIdleWarning: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, secondsRemaining: number) =>
      callback(secondsRemaining);
    ipcRenderer.on(IPC_EVENTS.idleWarning, listener);
    // Every subscription returns its own teardown so the Angular
    // HttpInterceptor/component that subscribed can unsubscribe on destroy
    // instead of accumulating duplicate listeners across navigations.
    return () => ipcRenderer.removeListener(IPC_EVENTS.idleWarning, listener);
  },

  extendSession: () => ipcRenderer.invoke('session:extend'),

  writeAuditEvent: (event) => ipcRenderer.invoke('audit:write-event', event)
};

contextBridge.exposeInMainWorld('innovaNative', innovaNative);
