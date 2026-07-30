// test/schemas.test.ts
import { describe, expect, it } from 'vitest';
import { PrintDocumentSchema, IPC_CHANNELS, NoPayloadSchema } from '../src/main/ipc/schemas';
import { AuditEventSchema } from '../src/shared/types';

describe('PrintDocumentSchema', () => {
  it('accepts a minimal valid payload and defaults copies to 1', () => {
    const parsed = PrintDocumentSchema.parse({ html: '<p>hi</p>', documentTitle: 'Consent Form' });
    expect(parsed.copies).toBe(1);
  });

  it('rejects an empty html body', () => {
    expect(() => PrintDocumentSchema.parse({ html: '', documentTitle: 'x' })).toThrow();
  });

  it('rejects more than the maximum allowed copies', () => {
    expect(() => PrintDocumentSchema.parse({ html: '<p>hi</p>', documentTitle: 'x', copies: 999 })).toThrow();
  });
});

describe('AuditEventSchema', () => {
  it('accepts primitive detail values', () => {
    expect(() => AuditEventSchema.parse({ type: 'lock', detail: { reason: 'idle-timeout', seconds: 900 } })).not.toThrow();
  });

  it('rejects a non-primitive (object/array) detail value, which would risk smuggling structured PHI', () => {
    expect(() => AuditEventSchema.parse({ type: 'print', detail: { payload: { nested: true } } })).toThrow();
  });

  it('rejects an unknown event type', () => {
    expect(() => AuditEventSchema.parse({ type: 'not-a-real-event' })).toThrow();
  });
});

describe('IPC_CHANNELS allowlist', () => {
  it('rejects an argument on a no-payload channel', () => {
    expect(() => NoPayloadSchema.parse({ unexpected: true })).toThrow();
  });

  it('does not include a generic passthrough channel', () => {
    expect(Object.keys(IPC_CHANNELS)).not.toContain('invoke');
    expect(Object.keys(IPC_CHANNELS)).not.toContain('generic');
  });
});
