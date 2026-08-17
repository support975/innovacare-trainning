/* eslint-disable max-len */
/**
 * Vendor-agnostic backend contract for remote-proctoring providers. Mirrors
 * the frontend interface in src/app/data/remote-proctoring-adapter.ts.
 * Everything in functions/src/index.ts that talks to a proctoring vendor
 * (createRemoteProctoringSession, talviewWebhook) should depend only on
 * this shape, never on Talview-specific field names — the real
 * implementation lives entirely in talview-adapter.ts (Phase 5, blocked on
 * vendor credentials); until then requests are served by mock-adapter.ts.
 */

export interface RemoteProctoringVendorSession {
  vendorSessionId: string;
  launchToken: string;
  sdkConfig: Record<string, unknown>;
}

export type RemoteProctoringNormalizedEventType =
  | "identity_verified"
  | "identity_rejected"
  | "flag_raised"
  | "session_completed"
  | "session_terminated";

export interface RemoteProctoringNormalizedEvent {
  type: RemoteProctoringNormalizedEventType;
  vendorSessionId: string;
  payload: {
    reason?: string;
    flag?: {
      severity: "low" | "medium" | "high";
      type: string;
      details?: string;
      evidenceUrl?: string;
    };
  };
}

export interface CreateVendorSessionParams {
  sessionId: string;
  candidateUid: string;
  candidateName: string;
  candidateEmail: string;
  examDurationMinutes: number;
}

export interface RemoteProctoringVendorAdapter {
  readonly vendorId: string;

  createVendorSession(params: CreateVendorSessionParams): Promise<RemoteProctoringVendorSession>;

  /** Verifies the webhook request's signature; throws if invalid. */
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): void;

  /** Parses an already-signature-verified webhook body into the normalized event shape. */
  parseWebhookEvent(rawBody: Buffer): RemoteProctoringNormalizedEvent;
}
