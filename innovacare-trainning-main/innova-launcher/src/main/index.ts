// src/main/index.ts
//
// Application entry point. Owns the boot sequence: single-instance lock ->
// splash/picker -> signed manifest -> min-version gate -> OIDC login ->
// hardened main window -> idle-lock/audit wiring. Every step that can fail
// reports through sendError() with a copyable code + correlation ID, never
// a raw stack trace, per the splash window's hard-fail UX requirement.
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, crashReporter, ipcMain, session, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { AuditLogger } from './audit-log';
import * as oidc from './auth/oidc-client';
import { TokenStore } from './auth/token-store';
import { IdleLockManager } from './idle-lock';
import { CHROME_IPC_CHANNELS, CHROME_IPC_EVENTS, ChromeIpcChannel, IPC_EVENTS } from './ipc/schemas';
import { registerIpcHandlers } from './ipc/handlers';
import { KNOWN_ENVIRONMENTS, ManifestService, ManifestUnavailableError, ManifestValidationError } from './manifest-service';
import { ManifestSignatureError } from './signature';
import {
  applyCertificatePinning,
  applyContentSecurityPolicy,
  applyDevToolsLock,
  applyNavigationGuards,
  applyPermissionHandler,
  applyRejectInvalidCertificates
} from './security-policy';
import { createLockOverlayWindow, createMainWindow, createSplashWindow } from './window-factory';
import type { EnvironmentManifest, SplashErrorPayload, SplashStatusUpdate } from '../shared/types';

// ---------------------------------------------------------------------------
// CLI flag / env var support for support staff (spec: `--env=<envId>` / INNOVA_ENV)
// ---------------------------------------------------------------------------

function readCliEnvId(): string | null {
  const flag = process.argv.find((arg) => arg.startsWith('--env='));
  if (flag) {
    return flag.slice('--env='.length) || null;
  }
  return process.env.INNOVA_ENV || null;
}

/**
 * Reads the machine-level default environment written by the MSI's ENVID
 * public property (see electron-builder.yml / README packaging notes) at
 * `HKLM\SOFTWARE\InnovaCare\InnovaLauncher\DefaultEnvId`. Windows-only;
 * silently returns null anywhere the key/registry isn't available, since
 * this is a convenience default, not a security control.
 */
function readMachineDefaultEnvId(): string | null {
  if (process.platform !== 'win32') {
    return null;
  }
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\InnovaCare\\InnovaLauncher', '/v', 'DefaultEnvId'],
      { encoding: 'utf8' }
    );
    const match = /DefaultEnvId\s+REG_SZ\s+(\S+)/.exec(output);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persisted "last selected environment" (splash picker convenience only)
// ---------------------------------------------------------------------------

function lastEnvironmentFile(): string {
  return path.join(app.getPath('userData'), 'last-environment.json');
}

async function readLastSelectedEnvId(): Promise<string | null> {
  try {
    const contents = await fs.readFile(lastEnvironmentFile(), 'utf8');
    return (JSON.parse(contents) as { envId: string }).envId;
  } catch {
    return null;
  }
}

async function writeLastSelectedEnvId(envId: string): Promise<void> {
  await fs.writeFile(lastEnvironmentFile(), JSON.stringify({ envId }), 'utf8');
}

// ---------------------------------------------------------------------------
// Crash reporting (PHI scrubbing: only structured, non-clinical fields are
// ever attached — see README "Remaining Work" for the breadcrumb caveat)
// ---------------------------------------------------------------------------

function configureCrashReporter(): void {
  const submitURL = process.env.INNOVA_CRASH_REPORT_URL;
  crashReporter.start({
    productName: 'InnovaLauncher',
    companyName: 'InnovaCare',
    submitURL: submitURL ?? '',
    uploadToServer: Boolean(submitURL),
    ignoreSystemCrashHandler: false,
    extra: {
      clientVersion: app.getVersion()
    }
  });
}

// ---------------------------------------------------------------------------
// Boot orchestration
// ---------------------------------------------------------------------------

class LauncherController {
  private splashWindow: BrowserWindow | null = null;
  private mainWindow: BrowserWindow | null = null;
  private lockOverlayWindow: BrowserWindow | null = null;
  private idleLockManager: IdleLockManager | null = null;
  private manifest: EnvironmentManifest | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly auditLogger = new AuditLogger(app.getPath('userData'));
  private readonly tokenStore = new TokenStore(app.getPath('userData'));
  private readonly manifestService = new ManifestService({
    userDataDir: app.getPath('userData'),
    appVersion: app.getVersion()
  });

  async start(): Promise<void> {
    this.splashWindow = createSplashWindow();
    this.registerChromeIpc();
    void this.auditLogger.log({ type: 'launch', detail: {} });
  }

  private sendStatus(update: SplashStatusUpdate): void {
    this.splashWindow?.webContents.send(CHROME_IPC_EVENTS.status, update);
  }

  private sendError(message: string, code: string): void {
    const payload: SplashErrorPayload = { message, code, correlationId: randomUUID() };
    this.splashWindow?.webContents.send(CHROME_IPC_EVENTS.error, payload);
  }

  private registerChromeIpc(): void {
    const implementations: Record<ChromeIpcChannel, (arg: unknown) => Promise<unknown>> = {
      'chrome:init': async () => ({
        knownEnvironments: KNOWN_ENVIRONMENTS,
        lastSelectedEnvId: await readLastSelectedEnvId(),
        autoSelectedEnvId: readCliEnvId() ?? readMachineDefaultEnvId()
      }),
      'chrome:select-environment': async (arg) => {
        const { envId } = arg as { envId: string };
        await writeLastSelectedEnvId(envId);
        await this.boot(envId);
        return null;
      },
      'chrome:unlock': async () => {
        this.idleLockManager?.extendSession();
        this.lockOverlayWindow?.close();
        this.lockOverlayWindow = null;
        return null;
      },
      'chrome:cancel': async () => {
        app.quit();
        return null;
      }
    };

    for (const channel of Object.keys(CHROME_IPC_CHANNELS) as ChromeIpcChannel[]) {
      const schema = CHROME_IPC_CHANNELS[channel];
      ipcMain.handle(channel, async (_event, arg: unknown) => implementations[channel](schema.parse(arg)));
    }
  }

  /** Full boot sequence for a chosen environment: manifest -> version gate -> auth -> main window. */
  private async boot(envId: string): Promise<void> {
    this.sendStatus({ status: 'checking-for-updates' });

    let loadResult;
    try {
      loadResult = await this.manifestService.load(envId);
    } catch (error) {
      if (error instanceof ManifestSignatureError) {
        void this.auditLogger.log({ type: 'manifest-verify-failed', detail: { envId } });
        this.sendError('Configuration signature is invalid. Contact IT support.', 'MANIFEST_SIGNATURE_INVALID');
      } else if (error instanceof ManifestValidationError) {
        this.sendError('Configuration is malformed. Contact IT support.', 'MANIFEST_SHAPE_INVALID');
      } else if (error instanceof ManifestUnavailableError) {
        this.sendError('This environment is unreachable and no cached configuration exists.', 'MANIFEST_UNAVAILABLE');
      } else {
        this.sendError('Unexpected error loading configuration.', 'MANIFEST_UNKNOWN_ERROR');
      }
      return;
    }

    const { manifest, offline, updateRequired } = loadResult;
    this.manifest = manifest;
    this.auditLogger.setEnvironment(manifest.envId);
    void this.auditLogger.log({ type: 'environment-selected', detail: { envId: manifest.envId, tier: manifest.tier } });

    if (offline) {
      this.sendStatus({ status: 'verifying-configuration', detail: 'Offline — using cached configuration' });
    }

    if (updateRequired) {
      this.sendStatus({ status: 'downloading-update' });
      configureAutoUpdaterListeners(this.auditLogger);
      autoUpdater.checkForUpdates().catch(() => {
        this.sendError(
          'A required update could not be downloaded automatically. Contact IT support.',
          'UPDATE_REQUIRED_UNAVAILABLE'
        );
      });
      // Hard-block: do not proceed to auth/main window on an out-of-date
      // client. autoUpdater will quitAndInstall once the download completes.
      return;
    }

    this.sendStatus({ status: 'authenticating' });
    let tokens: oidc.TokenResponse;
    try {
      const result = await oidc.login(manifest.oidc);
      tokens = result.tokens;
    } catch (error) {
      void this.auditLogger.log({ type: 'auth-failure', detail: { envId: manifest.envId } });
      this.sendError('Sign-in failed or was cancelled.', 'AUTH_FAILED');
      console.error('[auth] login failed', error);
      return;
    }
    void this.auditLogger.log({ type: 'auth-success', detail: { envId: manifest.envId } });

    if (tokens.refresh_token) {
      await this.tokenStore.save({ refreshToken: tokens.refresh_token, obtainedAt: new Date().toISOString() });
    }
    await this.injectAuthorizationCookie(manifest, tokens);
    this.scheduleTokenRefresh(manifest, tokens);

    this.sendStatus({ status: 'opening' });
    this.openMainWindow(manifest);
  }

  /**
   * Injects the access token as an httpOnly cookie scoped to the manifest's
   * appUrl, rather than handing it across the preload bridge into
   * page-reachable JS. An httpOnly cookie cannot be read by renderer
   * JavaScript at all (including via an XSS bug in the Angular app), which
   * is a stronger containment boundary than anything achievable once a
   * token is exposed through contextBridge — at the cost of requiring
   * InnovaClinic's hosting layer to read this cookie server-side (or via an
   * APP_INITIALIZER reading a non-httpOnly companion cookie it sets itself).
   * See README "Remaining Work" for that integration.
   */
  private async injectAuthorizationCookie(
    manifest: EnvironmentManifest,
    tokens: oidc.TokenResponse
  ): Promise<void> {
    const url = new URL(manifest.appUrl);
    await session.defaultSession.cookies.set({
      url: manifest.appUrl,
      name: '__innova_authorization',
      value: tokens.access_token,
      domain: url.hostname,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      expirationDate: Math.floor(Date.now() / 1000) + tokens.expires_in
    });
  }

  private scheduleTokenRefresh(manifest: EnvironmentManifest, tokens: oidc.TokenResponse): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    if (!tokens.refresh_token) {
      return;
    }
    const delayMs = Math.max((tokens.expires_in - 60) * 1000, 30_000);
    this.refreshTimer = setTimeout(() => {
      void this.refreshTokens(manifest, tokens.refresh_token as string);
    }, delayMs);
    this.refreshTimer.unref?.();
  }

  private async refreshTokens(manifest: EnvironmentManifest, refreshToken: string): Promise<void> {
    try {
      const next = await oidc.refresh(manifest.oidc, refreshToken);
      await this.tokenStore.save({
        refreshToken: next.refresh_token ?? refreshToken,
        obtainedAt: new Date().toISOString()
      });
      await this.injectAuthorizationCookie(manifest, next);
      this.scheduleTokenRefresh(manifest, next);
    } catch (error) {
      console.error('[auth] silent refresh failed', error);
      // Let the session ride on the existing cookie until it expires; the
      // InnovaClinic app's own auth guard is responsible for prompting a
      // fresh interactive login at that point.
    }
  }

  private openMainWindow(manifest: EnvironmentManifest): void {
    const mainWindow = createMainWindow({
      manifest,
      showSupportMenu: manifest.featureFlags['supportMenu'] === true
    });
    this.mainWindow = mainWindow;

    applyContentSecurityPolicy(session.defaultSession, manifest);
    applyPermissionHandler(session.defaultSession, manifest);
    applyCertificatePinning(session.defaultSession, manifest);
    applyRejectInvalidCertificates(mainWindow);
    applyDevToolsLock(mainWindow, app.isPackaged);
    applyNavigationGuards(mainWindow, manifest, {
      onBlocked: (attemptedUrl) => {
        void this.auditLogger.log({ type: 'navigation-blocked', detail: { url: attemptedUrl } });
      }
    });

    registerIpcHandlers({
      getManifest: () => this.manifest as EnvironmentManifest,
      auditLogger: this.auditLogger,
      idleLockManager: this.idleLockManagerFor(manifest),
      userDataDir: app.getPath('userData')
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      this.splashWindow?.close();
      this.splashWindow = null;
    });
    mainWindow.on('closed', () => {
      this.mainWindow = null;
      app.quit();
    });

    void mainWindow.loadURL(manifest.appUrl);
    this.idleLockManager?.start();
  }

  private idleLockManagerFor(manifest: EnvironmentManifest): IdleLockManager {
    if (this.idleLockManager) {
      return this.idleLockManager;
    }
    this.idleLockManager = new IdleLockManager(manifest.idleTimeoutSeconds, {
      onWarning: (secondsRemaining) => {
        this.mainWindow?.webContents.send(IPC_EVENTS.idleWarning, secondsRemaining);
      },
      onLock: (reason) => {
        void this.auditLogger.log({ type: 'lock', detail: { reason } });
        if (this.mainWindow && !this.lockOverlayWindow) {
          this.lockOverlayWindow = createLockOverlayWindow(this.mainWindow);
        }
      },
      onUnlockAvailable: () => {
        void this.auditLogger.log({ type: 'unlock', detail: {} });
      }
    });
    return this.idleLockManager;
  }
}

function configureAutoUpdaterListeners(auditLogger: AuditLogger): void {
  autoUpdater.autoDownload = true;
  autoUpdater.removeAllListeners('update-downloaded');
  autoUpdater.removeAllListeners('error');
  autoUpdater.on('update-downloaded', () => {
    void auditLogger.log({ type: 'update-installed', detail: {} }).then(() => autoUpdater.quitAndInstall());
  });
  autoUpdater.on('error', (error) => {
    console.error('[auto-updater]', error);
  });
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // A second launch must focus the existing session, never open a parallel
  // one — a clinician should never be able to end up with two sessions
  // pointed at (potentially different) environments simultaneously.
  app.quit();
} else {
  let controller: LauncherController | null = null;

  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.whenReady().then(async () => {
    configureCrashReporter();
    controller = new LauncherController();
    await controller.start();
  });
}
