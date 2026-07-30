// test/signature.test.ts
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify, verifyManifestSignature, ManifestSignatureError } from '../src/main/signature';
import { manifestSignedFields } from '../src/shared/types';

function makeKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' }) as { x: string };
  return { privateKey, publicKeyB64url: publicJwk.x };
}

function signManifest(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], manifest: Record<string, unknown>) {
  const canonical = canonicalJsonStringify(manifestSignedFields(manifest));
  return cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
}

describe('canonicalJsonStringify', () => {
  it('sorts object keys regardless of insertion order', () => {
    const a = canonicalJsonStringify({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalJsonStringify({ c: { y: 2, z: 1 }, a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('preserves array order', () => {
    expect(canonicalJsonStringify({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
  });
});

describe('verifyManifestSignature', () => {
  it('accepts a validly signed manifest', () => {
    const { privateKey, publicKeyB64url } = makeKeypair();
    const manifest: Record<string, unknown> = { envId: 'train-central', appUrl: 'https://clinic.example.com' };
    manifest.signature = signManifest(privateKey, manifest);

    expect(() => verifyManifestSignature(manifest, publicKeyB64url)).not.toThrow();
  });

  it('rejects a manifest whose field was tampered with after signing', () => {
    const { privateKey, publicKeyB64url } = makeKeypair();
    const manifest: Record<string, unknown> = { envId: 'train-central', appUrl: 'https://clinic.example.com' };
    manifest.signature = signManifest(privateKey, manifest);

    manifest.appUrl = 'https://evil.example.com';

    expect(() => verifyManifestSignature(manifest, publicKeyB64url)).toThrow(ManifestSignatureError);
  });

  it('rejects a manifest signed by a different key', () => {
    const { privateKey } = makeKeypair();
    const { publicKeyB64url: otherPublicKey } = makeKeypair();
    const manifest: Record<string, unknown> = { envId: 'train-central' };
    manifest.signature = signManifest(privateKey, manifest);

    expect(() => verifyManifestSignature(manifest, otherPublicKey)).toThrow(ManifestSignatureError);
  });

  it('rejects a manifest with no signature field', () => {
    const { publicKeyB64url } = makeKeypair();
    expect(() => verifyManifestSignature({ envId: 'train-central' }, publicKeyB64url)).toThrow(
      ManifestSignatureError
    );
  });
});
