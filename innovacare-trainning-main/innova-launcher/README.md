# InnovaLauncher

A secure, Hyperdrive-style desktop launcher for InnovaClinic. A thin,
hardened Electron shell validates a signed environment manifest, gates on
minimum client version, runs OIDC + PKCE login in the system browser, then
opens a locked-down `BrowserWindow` that can only ever reach the origins
that manifest allows.

## Architecture summary

1. **Splash/picker window** (`src/splash`) — frameless, always-on-top,
   bundled list of known `envId`s, live status line, tier warning ribbon,
   copyable error codes. Its own preload (`splash/preload.ts`) exposes a
   small `innovaLauncherChrome` bridge distinct from the content bridge.
2. **Manifest service** (`main/manifest-service.ts` + `main/signature.ts`)
   — fetches `https://config.innovacare.app/environments/{envId}.json`,
   verifies an Ed25519 signature over the canonical JSON against a
   compiled-in public key **before** any shape validation, caches the
   last-good signed manifest, and gates launch on `minClientVersion`.
3. **Hardened main window** (`main/window-factory.ts` +
   `main/security-policy.ts`) — exact `nodeIntegration:false /
   contextIsolation:true / sandbox:true` webPreferences, CSP header,
   permission-request deny-by-default, navigation/window-open origin
   allowlisting, certificate-error hard rejection + optional SPKI pinning,
   DevTools disabled when packaged, tier-colored top border.
4. **Preload bridge** (`src/preload/index.ts`) — eight explicitly
   enumerated `innovaNative` calls, each backed by a Zod-validated
   `ipcMain.handle` in `main/ipc/handlers.ts`; no generic passthrough.
5. **Auth** (`main/auth/*`) — OIDC discovery, Authorization Code + PKCE in
   the system browser, loopback callback on `127.0.0.1`, refresh token
   encrypted via `safeStorage`, access token injected as an httpOnly cookie
   (see rationale in `main/index.ts`).
6. **Clinical safety** (`main/idle-lock.ts`, `main/audit-log.ts`) — idle
   auto-lock with a launcher-owned overlay window (not renderer-drawn, so
   it can't be bypassed by page JS), lock on OS lock-screen/suspend,
   append-only JSONL audit trail rotated at 10MB.

## Setup & Run

```bash
cd innova-launcher
npm install

# Generate a dev signing keypair (do this once)
npm run sign-manifest -- genkey ./dev-keys/manifest-signing-key
# Set INNOVA_MANIFEST_PUBLIC_KEY to the printed public key before building,
# e.g. in your shell profile or a .env consumed by your build pipeline.
export INNOVA_MANIFEST_PUBLIC_KEY=<printed-x-value>

# Sign a manifest for local testing and host it (or serve it locally and
# point baseUrl at it via ManifestService's constructor options in dev)
npm run sign-manifest -- sign path/to/manifest.json ./dev-keys/manifest-signing-key.private.jwk.json

npm run typecheck
npm test
npm run dev            # builds then launches Electron with --env=train-central

npm run package:win    # MSI + NSIS
npm run package:mac    # DMG (requires macOS + notarization env vars)
```

Signing credentials (Windows EV cert, Apple notarization) are read from
environment variables by `electron-builder.yml`:
`CSC_LINK` / `CSC_KEY_PASSWORD` (Windows), `APPLE_ID` /
`APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` (macOS notarization).

### Silent enterprise install

```
msiexec /i InnovaLauncher.msi /qn ENVID=prod-eastern
```

`ENVID` is surfaced as an MSI public property; a bundled custom action (not
included in this scaffold — see Remaining Work) must write it to
`HKLM\SOFTWARE\InnovaCare\InnovaLauncher\DefaultEnvId`, which
`main/index.ts`'s `readMachineDefaultEnvId()` reads on first run.

## Security checklist

| Control | Implementation |
|---|---|
| Manifest signature verified before trust | `main/signature.ts` `verifyManifestSignature`, called from `manifest-service.ts` before Zod parsing, on both network and cache reads |
| Hard-fail on bad signature, no unsigned fallback | `manifest-service.ts` `load()` re-throws `ManifestSignatureError`/`ManifestValidationError` instead of falling back to cache |
| Offline banner on cache fallback | `manifest-service.ts` returns `offline: true`; `main/index.ts` `boot()` sends a `verifying-configuration` status with the offline detail text |
| Min-version gate blocks launch | `manifest-service.ts` `semver.lt()` check; `main/index.ts` `boot()` returns early and drives `electron-updater` instead of opening the main window |
| `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` | `main/window-factory.ts` `createMainWindow`/`createSplashWindow`/`createLockOverlayWindow` — the only places any `BrowserWindow` is constructed |
| Deny-by-default permissions | `main/security-policy.ts` `applyPermissionHandler` |
| Navigation/new-window origin allowlist | `main/security-policy.ts` `applyNavigationGuards` + `isOriginAllowed` |
| External links only via `shell.openExternal`, https-only | `main/security-policy.ts` `isExternalLinkAllowed` |
| DevTools disabled when packaged (accelerator + auto-close) | `main/security-policy.ts` `applyDevToolsLock`; `devTools: !app.isPackaged` in `window-factory.ts` |
| No application menu in production | `main/window-factory.ts` `applyApplicationMenu` |
| Strict CSP response header | `main/security-policy.ts` `buildContentSecurityPolicy` / `applyContentSecurityPolicy` |
| Certificate-error hard rejection | `main/security-policy.ts` `applyRejectInvalidCertificates` |
| Optional SPKI certificate pinning | `main/security-policy.ts` `applyCertificatePinning` |
| PKCE login in system browser, not embedded webview | `main/auth/oidc-client.ts` `login()` uses `shell.openExternal`; no `webview` tag or `BrowserWindow`-hosted login anywhere in the repo |
| Loopback callback bound to 127.0.0.1 only | `main/auth/loopback-server.ts` `server.listen(0, '127.0.0.1')` |
| Refresh token encrypted at rest | `main/auth/token-store.ts` via `safeStorage` |
| Narrow, explicitly enumerated preload API | `src/preload/index.ts` — no `invoke(channel, args)` passthrough |
| Every IPC payload Zod-validated, unknown channels rejected | `main/ipc/schemas.ts` (`IPC_CHANNELS`/`CHROME_IPC_CHANNELS` allowlists) + `main/ipc/handlers.ts` (`.parse()` before dispatch) |
| Idle auto-lock, 60s warning, obscures content | `main/idle-lock.ts` `IdleLockManager`; overlay in `window-factory.ts` `createLockOverlayWindow` |
| Lock on OS lock-screen/suspend | `main/idle-lock.ts` `powerMonitor.on('lock-screen'/'suspend')` |
| Audit log: append-only, rotated, no PHI/tokens | `main/audit-log.ts`; shape enforced by `AuditEventSchema` (primitives only) in `shared/types.ts` |
| Single-instance lock | `main/index.ts` `app.requestSingleInstanceLock()` |
| Crash reporting, PHI-scrubbed extras | `main/index.ts` `configureCrashReporter()` (only `clientVersion` attached; see Remaining Work for full breadcrumb scrubbing) |

## Remaining Work

Flagged explicitly rather than silently stubbed:

- **Manifest signing key**: `INNOVA_MANIFEST_PUBLIC_KEY` defaults to a
  placeholder that throws at runtime. An organization must generate its own
  Ed25519 keypair (`npm run sign-manifest -- genkey`), inject the public
  half at build time (e.g. via `electron-builder`'s `extraMetadata` or a
  build-time env substitution), and keep the private half in an HSM or
  restricted secrets store — never on a developer laptop for production
  keys.
- **HID badge scanning**: `ipc/handlers.ts` `scanBadge()` throws
  `"not implemented"`. Real clinical badge readers vary by vendor/HID
  profile; wire in the specific SDK (e.g. via `node-hid`) once hardware is
  chosen.
- **ID token signature verification**: `auth/oidc-client.ts`
  `decodeIdTokenClaimsUnsafe()` decodes but does not cryptographically
  verify the ID token against the IdP's JWKS. Fine for display/audit use
  (current usage), but any authorization decision must fetch
  `jwks_uri` from discovery and verify signature + `aud`/`iss`/`exp` first.
- **InnovaClinic backend integration for the injected auth cookie**: the
  access token is set as an httpOnly cookie scoped to `appUrl`
  (`main/index.ts` `injectAuthorizationCookie`), chosen over exposing the
  token through the preload bridge specifically to keep it unreadable by
  page JavaScript. This repository's actual InnovaClinic Angular app
  authenticates via Firebase Auth directly (see `src/enviroments` in the
  main app), which does not natively consume this cookie. Production
  wiring needs either (a) a Cloud Function that exchanges the OIDC
  `id_token` for a Firebase custom token, minted server-side after reading
  this cookie, or (b) switching the web app to accept this cookie via an
  `APP_INITIALIZER`/Hosting middleware. This integration lives outside
  `innova-launcher` and is not implemented here.
- **MSI `ENVID` custom action**: `electron-builder.yml` documents the
  property but electron-builder's MSI target does not itself write registry
  values from public properties — this needs a WiX custom action (or a
  post-install script) added to the MSI build, not included here.
- **Full crash breadcrumb PHI scrubbing**: only a minimal, structured
  `extra` payload (client version) is attached to crash reports. Scrubbing
  arbitrary renderer breadcrumbs (e.g. via Sentry's `beforeBreadcrumb`)
  depends on which crash backend the org adopts and is not implemented.
- **Certificate pin distribution**: `certificatePins` is an optional
  manifest field with no default pins shipped; an org must populate it
  per-environment and have a rotation plan (pinning a Firebase/Google
  Cloud-fronted certificate that rotates automatically is fragile without one).
- **Code signing / notarization credentials**: `electron-builder.yml` reads
  `CSC_LINK`/`CSC_KEY_PASSWORD`/`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/
  `APPLE_TEAM_ID`/`WIN_CERT_SUBJECT_NAME` from the environment; none are
  provided here. An org must supply an EV code-signing certificate and an
  Apple Developer ID with notarization access.
- **`safeStorage` on Linux without a keychain daemon**: falls back to a
  weaker OS-provided obfuscation rather than true encryption when no
  Secret Service/KWallet is running. Acceptable for this scaffold; flag for
  hardened Linux deployments.
- **Update feed hosting**: `electron-builder.yml` points `publish.url` at
  `https://config.innovacare.app/updates/` (Firebase Hosting-style generic
  provider) but no update artifacts are hosted anywhere yet — an org must
  stand up that hosting path and populate `latest.yml`/`latest-mac.yml` on
  release.
