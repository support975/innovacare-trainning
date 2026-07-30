// src/main/audit-log.ts
//
// Append-only local audit trail. The IPC-facing schema (AuditEventSchema)
// restricts `detail` to string/number/boolean primitives, which is the
// actual mechanism preventing PHI or token leakage into this file — there
// is no field wide enough to carry a patient record or a bearer token by
// accident. Callers must still choose identifiers, not clinical content,
// as those primitive values.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AuditEvent, AuditLogRecord } from '../shared/types';

const ROTATE_AT_BYTES = 10 * 1024 * 1024; // 10MB

export class AuditLogger {
  private readonly dir: string;
  private readonly currentPath: string;
  private envId: string | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(userDataDir: string) {
    this.dir = path.join(userDataDir, 'audit');
    this.currentPath = path.join(this.dir, 'audit.jsonl');
  }

  setEnvironment(envId: string | null): void {
    this.envId = envId;
  }

  /** Appends one JSONL record. Writes are serialized so rotation can never interleave with a concurrent append. */
  log(event: AuditEvent): Promise<void> {
    const record: AuditLogRecord = {
      ...event,
      timestamp: new Date().toISOString(),
      envId: this.envId
    };
    this.writeQueue = this.writeQueue
      .then(() => this.rotateIfNeeded())
      .then(() => fs.mkdir(this.dir, { recursive: true }))
      .then(() => fs.appendFile(this.currentPath, `${JSON.stringify(record)}\n`, 'utf8'))
      .catch((error) => {
        // Audit logging must never crash the app or block clinical work —
        // surface to stderr for support diagnostics and move on.
        console.error('[audit-log] failed to write audit record', error);
      });
    return this.writeQueue;
  }

  private async rotateIfNeeded(): Promise<void> {
    let size: number;
    try {
      size = (await fs.stat(this.currentPath)).size;
    } catch {
      return; // File does not exist yet — nothing to rotate.
    }
    if (size < ROTATE_AT_BYTES) {
      return;
    }
    const archivePath = path.join(this.dir, `audit-${Date.now()}.jsonl`);
    await fs.rename(this.currentPath, archivePath);
  }
}
