import { InjectionToken } from '@angular/core';

/**
 * Vendor-agnostic contract for remote-proctoring providers (Talview today,
 * swappable later). Every consumer in the app — the precheck flow, the
 * runner shell, the manager review queue — depends only on this interface,
 * never on a vendor-specific shape. Swapping vendors means writing a new
 * implementation of this interface (and its backend mirror in
 * functions/src/proctoring/adapter.ts) and changing the provider below;
 * nothing else in the app should need to change.
 */
export interface RemoteProctoringSession {
  vendorSessionId: string;
  /** Short-lived token/config the vendor's SDK needs to mount its widget. Opaque to the app. */
  launchToken: string;
  sdkConfig: Record<string, unknown>;
}

export interface RemoteProctoringFlag {
  id: string;
  severity: 'low' | 'medium' | 'high';
  type: string;
  detectedAt: unknown;
  details?: string;
}

export interface RemoteProctoringIdentityResult {
  verified: boolean;
  reason?: string;
}

export interface CreateRemoteProctoringSessionParams {
  sessionId: string;
  candidateUid: string;
  candidateName: string;
  candidateEmail: string;
  examDurationMinutes: number;
}

export interface RemoteProctoringAdapter {
  readonly vendorId: string;

  /** Calls the createRemoteProctoringSession Cloud Function and returns the vendor session. */
  createSession(params: CreateRemoteProctoringSessionParams): Promise<RemoteProctoringSession>;

  /** Mounts the vendor's widget (ID capture, live monitoring UI) into the given container. */
  mountWidget(container: HTMLElement, session: RemoteProctoringSession): Promise<void>;

  /** Tears down the widget and releases camera/mic. Always safe to call, even if never mounted. */
  unmountWidget(): void;

  /** Fires whenever the vendor (or webhook-driven Firestore update) reports a new violation flag. */
  onFlag(cb: (flag: RemoteProctoringFlag) => void): void;

  /** Fires once identity verification resolves (approved or rejected). */
  onIdentityResult(cb: (result: RemoteProctoringIdentityResult) => void): void;

  /** Ends the vendor session (exam submitted, or candidate abandoned the flow). */
  endSession(vendorSessionId: string): Promise<void>;
}

export const REMOTE_PROCTORING_ADAPTER = new InjectionToken<RemoteProctoringAdapter>(
  'REMOTE_PROCTORING_ADAPTER'
);
