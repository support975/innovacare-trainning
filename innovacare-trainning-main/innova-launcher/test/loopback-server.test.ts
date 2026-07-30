// test/loopback-server.test.ts
import { describe, expect, it } from 'vitest';
import { LoopbackAuthError, startLoopbackServer } from '../src/main/auth/loopback-server';

describe('startLoopbackServer', () => {
  it('binds to 127.0.0.1 on an ephemeral port', async () => {
    const handle = await startLoopbackServer();
    try {
      expect(handle.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    } finally {
      handle.close();
    }
  });

  it('resolves with code/state on a valid callback request', async () => {
    const handle = await startLoopbackServer();
    try {
      const callbackUrl = new URL(handle.redirectUri);
      callbackUrl.searchParams.set('code', 'abc123');
      callbackUrl.searchParams.set('state', 'xyz789');

      const response = await fetch(callbackUrl.toString());
      expect(response.status).toBe(200);

      const result = await handle.result;
      expect(result).toEqual({ code: 'abc123', state: 'xyz789' });
    } finally {
      handle.close();
    }
  });

  it('rejects when the IdP redirects with an error parameter', async () => {
    const handle = await startLoopbackServer();
    // Attach a handler immediately so Node doesn't flag this as an
    // unhandled rejection during the `await fetch(...)` below — the
    // `.rejects` assertion re-uses the same promise afterwards.
    const resultAssertion = expect(handle.result).rejects.toBeInstanceOf(LoopbackAuthError);
    try {
      const callbackUrl = new URL(handle.redirectUri);
      callbackUrl.searchParams.set('error', 'access_denied');
      await fetch(callbackUrl.toString());

      await resultAssertion;
    } finally {
      handle.close();
    }
  });

  it('returns 404 for any path other than /callback', async () => {
    const handle = await startLoopbackServer();
    try {
      const other = new URL(handle.redirectUri);
      other.pathname = '/not-callback';
      const response = await fetch(other.toString());
      expect(response.status).toBe(404);
    } finally {
      handle.close();
    }
  });
});
