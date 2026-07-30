// src/shared/types.ts
//
// Single source of truth for cross-process data shapes. Both the main
// process and the (isolated) preload/renderer code import from here so a
// shape change can't silently drift between the side that produces it and
// the side that trusts it.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment manifest (fetched from https://config.innovacare.app/environments/{envId}.json)
// ---------------------------------------------------------------------------

export const OidcConfigSchema = z.object({
  issuer: z.string().url(),
  clientId: z.string().min(1),
  scopes: z.array(z.string().min(1)).min(1)
});

export const CertificatePinSchema = z.object({
  host: z.string().min(1),
  // Base64 SHA-256 of the certificate's SubjectPublicKeyInfo (RFC 7469 style).
  spkiSha256: z.string().min(1)
});

// `signature` is verified separately (see signature.ts) against the exact
// bytes received over the wire; the Zod schema only validates the *shape*
// of a payload that has already passed signature verification. Validating
// shape before signature would let an attacker probe the parser with
// arbitrary unsigned JSON, so callers MUST check the signature first.
export const EnvironmentManifestSchema = z.object({
  envId: z.string().min(1),
  displayName: z.string().min(1),
  appUrl: z.string().url(),
  minClientVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'must be a semver string'),
  allowedOrigins: z.array(z.string().min(1)).min(1),
  idleTimeoutSeconds: z.number().int().positive(),
  oidc: OidcConfigSchema,
  featureFlags: z.record(z.string(), z.boolean()),
  certificatePins: z.array(CertificatePinSchema).optional(),
  // Not part of the Hyperdrive-style spec's example payload, but required in
  // practice so the splash ribbon/border can distinguish prod from non-prod
  // without string-matching envId. Defaults to "production" when absent so
  // older signed manifests do not fail validation.
  tier: z.enum(['production', 'train', 'test']).default('production'),
  signature: z.string().min(1)
});

export type EnvironmentManifest = z.infer<typeof EnvironmentManifestSchema>;

// The subset of fields covered by the Ed25519 signature — everything except
// `signature` itself. Keep this derivation in one place so signing (dev
// script) and verifying (runtime) can never disagree about what was signed.
export function manifestSignedFields(
  manifest: Record<string, unknown>
): Record<string, unknown> {
  const { signature: _signature, ...rest } = manifest;
  return rest;
}

// ---------------------------------------------------------------------------
// Known environment list bundled into the app for the splash picker
// ---------------------------------------------------------------------------

export interface KnownEnvironment {
  envId: string;
  label: string;
  tier: 'production' | 'train' | 'test';
}

// ---------------------------------------------------------------------------
// Device / launcher info surfaced to the renderer
// ---------------------------------------------------------------------------

export interface DeviceInfo {
  workstationId: string;
  osVersion: string;
  clientVersion: string;
}

export interface RendererEnvironmentInfo {
  envId: string;
  displayName: string;
  tier: 'production' | 'train' | 'test';
  featureFlags: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const AuditEventTypeSchema = z.enum([
  'launch',
  'environment-selected',
  'auth-success',
  'auth-failure',
  'lock',
  'unlock',
  'print',
  'crash',
  'update-check',
  'update-installed',
  'manifest-verify-failed',
  'navigation-blocked'
]);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

// Detail values are restricted to primitives so a caller can't accidentally
// smuggle a PHI-bearing object graph into the audit log — see audit-log.ts.
export const AuditEventSchema = z.object({
  type: AuditEventTypeSchema,
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional()
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export interface AuditLogRecord extends AuditEvent {
  timestamp: string;
  envId: string | null;
}

// ---------------------------------------------------------------------------
// Splash <-> main IPC status
// ---------------------------------------------------------------------------

export type SplashStatus =
  | 'checking-for-updates'
  | 'downloading-update'
  | 'verifying-configuration'
  | 'opening'
  | 'authenticating'
  | 'error';

export interface SplashStatusUpdate {
  status: SplashStatus;
  detail?: string;
}

export interface SplashErrorPayload {
  message: string;
  code: string;
  correlationId: string;
}
