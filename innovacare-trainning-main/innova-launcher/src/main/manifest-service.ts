// src/main/manifest-service.ts
//
// Fetches, verifies, validates, and caches per-environment manifests.
// Order of operations matters: signature verification MUST happen before
// Zod shape validation, and both MUST happen before any field of the
// manifest is trusted (including on a cache-fallback read) — see
// verifyAndParse() below.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { EnvironmentManifest, EnvironmentManifestSchema, KnownEnvironment } from '../shared/types';
import { ManifestSignatureError, verifyManifestSignature } from './signature';

// Bundled list surfaced in the splash environment picker. Selecting one only
// determines *which* manifest URL to fetch — every field actually used at
// runtime still comes from the signed manifest, never from this list.
export const KNOWN_ENVIRONMENTS: KnownEnvironment[] = [
  { envId: 'prod-eastern', label: 'InnovaClinic Production — Eastern', tier: 'production' },
  { envId: 'prod-western', label: 'InnovaClinic Production — Western', tier: 'production' },
  { envId: 'train-central', label: 'InnovaClinic Training', tier: 'train' },
  { envId: 'test-qa', label: 'InnovaClinic QA / Test', tier: 'test' }
];

export class ManifestValidationError extends Error {
  constructor(message: string, public readonly issues?: unknown) {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

export class ManifestUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestUnavailableError';
  }
}

export interface ManifestLoadResult {
  manifest: EnvironmentManifest;
  /** True when this manifest came from local cache because the network fetch failed. */
  offline: boolean;
  /** True when the installed client is older than manifest.minClientVersion. */
  updateRequired: boolean;
}

interface ManifestServiceOptions {
  userDataDir: string;
  appVersion: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  publicKeyB64url?: string;
}

export class ManifestService {
  private readonly userDataDir: string;
  private readonly appVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly publicKeyB64url: string | undefined;

  constructor(options: ManifestServiceOptions) {
    this.userDataDir = options.userDataDir;
    this.appVersion = options.appVersion;
    this.baseUrl = options.baseUrl ?? 'https://config.innovacare.app/environments';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.publicKeyB64url = options.publicKeyB64url;
  }

  private cachePath(envId: string): string {
    // envId is drawn from KNOWN_ENVIRONMENTS (a fixed bundled list), never
    // from unvalidated user input, so it is safe to interpolate into a path.
    return path.join(this.userDataDir, 'manifest-cache', `${envId}.json`);
  }

  /** Verifies signature, then shape. Never returns a manifest that failed either check. */
  private verifyAndParse(raw: unknown): EnvironmentManifest {
    if (typeof raw !== 'object' || raw === null) {
      throw new ManifestValidationError('Manifest payload is not a JSON object');
    }
    verifyManifestSignature(raw as Record<string, unknown>, this.publicKeyB64url);

    const result = EnvironmentManifestSchema.safeParse(raw);
    if (!result.success) {
      throw new ManifestValidationError('Manifest failed schema validation', result.error.issues);
    }
    return result.data;
  }

  private async fetchRemote(envId: string): Promise<EnvironmentManifest> {
    const url = `${this.baseUrl}/${encodeURIComponent(envId)}.json`;
    const response = await this.fetchImpl(url, {
      headers: { accept: 'application/json' },
      // Manifests gate security-relevant behavior; never serve a stale
      // browser/CDN cache copy silently — our own on-disk cache below is
      // the intended offline fallback, with a visible "offline" banner.
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new ManifestUnavailableError(`Manifest fetch failed with HTTP ${response.status}`);
    }
    const raw = await response.json();
    return this.verifyAndParse(raw);
  }

  private async readCache(envId: string): Promise<EnvironmentManifest | null> {
    try {
      const contents = await fs.readFile(this.cachePath(envId), 'utf8');
      const raw = JSON.parse(contents);
      // Re-verify on every read: a cached file living on local disk is a
      // weaker trust boundary than the HTTPS fetch, so treat it the same as
      // a fresh network payload rather than assuming our own past write.
      return this.verifyAndParse(raw);
    } catch {
      return null;
    }
  }

  private async writeCache(envId: string, manifest: EnvironmentManifest): Promise<void> {
    const target = this.cachePath(envId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(manifest, null, 2), 'utf8');
  }

  /**
   * Loads the manifest for `envId`: tries the network first, falls back to
   * the last-good signed cache on any network/HTTP failure, and hard-fails
   * only when neither source yields a validly signed manifest.
   */
  async load(envId: string): Promise<ManifestLoadResult> {
    let manifest: EnvironmentManifest;
    let offline = false;

    try {
      manifest = await this.fetchRemote(envId);
      await this.writeCache(envId, manifest);
    } catch (networkError) {
      if (networkError instanceof ManifestSignatureError || networkError instanceof ManifestValidationError) {
        // A reachable server that serves a badly signed/shaped manifest is
        // not a "go offline" condition — it's an attack or a broken
        // deployment, and must hard-fail rather than silently degrade.
        throw networkError;
      }
      const cached = await this.readCache(envId);
      if (!cached) {
        throw new ManifestUnavailableError(
          `Environment "${envId}" is unreachable and no valid cached configuration exists`
        );
      }
      manifest = cached;
      offline = true;
    }

    const updateRequired = semver.lt(this.appVersion, manifest.minClientVersion);
    return { manifest, offline, updateRequired };
  }
}
