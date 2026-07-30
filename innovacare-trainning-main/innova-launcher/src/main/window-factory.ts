// src/main/window-factory.ts
//
// Constructs the two windows the launcher ever opens: the splash/picker
// window and the single hardened main content window. Every BrowserWindow
// in this app is created here so the security-relevant webPreferences never
// have a second, drifted copy elsewhere.
import path from 'node:path';
import { BrowserWindow, Menu, app } from 'electron';
import type { EnvironmentManifest } from '../shared/types';

const DIST_DIR = path.join(__dirname, '..');

export function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: !app.isPackaged,
      preload: path.join(DIST_DIR, 'splash', 'preload.js')
    }
  });

  win.once('ready-to-show', () => win.show());
  void win.loadFile(path.join(DIST_DIR, 'splash', 'index.html'));
  return win;
}

/**
 * Covers the main window when the idle lock engages. A separate window
 * (not a renderer-drawn overlay in the InnovaClinic page itself) so the
 * lock cannot be bypassed by anything running inside the remote content —
 * dismissing it always goes through the launcher's own chrome:unlock IPC
 * handler, never through page JS.
 */
export function createLockOverlayWindow(parent: BrowserWindow): BrowserWindow {
  const bounds = parent.getBounds();
  const win = new BrowserWindow({
    ...bounds,
    parent,
    modal: process.platform !== 'darwin',
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: !app.isPackaged,
      preload: path.join(DIST_DIR, 'splash', 'preload.js')
    }
  });

  win.once('ready-to-show', () => win.show());
  void win.loadFile(path.join(DIST_DIR, 'splash', 'index.html'), { query: { mode: 'lock' } });
  return win;
}

export interface MainWindowOptions {
  manifest: EnvironmentManifest;
  preloadPath?: string;
  showSupportMenu: boolean;
}

const TIER_BORDER_COLOR: Record<EnvironmentManifest['tier'], string | null> = {
  production: null,
  train: '#f5a623', // amber
  test: '#d0021b' // red
};

/**
 * Hardened BrowserWindow config — intentionally exactly the shape called
 * for by the security spec (nodeIntegration off, contextIsolation +
 * sandbox on, no experimental features, everything gated behind the
 * enumerated preload bridge). Do not add fields here without updating the
 * security checklist in README.md.
 */
export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: !app.isPackaged,
      preload: options.preloadPath ?? path.join(DIST_DIR, 'preload', 'index.js')
    }
  });

  applyTierBorder(win, options.manifest.tier);
  applyApplicationMenu(options.showSupportMenu);

  return win;
}

/**
 * Adds a persistent colored top border for non-production tiers via a CSS
 * pseudo-element (not a DOM node), so it survives every Angular re-render
 * without the launcher needing to touch the page's DOM tree.
 */
function applyTierBorder(win: BrowserWindow, tier: EnvironmentManifest['tier']): void {
  const color = TIER_BORDER_COLOR[tier];
  if (!color) {
    return;
  }
  win.webContents.on('did-finish-load', () => {
    void win.webContents.insertCSS(`
      html::before {
        content: '';
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 6px;
        background: ${color};
        z-index: 2147483647;
        pointer-events: none;
      }
    `);
  });
}

/**
 * Production ships with no application menu at all. A minimal
 * Reload/Zoom/Quit menu is only ever attached when the manifest's support
 * flag explicitly enables it, so field support staff get it without
 * exposing it to every clinician by default.
 */
function applyApplicationMenu(showSupportMenu: boolean): void {
  if (!app.isPackaged || showSupportMenu) {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Support',
        submenu: [
          { role: 'reload' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    Menu.setApplicationMenu(null);
  }
}
