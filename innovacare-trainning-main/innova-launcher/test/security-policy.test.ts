// test/security-policy.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() }
}));

import { buildContentSecurityPolicy, isOriginAllowed } from '../src/main/security-policy';
import type { EnvironmentManifest } from '../src/shared/types';

const manifest: EnvironmentManifest = {
  envId: 'prod-eastern',
  displayName: 'InnovaClinic Production',
  appUrl: 'https://clinic.innovacare.app',
  minClientVersion: '1.0.0',
  allowedOrigins: ['clinic.innovacare.app', '*.firebaseapp.com', '*.googleapis.com'],
  idleTimeoutSeconds: 900,
  oidc: { issuer: 'https://auth.innovacare.app', clientId: 'x', scopes: ['openid'] },
  featureFlags: {},
  tier: 'production',
  signature: 'sig'
};

describe('isOriginAllowed', () => {
  it('matches an exact origin', () => {
    expect(isOriginAllowed('https://clinic.innovacare.app/dashboard', manifest.allowedOrigins)).toBe(true);
  });

  it('matches one subdomain level under a wildcard entry', () => {
    expect(isOriginAllowed('https://myproject.firebaseapp.com/', manifest.allowedOrigins)).toBe(true);
  });

  it('does not match the bare wildcard base domain itself', () => {
    expect(isOriginAllowed('https://firebaseapp.com/', manifest.allowedOrigins)).toBe(false);
  });

  it('rejects an unrelated origin', () => {
    expect(isOriginAllowed('https://evil.example.com/', manifest.allowedOrigins)).toBe(false);
  });

  it('rejects a suffix-only lookalike domain', () => {
    expect(isOriginAllowed('https://notclinic.innovacare.app.evil.com/', manifest.allowedOrigins)).toBe(false);
  });

  it('rejects an unparsable URL', () => {
    expect(isOriginAllowed('not a url', manifest.allowedOrigins)).toBe(false);
  });
});

describe('buildContentSecurityPolicy', () => {
  it('scopes connect-src and script-src to the manifest allowlist', () => {
    const csp = buildContentSecurityPolicy(manifest);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('https://clinic.innovacare.app');
    expect(csp).toContain('https://*.firebaseapp.com');
  });
});
