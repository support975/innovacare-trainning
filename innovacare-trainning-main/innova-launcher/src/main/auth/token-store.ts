// src/main/auth/token-store.ts
//
// Persists the OIDC refresh token to disk, encrypted at rest via Electron's
// `safeStorage` (OS keychain on macOS, DPAPI on Windows, libsecret on
// Linux). We deliberately chose `safeStorage` over `keytar` (the spec
// offers either): keytar is an unmaintained native module that regularly
// breaks Electron rebuilds across OS/arch combinations, while safeStorage
// ships in Electron itself and backs onto the same OS-native secret stores.
// See README "Remaining Work" for the Linux caveat (no keychain daemon ->
// safeStorage falls back to a weaker obfuscation, not real encryption).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';

export class TokenStoreUnavailableError extends Error {
  constructor() {
    super('OS-level secret storage is not available on this machine');
    this.name = 'TokenStoreUnavailableError';
  }
}

export interface StoredTokens {
  refreshToken: string;
  /** ISO-8601 timestamp; used only to decide whether a silent refresh should be attempted first. */
  obtainedAt: string;
}

export class TokenStore {
  private readonly filePath: string;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, 'auth', 'token-store.enc');
  }

  private assertAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new TokenStoreUnavailableError();
    }
  }

  async save(tokens: StoredTokens): Promise<void> {
    this.assertAvailable();
    const plaintext = JSON.stringify(tokens);
    const encrypted = safeStorage.encryptString(plaintext);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // 0o600: readable/writable only by the owning OS user, matching the
    // confidentiality safeStorage's encryption already provides.
    await fs.writeFile(this.filePath, encrypted, { mode: 0o600 });
  }

  async load(): Promise<StoredTokens | null> {
    this.assertAvailable();
    let encrypted: Buffer;
    try {
      encrypted = await fs.readFile(this.filePath);
    } catch {
      return null;
    }
    try {
      const plaintext = safeStorage.decryptString(encrypted);
      return JSON.parse(plaintext) as StoredTokens;
    } catch {
      // Corrupt or undecryptable (e.g. OS keychain changed) — treat as
      // absent rather than throwing, so the caller just re-runs login.
      return null;
    }
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}
