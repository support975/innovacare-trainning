// src/main/signature.ts
//
// Ed25519 signature verification for environment manifests. This is the
// root of trust for the entire launcher: every other manifest check (shape,
// version gate, allowed origins) only runs *after* this passes, and a
// failure here must hard-fail rather than fall back to an unsigned payload.
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { manifestSignedFields } from '../shared/types';

// Compiled into the binary at build time — this is the only key the
// launcher will ever trust. Rotate by shipping a new client build, not by
// fetching a key over the network (that would just move the trust problem).
//
// ASSUMPTION: placeholder key for this scaffold. An organization deploying
// InnovaLauncher MUST replace this with its own Ed25519 public key (see
// scripts/sign-manifest.ts for keypair generation) before shipping.
export const MANIFEST_SIGNING_PUBLIC_KEY_B64URL =
  process.env.INNOVA_MANIFEST_PUBLIC_KEY ?? 'REPLACE_WITH_BASE64URL_ED25519_PUBLIC_KEY';

/**
 * Deterministically serializes a JSON-compatible value: object keys are
 * sorted recursively, arrays keep their original order. Both the signer
 * (scripts/sign-manifest.ts) and the verifier below must produce byte-
 * identical output for the same logical document, or every signature would
 * fail to verify.
 */
export function canonicalJsonStringify(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${serialize(obj[key])}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize value of type ${typeof value}`);
}

function loadPublicKey(base64url: string) {
  if (base64url === 'REPLACE_WITH_BASE64URL_ED25519_PUBLIC_KEY') {
    throw new Error(
      'No manifest signing public key configured. Set INNOVA_MANIFEST_PUBLIC_KEY at build time.'
    );
  }
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: base64url },
    format: 'jwk'
  });
}

export class ManifestSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestSignatureError';
  }
}

/**
 * Verifies `manifest.signature` (base64) against the canonical JSON of every
 * other field, using the compiled-in public key. Throws on any failure —
 * callers must never treat a thrown error as "proceed without verification".
 */
export function verifyManifestSignature(
  manifest: Record<string, unknown>,
  publicKeyB64url: string = MANIFEST_SIGNING_PUBLIC_KEY_B64URL
): void {
  const signatureB64 = manifest['signature'];
  if (typeof signatureB64 !== 'string' || signatureB64.length === 0) {
    throw new ManifestSignatureError('Manifest is missing a signature field');
  }

  const signedFields = manifestSignedFields(manifest);
  const canonical = canonicalJsonStringify(signedFields);
  const message = Buffer.from(canonical, 'utf8');
  const signature = Buffer.from(signatureB64, 'base64');

  const publicKey = loadPublicKey(publicKeyB64url);

  // The `null` algorithm argument is required for Ed25519 in Node's crypto
  // module — it is a pure EdDSA scheme and does not take a digest algorithm.
  const isValid = cryptoVerify(null, message, publicKey, signature);
  if (!isValid) {
    throw new ManifestSignatureError('Manifest signature verification failed');
  }
}
