import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  CreateRemoteProctoringSessionParams,
  RemoteProctoringAdapter,
  RemoteProctoringFlag,
  RemoteProctoringIdentityResult,
  RemoteProctoringSession,
} from './remote-proctoring-adapter';

/**
 * Development/demo adapter used until real Talview credentials are
 * configured (see functions/src/proctoring/mock-adapter.ts, which is what
 * actually decides mock vs. real behavior server-side). The frontend side
 * here just needs to render *something* in place of the vendor's widget and
 * relay whatever the backend decided — it never fabricates verification
 * results on its own, since only the Cloud Function may write proctoring
 * state (see the remoteProctoring rules in firestore.rules).
 */
@Injectable({ providedIn: 'root' })
export class MockRemoteProctoringAdapter implements RemoteProctoringAdapter {
  readonly vendorId = 'talview';

  private readonly functions = inject(Functions);
  private flagCb: ((flag: RemoteProctoringFlag) => void) | null = null;
  private identityCb: ((result: RemoteProctoringIdentityResult) => void) | null = null;
  private widgetEl: HTMLElement | null = null;

  async createSession(params: CreateRemoteProctoringSessionParams): Promise<RemoteProctoringSession> {
    const callable = httpsCallable<
      CreateRemoteProctoringSessionParams,
      { vendorSessionId: string; launchToken: string; sdkConfig: Record<string, unknown> }
    >(this.functions, 'createRemoteProctoringSession');
    const result = await callable(params);
    return result.data;
  }

  async mountWidget(container: HTMLElement, session: RemoteProctoringSession): Promise<void> {
    this.unmountWidget();
    const el = document.createElement('div');
    el.className = 'mock-proctoring-widget';
    el.setAttribute('data-vendor-session', session.vendorSessionId);
    el.innerHTML = `
      <div style="border:2px dashed #94a3b8;border-radius:12px;padding:24px;text-align:center;color:#475569;background:#f8fafc">
        <strong>[DEV] Simulated proctoring widget</strong>
        <p style="margin:8px 0 0;font-size:13px">No real vendor is configured yet — this placeholder stands in for
        Talview's identity-verification and monitoring widget. Verification state below is driven by the backend
        mock adapter, not this component.</p>
      </div>`;
    container.appendChild(el);
    this.widgetEl = el;
  }

  unmountWidget(): void {
    this.widgetEl?.remove();
    this.widgetEl = null;
  }

  onFlag(cb: (flag: RemoteProctoringFlag) => void): void {
    this.flagCb = cb;
  }

  onIdentityResult(cb: (result: RemoteProctoringIdentityResult) => void): void {
    this.identityCb = cb;
  }

  /** Exposed for the precheck component to relay a Firestore-observed result — see remote-proctoring polling. */
  emitIdentityResult(result: RemoteProctoringIdentityResult): void {
    this.identityCb?.(result);
  }

  emitFlag(flag: RemoteProctoringFlag): void {
    this.flagCb?.(flag);
  }

  async endSession(): Promise<void> {
    this.unmountWidget();
  }
}
