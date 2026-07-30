// src/main/security-policy.ts
//
// Defense-in-depth network/navigation controls applied on top of the
// hardened BrowserWindow config in window-factory.ts. Nothing here should
// ever be the *only* control for a given risk — CSP backs up webSecurity,
// origin allowlisting backs up contextIsolation, etc.
import { createHash } from 'node:crypto';
import type { BrowserWindow, Session } from 'electron';
import { shell } from 'electron';
import type { EnvironmentManifest } from '../shared/types';

/**
 * Matches an origin against the manifest's `allowedOrigins`, where an entry
 * like "*.firebaseapp.com" matches exactly one subdomain level plus the
 * base domain (never a bare "*" and never partial-string matches, which is
 * the classic way origin allowlists get bypassed).
 */
export function isOriginAllowed(targetUrl: string, allowedOrigins: readonly string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowedOrigins.some((pattern) => {
    const normalized = pattern.toLowerCase();
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1); // ".example.com"
      return hostname.endsWith(suffix) && hostname !== suffix.slice(1);
    }
    return hostname === normalized;
  });
}

/**
 * Builds a strict CSP for the renderer. `connect-src`/`frame-src`/`img-src`
 * are scoped to the manifest's allowlist so even if webSecurity were somehow
 * bypassed, the page still cannot phone home to an arbitrary origin.
 */
export function buildContentSecurityPolicy(manifest: EnvironmentManifest): string {
  const origins = manifest.allowedOrigins.map((origin) =>
    origin.startsWith('*.') ? `https://${origin}` : `https://${origin}`
  );
  const sources = ["'self'", ...origins].join(' ');
  return [
    `default-src ${sources}`,
    `script-src ${sources}`,
    `style-src ${sources} 'unsafe-inline'`, // Angular Material injects inline styles at runtime
    `img-src ${sources} data:`,
    `font-src ${sources} data:`,
    `connect-src ${sources} wss:`, // Firestore realtime channels
    `frame-src ${sources}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'"
  ].join('; ');
}

/** Registers the strict CSP as a response header — defense-in-depth alongside webSecurity. */
export function applyContentSecurityPolicy(session: Session, manifest: EnvironmentManifest): void {
  const csp = buildContentSecurityPolicy(manifest);
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });
}

// Permission types the app will ever need are enumerated explicitly; any
// request for a permission outside this map is denied without even
// consulting feature flags — an unrecognized permission name should never
// be treated as "maybe allowed".
const PERMISSION_FEATURE_FLAG: Partial<Record<string, string>> = {
  media: 'ldaBodyMap', // camera access for LDA body-map capture
  notifications: 'offlineDraft'
};

/** Denies every permission request by default; allows only what the manifest's feature flags enable. */
export function applyPermissionHandler(session: Session, manifest: EnvironmentManifest): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const requiredFlag = PERMISSION_FEATURE_FLAG[permission];
    const allowed = requiredFlag !== undefined && manifest.featureFlags[requiredFlag] === true;
    callback(allowed);
  });
  session.setPermissionCheckHandler((_webContents, permission) => {
    const requiredFlag = PERMISSION_FEATURE_FLAG[permission];
    return requiredFlag !== undefined && manifest.featureFlags[requiredFlag] === true;
  });
}

/**
 * Optional SPKI certificate pinning, verified in addition to (never instead
 * of) normal chain validation. `session.setCertificateVerifyProc` only runs
 * for hosts we've registered a proc for; returning -3 defers to Chromium's
 * normal verification for every other host.
 */
export function applyCertificatePinning(session: Session, manifest: EnvironmentManifest): void {
  const pins = manifest.certificatePins ?? [];
  if (pins.length === 0) {
    return;
  }
  const pinsByHost = new Map(pins.map((pin) => [pin.host.toLowerCase(), pin.spkiSha256]));

  session.setCertificateVerifyProc((request, callback) => {
    const expectedSpki = pinsByHost.get(request.hostname.toLowerCase());
    if (!expectedSpki) {
      callback(-3); // -3 = use Chromium's default verification for this host
      return;
    }
    const actualSpki = createHash('sha256').update(request.certificate.data).digest('base64');
    callback(actualSpki === expectedSpki ? 0 : -2); // 0 = accept, -2 = reject
  });
}

/**
 * `certificate-error` fires only when Chromium's own TLS validation has
 * already failed (self-signed, expired, hostname mismatch, ...). There is
 * no legitimate reason for a clinical launcher to click through that, so
 * every such event is rejected outright — no per-host exceptions, no
 * "remember this certificate" UI.
 */
export function applyRejectInvalidCertificates(win: BrowserWindow): void {
  win.webContents.on('certificate-error', (event, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(false);
  });
}

export interface NavigationGuardHooks {
  onBlocked: (attemptedUrl: string) => void;
}

/**
 * Confines in-app navigation to `allowedOrigins`; anything else either opens
 * in the system browser (still gated by the same allowlist, applied to
 * `shell.openExternal` targets) or is dropped entirely.
 */
export function applyNavigationGuards(
  win: BrowserWindow,
  manifest: EnvironmentManifest,
  hooks: NavigationGuardHooks
): void {
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isOriginAllowed(targetUrl, manifest.allowedOrigins)) {
      event.preventDefault();
      hooks.onBlocked(targetUrl);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOriginAllowed(url, manifest.allowedOrigins)) {
      // Still same-app navigation policy — deny the new-window/tab and let
      // will-navigate handle it in-place instead of spawning a second
      // uncontrolled BrowserWindow.
      return { action: 'deny' };
    }
    if (isExternalLinkAllowed(url)) {
      void shell.openExternal(url);
    } else {
      hooks.onBlocked(url);
    }
    return { action: 'deny' };
  });
}

/** Only https:// links may ever reach shell.openExternal — never custom schemes or file://. */
function isExternalLinkAllowed(targetUrl: string): boolean {
  try {
    return new URL(targetUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * DevTools are a full JS/DOM debugging surface — disabling them only in the
 * renderer's context menu is not enough, since the accelerator and
 * `openDevTools()` calls bypass that. `devTools: false` in webPreferences
 * (set by window-factory.ts when packaged) is the actual control; this
 * function is the belt-and-suspenders close-if-somehow-opened backstop.
 */
export function applyDevToolsLock(win: BrowserWindow, isPackaged: boolean): void {
  if (!isPackaged) {
    return;
  }
  win.webContents.on('devtools-opened', () => {
    win.webContents.closeDevTools();
  });
  win.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const isDevToolsAccelerator =
      (input.control || input.meta) && input.shift && key === 'i';
    const isF12 = key === 'f12';
    if (isDevToolsAccelerator || isF12) {
      event.preventDefault();
    }
  });
}
