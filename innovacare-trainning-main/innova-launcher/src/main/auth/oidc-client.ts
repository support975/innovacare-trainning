// src/main/auth/oidc-client.ts
//
// OIDC Authorization Code + PKCE flow. The login page is always opened in
// the system browser (never an embedded webview/BrowserWindow) — most
// enterprise IdPs, and Google/Microsoft's own policies, reject login flows
// run inside an app-controlled browser surface as phishable.
import { createHash, randomBytes } from 'node:crypto';
import { shell } from 'electron';
import type { EnvironmentManifest } from '../../shared/types';
import { generateState, startLoopbackServer } from './loopback-server';

export interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

export class OidcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OidcError';
  }
}

function base64urlSha256(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

function generateCodeVerifier(): string {
  // 32 random bytes -> 43-char base64url string, within the RFC 7636
  // required 43-128 character range.
  return randomBytes(32).toString('base64url');
}

/** Fetches the IdP's discovery document rather than hardcoding endpoint paths. */
export async function discover(
  issuer: string,
  fetchImpl: typeof fetch = fetch
): Promise<OidcDiscoveryDocument> {
  const wellKnownUrl = new URL('/.well-known/openid-configuration', issuer).toString();
  const response = await fetchImpl(wellKnownUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new OidcError(`OIDC discovery failed with HTTP ${response.status}`);
  }
  const doc = (await response.json()) as Partial<OidcDiscoveryDocument>;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new OidcError('OIDC discovery document is missing required endpoints');
  }
  return { authorization_endpoint: doc.authorization_endpoint, token_endpoint: doc.token_endpoint };
}

export interface LoginResult {
  tokens: TokenResponse;
}

/**
 * Runs one full Authorization Code + PKCE round trip: opens the system
 * browser to the IdP, waits on the loopback server for the callback, then
 * exchanges the code for tokens. Throws OidcError/LoopbackAuthError on any
 * failure — callers must not treat a partial result as a successful login.
 */
export async function login(
  oidc: EnvironmentManifest['oidc'],
  fetchImpl: typeof fetch = fetch
): Promise<LoginResult> {
  const discovery = await discover(oidc.issuer, fetchImpl);
  const loopback = await startLoopbackServer();

  try {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = base64urlSha256(codeVerifier);

    const authUrl = new URL(discovery.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', oidc.clientId);
    authUrl.searchParams.set('redirect_uri', loopback.redirectUri);
    authUrl.searchParams.set('scope', oidc.scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    const opened = await shell.openExternal(authUrl.toString());
    void opened;

    const callback = await loopback.result;
    if (callback.state !== state) {
      throw new OidcError('OIDC state mismatch — possible CSRF, aborting login');
    }

    const tokens = await exchangeCodeForTokens(discovery.token_endpoint, {
      grant_type: 'authorization_code',
      code: callback.code,
      redirect_uri: loopback.redirectUri,
      client_id: oidc.clientId,
      code_verifier: codeVerifier
    }, fetchImpl);

    return { tokens };
  } finally {
    loopback.close();
  }
}

export async function refresh(
  oidc: EnvironmentManifest['oidc'],
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<TokenResponse> {
  const discovery = await discover(oidc.issuer, fetchImpl);
  return exchangeCodeForTokens(discovery.token_endpoint, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: oidc.clientId
  }, fetchImpl);
}

async function exchangeCodeForTokens(
  tokenEndpoint: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<TokenResponse> {
  const response = await fetchImpl(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new OidcError(`Token exchange failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as Partial<TokenResponse>;
  if (!body.access_token || !body.expires_in || !body.token_type) {
    throw new OidcError('Token response is missing required fields');
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    id_token: body.id_token,
    expires_in: body.expires_in,
    token_type: body.token_type
  };
}

/**
 * Decodes (does NOT cryptographically verify) the ID token's claims for
 * display/audit purposes only (e.g. subject identifier in the audit log).
 * See README "Remaining Work" — production must verify the signature
 * against the IdP's JWKS before trusting any claim for an authorization
 * decision.
 */
export function decodeIdTokenClaimsUnsafe(idToken: string): Record<string, unknown> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new OidcError('Malformed ID token');
  }
  const payload = Buffer.from(parts[1] as string, 'base64url').toString('utf8');
  return JSON.parse(payload) as Record<string, unknown>;
}
