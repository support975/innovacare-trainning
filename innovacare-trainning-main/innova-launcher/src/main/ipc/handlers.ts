// src/main/ipc/handlers.ts
//
// Registers exactly the channels enumerated in schemas.ts — nothing else is
// ever wired to `ipcMain.handle`, so a renderer invoking an unlisted
// channel gets Electron's own "no handler registered" rejection rather than
// a generic passthrough. Every payload is parsed with its Zod schema before
// the implementation function ever sees it.
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserWindow, app, ipcMain } from 'electron';
import type { AuditLogger } from '../audit-log';
import type { IdleLockManager } from '../idle-lock';
import { IPC_CHANNELS, IpcChannel, PrintDocumentPayload } from './schemas';
import type { DeviceInfo, EnvironmentManifest, RendererEnvironmentInfo } from '../../shared/types';

export interface IpcHandlerDeps {
  getManifest: () => EnvironmentManifest;
  auditLogger: AuditLogger;
  idleLockManager: IdleLockManager;
  userDataDir: string;
}

let cachedWorkstationId: string | null = null;

async function getOrCreateWorkstationId(userDataDir: string): Promise<string> {
  if (cachedWorkstationId) {
    return cachedWorkstationId;
  }
  const filePath = path.join(userDataDir, 'workstation-id.json');
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(contents) as { workstationId: string };
    cachedWorkstationId = parsed.workstationId;
    return cachedWorkstationId;
  } catch {
    const workstationId = randomUUID();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ workstationId }), 'utf8');
    cachedWorkstationId = workstationId;
    return workstationId;
  }
}

/**
 * Prints via an offscreen BrowserWindow loaded with the caller-supplied HTML
 * (never a URL — printDocument never fetches anything, closing off the
 * "print a local/internal URL as an exfiltration vector" path).
 */
async function printDocument(payload: PrintDocumentPayload, defaultPrinter?: string): Promise<void> {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  try {
    const encoded = Buffer.from(payload.html, 'utf8').toString('base64');
    await printWindow.loadURL(`data:text/html;charset=utf-8;base64,${encoded}`);
    await new Promise<void>((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: payload.printerName ?? defaultPrinter ?? '',
          copies: payload.copies
        },
        (success, failureReason) => {
          if (success) {
            resolve();
          } else {
            reject(new Error(failureReason || 'Print failed'));
          }
        }
      );
    });
  } finally {
    printWindow.destroy();
  }
}

/**
 * HID badge-reader integration is hardware/vendor-specific (clinical badge
 * readers span multiple HID profiles and OS driver models) and is
 * deliberately NOT implemented in this scaffold — see README "Remaining
 * Work". This throws a clear, typed error rather than silently resolving
 * with fake data.
 */
async function scanBadge(): Promise<never> {
  throw new Error(
    'Badge scanning is not implemented in this build. Wire a vendor HID SDK into scanBadge() in ipc/handlers.ts.'
  );
}

export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const implementations: { [K in IpcChannel]: (arg: unknown) => Promise<unknown> } = {
    'env:get': async (): Promise<RendererEnvironmentInfo> => {
      const manifest = deps.getManifest();
      return {
        envId: manifest.envId,
        displayName: manifest.displayName,
        tier: manifest.tier,
        featureFlags: manifest.featureFlags
      };
    },
    'device:get-info': async (): Promise<DeviceInfo> => ({
      workstationId: await getOrCreateWorkstationId(deps.userDataDir),
      osVersion: `${os.type()} ${os.release()}`,
      clientVersion: app.getVersion()
    }),
    'print:document': async (arg) => {
      const payload = arg as PrintDocumentPayload;
      await printDocument(payload);
      await deps.auditLogger.log({ type: 'print', detail: { documentTitle: payload.documentTitle } });
      return null;
    },
    'badge:scan': async () => {
      const badgeId = await scanBadge();
      return { badgeId };
    },
    'session:extend': async () => {
      deps.idleLockManager.extendSession();
      return null;
    },
    'audit:write-event': async (arg) => {
      await deps.auditLogger.log(arg as { type: never; detail?: never });
      return null;
    }
  };

  for (const channel of Object.keys(IPC_CHANNELS) as IpcChannel[]) {
    const schema = IPC_CHANNELS[channel];
    ipcMain.handle(channel, async (_event, arg: unknown) => {
      const parsed = schema.parse(arg);
      return implementations[channel](parsed);
    });
  }
}
