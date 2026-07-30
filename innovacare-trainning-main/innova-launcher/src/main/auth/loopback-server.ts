// src/main/auth/loopback-server.ts
//
// Receives the OIDC authorization-code callback on a short-lived local HTTP
// server bound to 127.0.0.1 only (never 0.0.0.0 — this must not be
// reachable from the network). The server accepts exactly one request, then
// shuts itself down, minimizing the window during which anything else on
// the machine could hit the callback port.
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface LoopbackCallbackResult {
  code: string;
  state: string;
}

export class LoopbackAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoopbackAuthError';
  }
}

export interface LoopbackServerHandle {
  /** The exact redirect_uri to register in the authorization request. */
  redirectUri: string;
  /** Resolves with the callback's `code`/`state` once the browser hits /callback. */
  result: Promise<LoopbackCallbackResult>;
  close: () => void;
}

/**
 * Starts a one-shot loopback listener on an OS-assigned ephemeral port.
 * Resolves once the port is actually bound so the returned `redirectUri` is
 * ready to embed in the authorization URL. `timeoutMs` bounds how long the
 * launcher waits for the user to finish signing in in the system browser.
 */
export async function startLoopbackServer(timeoutMs = 5 * 60 * 1000): Promise<LoopbackServerHandle> {
  let resolveResult!: (value: LoopbackCallbackResult) => void;
  let rejectResult!: (reason: Error) => void;
  const result = new Promise<LoopbackCallbackResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }

    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (error || !code || !state) {
      res.end(renderCallbackPage(false));
      rejectResult(new LoopbackAuthError(error ?? 'Authorization callback missing code/state'));
    } else {
      res.end(renderCallbackPage(true));
      resolveResult({ code, state });
    }

    // One callback is all this server will ever accept.
    server.close();
  });

  const timer = setTimeout(() => {
    rejectResult(new LoopbackAuthError('Timed out waiting for authorization callback'));
    server.close();
  }, timeoutMs);
  timer.unref();

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    redirectUri: `http://127.0.0.1:${port}/callback`,
    result,
    close: () => {
      clearTimeout(timer);
      server.close();
    }
  };
}

function renderCallbackPage(success: boolean): string {
  const title = success ? 'Signed in' : 'Sign-in failed';
  const message = success
    ? 'You can close this window and return to InnovaLauncher.'
    : 'Something went wrong. You can close this window and try again in InnovaLauncher.';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family: -apple-system, Segoe UI, sans-serif; text-align:center; padding-top:4rem;">
<h1>${title}</h1><p>${message}</p></body></html>`;
}

/** Not cryptographically meaningful by itself — pairs with PKCE below to prevent CSRF/code injection. */
export function generateState(): string {
  return randomBytes(16).toString('base64url');
}
