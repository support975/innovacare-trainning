// src/main/ipc/schemas.ts
//
// Every channel the preload bridge is allowed to invoke, plus the Zod schema
// for its payload. `IPC_CHANNELS` is the allowlist handlers.ts checks
// incoming `ipcMain.handle` registrations against — a channel that isn't a
// key here can never be wired up, so a typo or a future "generic passthrough"
// channel fails closed instead of silently accepting anything.
import { z } from 'zod';
import { AuditEventSchema } from '../../shared/types';

export const PrintDocumentSchema = z.object({
  // HTML content only — never a file:// or remote URL, which would let a
  // compromised renderer exfiltrate local files via the print pipeline.
  html: z.string().min(1).max(2_000_000),
  documentTitle: z.string().min(1).max(200),
  // When omitted, the manifest-configured default clinical printer is used.
  printerName: z.string().min(1).max(200).optional(),
  copies: z.number().int().min(1).max(10).default(1)
});
export type PrintDocumentPayload = z.infer<typeof PrintDocumentSchema>;

export const NoPayloadSchema = z.undefined();

export const WriteAuditEventSchema = AuditEventSchema;

// Channel name -> input schema. `NoPayloadSchema` channels still run through
// `.parse(undefined)` so a caller that *does* send an argument is rejected
// rather than silently ignored.
export const IPC_CHANNELS = {
  'env:get': NoPayloadSchema,
  'device:get-info': NoPayloadSchema,
  'print:document': PrintDocumentSchema,
  'badge:scan': NoPayloadSchema,
  'session:extend': NoPayloadSchema,
  'audit:write-event': WriteAuditEventSchema
} as const;

export type IpcChannel = keyof typeof IPC_CHANNELS;

// Push (main -> renderer) events. Not part of the invoke allowlist above,
// listed here so preload/index.ts and idle-lock.ts agree on the string.
export const IPC_EVENTS = {
  idleWarning: 'session:idle-warning',
  idleLocked: 'session:idle-locked'
} as const;

// ---------------------------------------------------------------------------
// "Chrome" channels — used only by the launcher's own splash/picker/lock-
// overlay windows (src/splash), never exposed to the remote InnovaClinic
// content window. Kept in a separate allowlist so the two trust boundaries
// (launcher-owned UI vs. remote web app) can never be confused with each
// other, even though both go through the same validate-then-dispatch
// pattern in handlers.ts.
export const SelectEnvironmentSchema = z.object({
  envId: z.string().min(1).max(100)
});
export type SelectEnvironmentPayload = z.infer<typeof SelectEnvironmentSchema>;

export const CHROME_IPC_CHANNELS = {
  'chrome:init': NoPayloadSchema,
  'chrome:select-environment': SelectEnvironmentSchema,
  'chrome:unlock': NoPayloadSchema,
  'chrome:cancel': NoPayloadSchema
} as const;

export type ChromeIpcChannel = keyof typeof CHROME_IPC_CHANNELS;

export const CHROME_IPC_EVENTS = {
  status: 'chrome:status',
  error: 'chrome:error',
  locked: 'chrome:locked'
} as const;
