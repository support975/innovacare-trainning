import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

/**
 * Reports a failed email/password login attempt to the
 * recordLoginFailure Cloud Function, which feeds the admin
 * login-failure-burst alert (functions/src/index.ts: onLoginFailureBurst).
 * Fire-and-forget by design: a reporting failure must never surface to the
 * user or affect the existing login error UX.
 */
@Injectable({ providedIn: 'root' })
export class LoginFailureReporterService {
  private readonly functions = inject(Functions);

  report(email: string): void {
    const trimmed = email.trim();
    if (!trimmed) return;
    const callable = httpsCallable<{ email: string }, { recorded: boolean }>(
      this.functions,
      'recordLoginFailure'
    );
    callable({ email: trimmed }).catch(() => {
      // Best-effort only - never let this affect the login flow.
    });
  }
}
