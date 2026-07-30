// test/manifest-service.test.ts
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '../src/main/signature';
import { manifestSignedFields } from '../src/shared/types';
import { ManifestService, ManifestUnavailableError } from '../src/main/manifest-service';
import { ManifestSignatureError } from '../src/main/signature';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLIC_KEY_B64URL = (publicKey.export({ format: 'jwk' }) as { x: string }).x;

function signedManifest(overrides: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    envId: 'train-central',
    displayName: 'InnovaClinic Training',
    appUrl: 'https://train.clinic.innovacare.app',
    minClientVersion: '1.0.0',
    allowedOrigins: ['train.clinic.innovacare.app'],
    idleTimeoutSeconds: 900,
    oidc: { issuer: 'https://auth.innovacare.app', clientId: 'innovaclinic-desktop', scopes: ['openid'] },
    featureFlags: {},
    tier: 'train',
    ...overrides
  };
  const canonical = canonicalJsonStringify(manifestSignedFields(base));
  base.signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
  return base;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

describe('ManifestService', () => {
  let userDataDir: string;

  beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'innova-manifest-'));
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true });
  });

  it('loads and validates a correctly signed manifest', async () => {
    const manifest = signedManifest();
    const service = new ManifestService({
      userDataDir,
      appVersion: '2.0.0',
      publicKeyB64url: PUBLIC_KEY_B64URL,
      fetchImpl: (async () => jsonResponse(manifest)) as typeof fetch
    });

    const result = await service.load('train-central');
    expect(result.offline).toBe(false);
    expect(result.updateRequired).toBe(false);
    expect(result.manifest.envId).toBe('train-central');
  });

  it('flags updateRequired when the installed client is older than minClientVersion', async () => {
    const manifest = signedManifest({ minClientVersion: '9.9.9' });
    const service = new ManifestService({
      userDataDir,
      appVersion: '1.0.0',
      publicKeyB64url: PUBLIC_KEY_B64URL,
      fetchImpl: (async () => jsonResponse(manifest)) as typeof fetch
    });

    const result = await service.load('train-central');
    expect(result.updateRequired).toBe(true);
  });

  it('falls back to the last-good cache when the network is unreachable', async () => {
    const manifest = signedManifest();
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount += 1;
      if (callCount === 1) {
        return jsonResponse(manifest);
      }
      throw new Error('network unreachable');
    }) as typeof fetch;

    const service = new ManifestService({ userDataDir, appVersion: '2.0.0', publicKeyB64url: PUBLIC_KEY_B64URL, fetchImpl });

    await service.load('train-central'); // populates cache
    const second = await service.load('train-central'); // network fails this time
    expect(second.offline).toBe(true);
    expect(second.manifest.envId).toBe('train-central');
  });

  it('hard-fails with no cache and unreachable network', async () => {
    const service = new ManifestService({
      userDataDir,
      appVersion: '2.0.0',
      publicKeyB64url: PUBLIC_KEY_B64URL,
      fetchImpl: (async () => {
        throw new Error('network unreachable');
      }) as typeof fetch
    });

    await expect(service.load('train-central')).rejects.toBeInstanceOf(ManifestUnavailableError);
  });

  it('hard-fails on an invalid signature without falling back to cache', async () => {
    const manifest = signedManifest();
    manifest['appUrl'] = 'https://evil.example.com'; // tamper after signing

    const service = new ManifestService({
      userDataDir,
      appVersion: '2.0.0',
      publicKeyB64url: PUBLIC_KEY_B64URL,
      fetchImpl: (async () => jsonResponse(manifest)) as typeof fetch
    });

    await expect(service.load('train-central')).rejects.toBeInstanceOf(ManifestSignatureError);
  });
});
