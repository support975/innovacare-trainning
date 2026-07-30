// scripts/sign-manifest.ts
//
// Dev tool: generates an Ed25519 keypair, or signs an environment manifest
// with an existing private key. Never run against production keys from a
// shared/CI machine without a hardware-backed key store — this script
// reads a raw private key JWK from disk for local development convenience
// only (see README "Remaining Work").
//
// Usage:
//   tsx scripts/sign-manifest.ts genkey [out-prefix]
//   tsx scripts/sign-manifest.ts sign <manifest.json> <private-key.jwk.json> [out.json]
import { createPrivateKey, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { canonicalJsonStringify } from '../src/main/signature';
import { manifestSignedFields } from '../src/shared/types';

interface Ed25519JwkPrivate {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
  d: string;
}

async function genkey(outPrefix: string): Promise<void> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const privateJwk = privateKey.export({ format: 'jwk' }) as Ed25519JwkPrivate;

  await fs.writeFile(`${outPrefix}.public.jwk.json`, JSON.stringify({ x: publicJwk.x }, null, 2));
  await fs.writeFile(`${outPrefix}.private.jwk.json`, JSON.stringify(privateJwk, null, 2), { mode: 0o600 });

  console.log(`Wrote ${outPrefix}.public.jwk.json and ${outPrefix}.private.jwk.json`);
  console.log(`Public key (INNOVA_MANIFEST_PUBLIC_KEY build-time value): ${publicJwk.x}`);
}

async function signManifest(manifestPath: string, privateKeyPath: string, outPath: string): Promise<void> {
  const manifestRaw = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  const jwk = JSON.parse(await fs.readFile(privateKeyPath, 'utf8')) as Ed25519JwkPrivate;
  const privateKey = createPrivateKey({ key: jwk, format: 'jwk' });

  const signedFields = manifestSignedFields(manifestRaw);
  const canonical = canonicalJsonStringify(signedFields);
  const signature = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');

  const signedManifest = { ...signedFields, signature };
  await fs.writeFile(outPath, JSON.stringify(signedManifest, null, 2));
  console.log(`Wrote signed manifest to ${outPath}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'genkey') {
    await genkey(rest[0] ?? 'manifest-signing-key');
    return;
  }

  if (command === 'sign') {
    const [manifestPath, privateKeyPath, outPath] = rest;
    if (!manifestPath || !privateKeyPath) {
      throw new Error('Usage: sign-manifest.ts sign <manifest.json> <private-key.jwk.json> [out.json]');
    }
    await signManifest(manifestPath, privateKeyPath, outPath ?? manifestPath.replace(/\.json$/, '.signed.json'));
    return;
  }

  console.error('Usage:\n  sign-manifest.ts genkey [out-prefix]\n  sign-manifest.ts sign <manifest.json> <private-key.jwk.json> [out.json]');
  process.exitCode = 1;
}

void main();
