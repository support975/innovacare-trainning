/* eslint-disable max-len, require-jsdoc */
import {nanoid} from "nanoid";
import {
  CreateVendorSessionParams,
  RemoteProctoringNormalizedEvent,
  RemoteProctoringVendorAdapter,
  RemoteProctoringVendorSession,
} from "./adapter.js";

/**
 * Stand-in used until TALVIEW_API_KEY is configured (see index.ts's
 * adapter-selection logic). Simulates a vendor session being created
 * instantly with no real ID/biometric check performed — the calling
 * function (createRemoteProctoringSession in index.ts) is responsible for
 * writing an immediate 'identity_verified' status plus an occasional seeded
 * flag so the rest of the pipeline (precheck polling, review queue) is
 * exercisable end-to-end without a vendor account. This adapter itself
 * never touches Firestore.
 */
export class MockRemoteProctoringAdapter implements RemoteProctoringVendorAdapter {
  readonly vendorId = "mock";

  async createVendorSession(params: CreateVendorSessionParams): Promise<RemoteProctoringVendorSession> {
    return {
      vendorSessionId: `mock_${nanoid(16)}`,
      launchToken: `mock_token_${nanoid(24)}`,
      sdkConfig: {mock: true, candidateName: params.candidateName},
    };
  }

  verifyWebhookSignature(): void {
    // No real webhook calls happen against the mock adapter — the Cloud
    // Function simulates state transitions directly instead of relying on
    // an inbound webhook. This is intentionally a no-op, not a security gap:
    // talviewWebhook always uses the real adapter's verification regardless
    // of which adapter created the session (see index.ts).
  }

  parseWebhookEvent(): RemoteProctoringNormalizedEvent {
    throw new Error("MockRemoteProctoringAdapter does not receive webhook calls.");
  }
}
